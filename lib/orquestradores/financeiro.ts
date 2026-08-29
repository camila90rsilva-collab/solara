import { agente } from '@/lib/agente'
import { createClient } from '@/utils/supabase/server'
import { limparExtrato } from '@/lib/financeiro/limpar'
import { casarTitulos } from '@/lib/financeiro/casar'

interface ProcessarFinanceiroInput {
  extrato_id: string
}

export async function orquestradorFinanceiro(input: ProcessarFinanceiroInput) {
  const supabase = await createClient()

  // 1. Carregar extrato
  const { data: extrato, error: extratoError } = await supabase
    .from('extratos_importados')
    .select('*')
    .eq('id', input.extrato_id)
    .single()

  if (extratoError || !extrato) {
    throw new Error('Extrato não encontrado')
  }

  // 2. Carregar lançamentos e títulos
  const { data: lancamentos } = await supabase
    .from('lancamentos')
    .select('*')
    .eq('extrato_id', input.extrato_id)

  const { data: titulos } = await supabase.from('titulos_receber').select('*')

  if (!lancamentos || lancamentos.length === 0) {
    throw new Error('Nenhum lançamento encontrado')
  }

  // Converter para formato esperado
  const lancamentosFormatados = lancamentos.map((l) => ({
    data: l.data,
    descricao: l.descricao,
    valor: l.valor,
    tipo: l.tipo as 'credito' | 'debito',
  }))

  // 3. Casar títulos (código determinístico)
  const casamentos = await casarTitulos(lancamentosFormatados, input.extrato_id, titulos)

  // Criar divergências e atualizar lançamentos
  const divergencias_ids: string[] = []

  for (const casamento of casamentos) {
    const lancamento = lancamentos[casamento.lancamento_indice]

    if (casamento.situacao === 'casado') {
      await supabase
        .from('lancamentos')
        .update({
          situacao: 'casado',
          cod_titulo_casado: casamento.cod_titulo_casado,
        })
        .eq('id', lancamento.id)
    } else if (casamento.situacao === 'divergente') {
      const { data: divData } = await supabase
        .from('divergencias')
        .insert({
          extrato_id: input.extrato_id,
          tipo_inicial: casamento.tipo_divergencia,
          lancamento_id: lancamento.id,
          valor_lancamento: lancamento.valor,
          status: 'investigando',
        })
        .select('id')
        .single()

      if (divData) {
        divergencias_ids.push(divData.id)
      }

      await supabase
        .from('lancamentos')
        .update({ situacao: 'divergente' })
        .eq('id', lancamento.id)
    } else {
      await supabase
        .from('lancamentos')
        .update({ situacao: 'ignorado' })
        .eq('id', lancamento.id)
    }
  }

  // 4. Criar execução raiz
  const { data: execRaiz } = await supabase
    .from('execucoes_agentes')
    .insert({
      area: 'financeiro',
      item_tipo: 'divergencia',
      item_id: input.extrato_id,
      agente: 'orquestrador',
      status: 'rodando',
      entrada: { extrato_id: input.extrato_id },
      inicio: new Date().toISOString(),
    })
    .select('id')
    .single()

  if (!execRaiz) {
    throw new Error('Erro ao criar execução raiz')
  }

  // 5. Investigador - um por divergência em paralelo
  const investigacoes = await Promise.all(
    divergencias_ids.map(async (div_id) => {
      const { data: div } = await supabase
        .from('divergencias')
        .select('*')
        .eq('id', div_id)
        .single()

      if (!div) return null

      try {
        const resultado = await agente(
          'investigador',
          {
            divergencia: div,
            lancamento: lancamentos.find((l) => l.id === div.lancamento_id),
            titulos_candidatos: titulos?.filter(
              (t) =>
                Math.abs(t.valor - div.valor_lancamento) < div.valor_lancamento * 0.1 &&
                new Date(t.vencimento).getTime() <
                  new Date(div.lancamento_id ? lancamentos[0].data : '2099-01-01').getTime() +
                    30 * 24 * 60 * 60 * 1000
            ) || [],
          },
          {
            area: 'financeiro',
            item_tipo: 'divergencia',
            item_id: div_id,
            chamado_por: execRaiz.id,
          }
        )

        // Atualizar divergência com hipótese
        await supabase
          .from('divergencias')
          .update({ hipotese: resultado.saida })
          .eq('id', div_id)

        return resultado.saida
      } catch (erro) {
        console.error(`Erro ao investigar divergência ${div_id}:`, erro)
        return null
      }
    })
  )

  // 6. Consolidador
  const resumoCasamento = {
    qtd_casados: casamentos.filter((c) => c.situacao === 'casado').length,
    valor_casado: lancamentos
      .filter((l) => l.situacao === 'casado')
      .reduce((sum, l) => sum + l.valor, 0),
    qtd_divergencias: divergencias_ids.length,
    valor_divergente: lancamentos
      .filter((l) => l.situacao === 'divergente')
      .reduce((sum, l) => sum + l.valor, 0),
  }

  const consolidacao = await agente(
    'consolidador',
    {
      resumo_casamento: resumoCasamento,
      hipoteses: investigacoes.filter(Boolean),
    },
    {
      area: 'financeiro',
      item_tipo: 'divergencia',
      item_id: input.extrato_id,
      chamado_por: execRaiz.id,
    }
  )

  // 7. Revisor
  const revisao = await agente(
    'revisor',
    {
      hipoteses: investigacoes.filter(Boolean),
      titulos_abertos: titulos?.filter((t) => t.status === 'aberto') || [],
      relatorio: consolidacao.saida.relatorio_markdown,
    },
    {
      area: 'financeiro',
      item_tipo: 'divergencia',
      item_id: input.extrato_id,
      chamado_por: execRaiz.id,
    }
  )

  // 8. Criar aprovações para cada hipótese
  for (const hipotese of investigacoes.filter(Boolean)) {
    await supabase.from('aprovacoes').insert({
      area: 'financeiro',
      item_tipo: 'divergencia',
      item_id: input.extrato_id,
      titulo: `${hipotese.hipotese} · R$ ${hipotese.valor_lancamento}`,
      proposta: hipotese,
      status: 'pendente',
    })
  }

  // Fechar execução raiz
  await supabase
    .from('execucoes_agentes')
    .update({
      status: 'ok',
      saida: { investigacoes: investigacoes.length, relatorio_markdown: consolidacao.saida.relatorio_markdown },
      fim: new Date().toISOString(),
    })
    .eq('id', execRaiz.id)
}
