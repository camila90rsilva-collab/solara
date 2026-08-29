import { Anthropic } from '@anthropic-ai/sdk'
import { createClient } from '@/utils/supabase/server'
import { promises as fs } from 'fs'
import path from 'path'

interface AgentContext {
  area: string
  item_tipo: string
  item_id: string
  chamado_por?: string
}

interface ExecutionResult {
  saida: Record<string, any>
  execucao_id: string
}

export async function agente(
  papel: string,
  entrada: Record<string, any>,
  contexto: AgentContext
): Promise<ExecutionResult> {
  const supabase = await createClient()

  let execucao_id: string = ''

  try {
    // 1. Criar execução com status 'rodando'
    const { data: execData, error: execError } = await supabase
      .from('execucoes_agentes')
      .insert({
        area: contexto.area,
        item_tipo: contexto.item_tipo,
        item_id: contexto.item_id,
        agente: papel,
        chamado_por: contexto.chamado_por || null,
        status: 'rodando',
        entrada,
        inicio: new Date().toISOString(),
      })
      .select('id')
      .single()

    if (execError) throw new Error(`Erro ao criar execução: ${execError.message}`)
    execucao_id = execData.id

    // 2. Ler prompt do arquivo
    const promptPath = path.join(
      process.cwd(),
      'solara-os',
      'prompts',
      contexto.area,
      `${papel}.md`
    )

    let systemPrompt: string
    try {
      systemPrompt = await fs.readFile(promptPath, 'utf-8')
    } catch {
      throw new Error(`Prompt não encontrado: ${promptPath}`)
    }

    // 3. Chamar API Anthropic
    const client = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    })

    const response = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2000,
      system: systemPrompt,
      messages: [
        {
          role: 'user',
          content: JSON.stringify(entrada),
        },
      ],
    })

    const textContent = response.content[0]
    if (textContent.type !== 'text') {
      throw new Error('Resposta não é texto')
    }

    // 4. Parse JSON e atualizar execução
    let saida: Record<string, any>
    try {
      saida = JSON.parse(textContent.text)
    } catch {
      throw new Error(`Resposta não é JSON válido: ${textContent.text}`)
    }

    const { error: updateError } = await supabase
      .from('execucoes_agentes')
      .update({
        status: 'ok',
        saida,
        tokens_entrada: response.usage.input_tokens,
        tokens_saida: response.usage.output_tokens,
        fim: new Date().toISOString(),
      })
      .eq('id', execucao_id)

    if (updateError) {
      throw new Error(`Erro ao atualizar execução: ${updateError.message}`)
    }

    return { saida, execucao_id }
  } catch (erro) {
    const mensagem_erro = erro instanceof Error ? erro.message : String(erro)

    if (execucao_id) {
      await supabase
        .from('execucoes_agentes')
        .update({
          status: 'erro',
          erro: mensagem_erro,
          fim: new Date().toISOString(),
        })
        .eq('id', execucao_id)
    }

    throw erro
  }
}
