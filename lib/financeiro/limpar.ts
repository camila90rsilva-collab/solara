interface LinhaExtrato {
  data: string
  descricao: string
  valor: number
  tipo: 'credito' | 'debito'
}

export function limparExtrato(conteudo: string): LinhaExtrato[] {
  let linhas = conteudo.split('\n').map((l) => l.trim()).filter((l) => l)

  // Tentar detectar se é UTF-8 ou Latin-1
  // Se tiver caracteres estranhos, tentar re-decodificar não é possível em JS puro
  // Assumir UTF-8

  // Pular linhas até encontrar cabeçalho (Data, data, DATE, etc)
  let indexCabecalho = -1
  const palavrasCabecalho = ['data', 'date', 'data_operacao', 'data_lancamento']

  for (let i = 0; i < linhas.length; i++) {
    const linha = linhas[i].toLowerCase()
    if (palavrasCabecalho.some((p) => linha.includes(p))) {
      indexCabecalho = i
      break
    }
  }

  if (indexCabecalho === -1) {
    throw new Error('Cabeçalho não encontrado')
  }

  linhas = linhas.slice(indexCabecalho + 1)

  // Detectar separador
  const primeiraLinha = linhas[0]
  const separador = primeiraLinha.includes(';') ? ';' : ','

  const resultados: LinhaExtrato[] = []

  for (const linha of linhas) {
    // Ignorar linhas de SALDO
    if (linha.toUpperCase().includes('SALDO')) {
      continue
    }

    const partes = linha.split(separador).map((p) => p.trim())

    if (partes.length < 4) {
      continue
    }

    try {
      // Extrair data (dd/mm/yyyy para ISO)
      let dataStr = partes[0]
      const [dia, mes, ano] = dataStr.split('/')
      if (!ano || ano.length !== 4) {
        continue
      }
      const dataISO = `${ano}-${mes}-${dia}`
      if (isNaN(new Date(dataISO).getTime())) {
        continue
      }

      // Descrição
      const descricao = partes[1]

      // Valor - pode estar como 1.250,00 ou 1250.00
      let valorStr = partes[2]
      valorStr = valorStr.replace(/\./g, '').replace(',', '.')
      const valor = parseFloat(valorStr)
      if (isNaN(valor)) {
        continue
      }

      // Tipo
      const tipoStr = partes[3].toLowerCase()
      let tipo: 'credito' | 'debito'
      if (tipoStr.includes('credit') || tipoStr.includes('entrada') || tipoStr === '+') {
        tipo = 'credito'
      } else if (tipoStr.includes('debit') || tipoStr.includes('saida') || tipoStr === '-') {
        tipo = 'debito'
      } else {
        continue
      }

      resultados.push({
        data: dataISO,
        descricao,
        valor: Math.abs(valor),
        tipo,
      })
    } catch {
      // Ignorar linhas com erro
      continue
    }
  }

  return resultados
}
