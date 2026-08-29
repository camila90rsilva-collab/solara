import { createClient } from '@/utils/supabase/server'

interface Titulo {
  cod_titulo: string
  valor: number
  vencimento: string
  status: string
  cod_cliente: string
}

interface Lancamento {
  data: string
  descricao: string
  valor: number
  tipo: 'credito' | 'debito'
}

interface ResultadoCasamento {
  lancamento_indice: number
  situacao: 'casado' | 'divergente' | 'ignorado'
  cod_titulo_casado?: string
  tipo_divergencia?: string
  titulos_candidatos?: Titulo[]
}

export async function casarTitulos(
  lancamentos: Lancamento[],
  extrato_id: string,
  titulos?: Titulo[]
): Promise<ResultadoCasamento[]> {
  const supabase = await createClient()

  // Se não forneceu títulos, buscar do BD
  if (!titulos) {
    const { data } = await supabase.from('titulos_receber').select('*')
    titulos = data || []
  }

  const resultados: ResultadoCasamento[] = []

  for (let i = 0; i < lancamentos.length; i++) {
    const lancamento = lancamentos[i]

    // Ignorar débitos
    if (lancamento.tipo === 'debito') {
      resultados.push({
        lancamento_indice: i,
        situacao: 'ignorado',
      })
      continue
    }

    // Créditos: tentar casar
    const nfMatch = lancamento.descricao.match(/NF-(\d+)/i)
    const nfNumero = nfMatch ? nfMatch[1] : null

    let casado = false
    let titulo_casado: Titulo | undefined

    // 1. Procurar por NF e valor exato
    if (nfNumero) {
      titulo_casado = titulos.find(
        (t) =>
          t.cod_titulo.includes(`NF-${nfNumero}`) &&
          Math.abs(t.valor - lancamento.valor) < 0.01 &&
          t.status === 'aberto'
      )

      if (titulo_casado) {
        casado = true
      }
    }

    // 2. Procurar por valor exato e vencimento próximo
    if (!casado) {
      titulo_casado = titulos.find((t) => {
        if (Math.abs(t.valor - lancamento.valor) > 0.01) return false
        if (t.status !== 'aberto') return false

        const diffDias = Math.abs(
          (new Date(t.vencimento).getTime() - new Date(lancamento.data).getTime()) / (1000 * 60 * 60 * 24)
        )
        return diffDias <= 5
      })

      if (titulo_casado) {
        casado = true
      }
    }

    if (casado && titulo_casado) {
      resultados.push({
        lancamento_indice: i,
        situacao: 'casado',
        cod_titulo_casado: titulo_casado.cod_titulo,
      })
    } else {
      // Divergência
      let tipo_divergencia = 'sem_titulo_correspondente'

      if (nfNumero) {
        const tituloPorNF = titulos.find((t) => t.cod_titulo.includes(`NF-${nfNumero}`))
        if (tituloPorNF) {
          tipo_divergencia = 'valor_diferente_mesma_nf'
        }
      }

      // Procurar possível soma
      const possiveisDosSomas = titulos.filter(
        (t) => t.status === 'aberto' && Math.abs(t.valor - lancamento.valor / 2) < 0.01
      )
      if (possiveisDosSomas.length >= 2) {
        tipo_divergencia = 'possivel_soma'
      }

      // Procurar duplicado
      const jaCasado = lancamentos
        .slice(0, i)
        .some((l) => Math.abs(l.valor - lancamento.valor) < 0.01)
      if (jaCasado) {
        tipo_divergencia = 'duplicado'
      }

      // Candidatos (mesmo cliente, valor próximo, vencimento próximo)
      const titulos_candidatos = titulos.filter(
        (t) =>
          Math.abs(t.valor - lancamento.valor) < lancamento.valor * 0.1 &&
          new Date(t.vencimento).getTime() <
            new Date(lancamento.data).getTime() + 30 * 24 * 60 * 60 * 1000
      )

      resultados.push({
        lancamento_indice: i,
        situacao: 'divergente',
        tipo_divergencia,
        titulos_candidatos,
      })
    }
  }

  return resultados
}
