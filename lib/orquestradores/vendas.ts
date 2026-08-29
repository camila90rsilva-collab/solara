import { agente } from '@/lib/agente'
import { createClient } from '@/utils/supabase/server'

interface ProcessarVendasInput {
  cod_pedido: string
}

export async function orquestradorVendas(input: ProcessarVendasInput) {
  const supabase = await createClient()

  // 1. Carregar pedido e cliente
  const { data: pedido, error: pedidoError } = await supabase
    .from('pedidos_orcamento')
    .select('*, clientes(cod_cliente, nome, segmento)')
    .eq('cod_pedido', input.cod_pedido)
    .single()

  if (pedidoError || !pedido) {
    throw new Error(`Pedido não encontrado: ${input.cod_pedido}`)
  }

  // Atualizar status para 'processando'
  await supabase
    .from('pedidos_orcamento')
    .update({ status: 'processando' })
    .eq('cod_pedido', input.cod_pedido)

  // Criar execução raiz (orquestrador)
  const { data: execRaiz, error: execRaizError } = await supabase
    .from('execucoes_agentes')
    .insert({
      area: 'vendas',
      item_tipo: 'pedido',
      item_id: input.cod_pedido,
      agente: 'orquestrador',
      status: 'rodando',
      entrada: { cod_pedido: input.cod_pedido },
      inicio: new Date().toISOString(),
    })
    .select('id')
    .single()

  if (execRaizError || !execRaiz) {
    throw new Error('Erro ao criar execução raiz')
  }

  const execucao_raiz_id = execRaiz.id

  try {
    // 2. Triador
    const triagem = await agente(
      'triador',
      {
        mensagem: pedido.mensagem,
        canal: pedido.canal,
        cliente: {
          cod_cliente: pedido.clientes.cod_cliente,
          nome: pedido.clientes.nome,
          segmento: pedido.clientes.segmento,
        },
      },
      {
        area: 'vendas',
        item_tipo: 'pedido',
        item_id: input.cod_pedido,
        chamado_por: execucao_raiz_id,
      }
    )

    // Se não for orçamento nem complemento, criar aprovação e encerrar
    if (triagem.saida.tipo !== 'orcamento' && triagem.saida.tipo !== 'complemento') {
      await supabase.from('aprovacoes').insert({
        area: 'vendas',
        item_tipo: 'pedido',
        item_id: input.cod_pedido,
        titulo: `Não é orçamento: ${triagem.saida.tipo}`,
        proposta: triagem.saida,
        status: 'pendente',
      })

      await supabase
        .from('pedidos_orcamento')
        .update({ status: 'aguardando_aprovacao' })
        .eq('cod_pedido', input.cod_pedido)

      await supabase
        .from('execucoes_agentes')
        .update({
          status: 'ok',
          saida: { encerrado: true },
          fim: new Date().toISOString(),
        })
        .eq('id', execucao_raiz_id)

      return
    }

    // 3. Pesquisador - buscar candidatos em paralelo
    const { data: produtos } = await supabase.from('produtos').select('*')
    const { data: pedidosAnteriores } = await supabase
      .from('pedidos_orcamento')
      .select('*')
      .eq('cod_cliente', pedido.cod_cliente)
      .gte('created_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())
      .neq('cod_pedido', input.cod_pedido)

    // Buscar candidatos por item
    const candidatos_por_item = triagem.saida.itens.map((item: any) => {
      const palavras = item.descricao_cliente.toLowerCase().split(' ')
      return {
        item_descricao: item.descricao_cliente,
        candidatos: (produtos || []).filter((p: any) =>
          palavras.some((p_palavra: string) =>
            p.descricao.toLowerCase().includes(p_palavra)
          )
        ),
      }
    })

    const contexto = await agente(
      'pesquisador',
      {
        itens_pedidos: triagem.saida.itens,
        candidatos_catalogo: candidatos_por_item,
        cliente: {
          cod_cliente: pedido.clientes.cod_cliente,
          nome: pedido.clientes.nome,
          prazo_pagamento_dias: 30, // padrão
          desconto_maximo_pct: 5, // padrão
          cliente_desde: pedido.clientes.created_at,
        },
        pedidos_anteriores: pedidosAnteriores,
      },
      {
        area: 'vendas',
        item_tipo: 'pedido',
        item_id: input.cod_pedido,
        chamado_por: execucao_raiz_id,
      }
    )

    // 4. Redator
    const redacao = await agente(
      'redator',
      {
        triagem: triagem.saida,
        contexto: contexto.saida,
        cliente: {
          nome: pedido.clientes.nome,
          segmento: pedido.clientes.segmento,
        },
      },
      {
        area: 'vendas',
        item_tipo: 'pedido',
        item_id: input.cod_pedido,
        chamado_por: execucao_raiz_id,
      }
    )

    // 5. Revisor (até 2 voltas)
    let revisao = await agente(
      'revisor',
      {
        resposta: redacao.saida.resposta,
        contexto: contexto.saida,
        regras: [
          'Não prometer entrega imediata de item cujo estoque não atende',
          'Não oferecer desconto acima do limite',
          'Não citar produto que não existe',
          'Preços corretos',
        ],
      },
      {
        area: 'vendas',
        item_tipo: 'pedido',
        item_id: input.cod_pedido,
        chamado_por: execucao_raiz_id,
      }
    )

    let volta = 1
    while (!revisao.saida.aprovado && volta < 2) {
      const redacao2 = await agente(
        'redator',
        {
          triagem: triagem.saida,
          contexto: contexto.saida,
          cliente: { nome: pedido.clientes.nome, segmento: pedido.clientes.segmento },
          ajustes: revisao.saida.motivos,
        },
        {
          area: 'vendas',
          item_tipo: 'pedido',
          item_id: input.cod_pedido,
          chamado_por: execucao_raiz_id,
        }
      )

      revisao = await agente(
        'revisor',
        {
          resposta: redacao2.saida.resposta,
          contexto: contexto.saida,
          regras: [
            'Não prometer entrega imediata de item cujo estoque não atende',
            'Não oferecer desconto acima do limite',
          ],
        },
        {
          area: 'vendas',
          item_tipo: 'pedido',
          item_id: input.cod_pedido,
          chamado_por: execucao_raiz_id,
        }
      )

      volta++
    }

    // 6. Criar aprovação
    await supabase.from('aprovacoes').insert({
      area: 'vendas',
      item_tipo: 'pedido',
      item_id: input.cod_pedido,
      titulo: `${pedido.clientes.nome} · ${redacao.saida.resumo}`,
      proposta: {
        resposta: redacao.saida.resposta,
        triagem: triagem.saida,
        contexto: contexto.saida,
        revisao: revisao.saida,
      },
      status: 'pendente',
    })

    await supabase
      .from('pedidos_orcamento')
      .update({ status: 'aguardando_aprovacao' })
      .eq('cod_pedido', input.cod_pedido)

    // Fechar execução raiz
    await supabase
      .from('execucoes_agentes')
      .update({
        status: 'ok',
        saida: { etapas_completas: 4 },
        fim: new Date().toISOString(),
      })
      .eq('id', execucao_raiz_id)
  } catch (erro) {
    await supabase
      .from('pedidos_orcamento')
      .update({ status: 'novo' })
      .eq('cod_pedido', input.cod_pedido)

    await supabase
      .from('execucoes_agentes')
      .update({
        status: 'erro',
        erro: erro instanceof Error ? erro.message : String(erro),
        fim: new Date().toISOString(),
      })
      .eq('id', execucao_raiz_id)

    throw erro
  }
}
