'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/utils/supabase/client'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Organograma } from '@/components/Organograma'
import { FilaAprovacao } from '@/components/FilaAprovacao'
import { limparExtrato } from '@/lib/financeiro/limpar'

interface Extrato {
  id: string
  nome_arquivo: string
  importado_em: string
}

interface Lancamento {
  id: string
  data: string
  descricao: string
  valor: number
  tipo: string
  situacao: string
}

interface Divergencia {
  id: string
  tipo_inicial: string
  valor_lancamento: number
  status: string
}

export default function FinanceiroPage() {
  const router = useRouter()
  const supabase = createClient()
  const [extratos, setExtratos] = useState<Extrato[]>([])
  const [extrato_selecionado, setExtratoSelecionado] = useState<Extrato | null>(null)
  const [lancamentos, setLancamentos] = useState<Lancamento[]>([])
  const [divergencias, setDivergencias] = useState<Divergencia[]>([])
  const [loading, setLoading] = useState(true)
  const [aba_ativa, setAbaAtiva] = useState<'import' | 'resultados' | 'relatorio' | 'aprovacoes'>(
    'import'
  )
  const [arquivo, setArquivo] = useState<File | null>(null)
  const [preview_antes, setPreviewAntes] = useState<string>('')
  const [preview_depois, setPreviewDepois] = useState<string>('')
  const [conciliando, setConciliando] = useState(false)

  useEffect(() => {
    const loadData = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.push('/login')
        return
      }

      // Verificar acesso
      const { data: perfil } = await supabase
        .from('perfis')
        .select('areas')
        .eq('id', user.id)
        .single()

      if (!perfil?.areas?.includes('financeiro')) {
        router.push('/')
        return
      }

      // Carregar extratos
      const { data: extratosData } = await supabase
        .from('extratos_importados')
        .select('*')
        .order('importado_em', { ascending: false })

      if (extratosData) {
        setExtratos(extratosData)
        if (extratosData.length > 0) {
          const primeiro = extratosData[0]
          setExtratoSelecionado(primeiro)

          // Carregar lançamentos
          const { data: lancamentosData } = await supabase
            .from('lancamentos')
            .select('*')
            .eq('extrato_id', primeiro.id)
          if (lancamentosData) setLancamentos(lancamentosData)

          // Carregar divergências
          const { data: divergenciasData } = await supabase
            .from('divergencias')
            .select('*')
            .eq('extrato_id', primeiro.id)
          if (divergenciasData) setDivergencias(divergenciasData)
        }
      }

      setLoading(false)
    }

    loadData()
  }, [supabase, router])

  const handleUploadArquivo = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files?.[0]) return

    const file = e.target.files[0]
    setArquivo(file)

    // Ler e fazer preview
    const reader = new FileReader()
    reader.onload = (event) => {
      const conteudo = event.target?.result as string
      setPreviewAntes(conteudo.split('\n').slice(0, 6).join('\n'))

      try {
        const linhas = limparExtrato(conteudo)
        const previewLinhas = linhas.slice(0, 6).map((l) => `${l.data} | ${l.descricao} | ${l.valor} | ${l.tipo}`)
        setPreviewDepois(previewLinhas.join('\n'))
      } catch (erro) {
        setPreviewDepois(`Erro ao limpar: ${erro instanceof Error ? erro.message : 'desconhecido'}`)
      }
    }
    reader.readAsText(file, 'utf-8')
  }

  const handleImportarArquivo = async () => {
    if (!arquivo) {
      alert('Selecione um arquivo')
      return
    }

    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      // Ler arquivo
      const conteudo = await arquivo.text()
      const linhas = limparExtrato(conteudo)

      // Criar extrato_importado
      const { data: extratoData } = await supabase
        .from('extratos_importados')
        .insert({
          nome_arquivo: arquivo.name,
          importado_por: user.id,
          total_linhas: linhas.length,
          total_creditos: linhas
            .filter((l) => l.tipo === 'credito')
            .reduce((sum, l) => sum + l.valor, 0),
        })
        .select()
        .single()

      if (!extratoData) throw new Error('Erro ao criar extrato')

      // Inserir lançamentos
      const lancamentosParaInserir = linhas.map((l) => ({
        extrato_id: extratoData.id,
        data: l.data,
        descricao: l.descricao,
        valor: l.valor,
        tipo: l.tipo,
      }))

      await supabase.from('lancamentos').insert(lancamentosParaInserir)

      // Recarregar
      const { data: extratosData } = await supabase
        .from('extratos_importados')
        .select('*')
        .order('importado_em', { ascending: false })

      if (extratosData) {
        setExtratos(extratosData)
        setExtratoSelecionado(extratosData[0])
      }

      setArquivo(null)
      setPreviewAntes('')
      setPreviewDepois('')
    } catch (erro) {
      alert(`Erro ao importar: ${erro instanceof Error ? erro.message : 'desconhecido'}`)
    }
  }

  const handleConciliar = async () => {
    if (!extrato_selecionado) return

    setConciliando(true)
    try {
      const response = await fetch('/api/financeiro/conciliar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ extrato_id: extrato_selecionado.id }),
      })

      if (!response.ok) {
        const data = await response.json()
        alert(`Erro: ${data.erro}`)
      } else {
        setAbaAtiva('resultados')
        // Recarregar dados
        const { data: lancamentosData } = await supabase
          .from('lancamentos')
          .select('*')
          .eq('extrato_id', extrato_selecionado.id)
        if (lancamentosData) setLancamentos(lancamentosData)

        const { data: divergenciasData } = await supabase
          .from('divergencias')
          .select('*')
          .eq('extrato_id', extrato_selecionado.id)
        if (divergenciasData) setDivergencias(divergenciasData)
      }
    } catch (erro) {
      alert('Erro ao conciliar')
    } finally {
      setConciliando(false)
    }
  }

  if (loading) {
    return <div className="flex items-center justify-center h-screen">Carregando...</div>
  }

  const casados = lancamentos.filter((l) => l.situacao === 'casado')
  const divergentes = divergencias.filter((d) => d.status === 'aguardando_aprovacao')
  const ignorados = lancamentos.filter((l) => l.situacao === 'ignorado')

  return (
    <main className="min-h-screen bg-gray-50">
      <div className="container mx-auto px-4 py-8">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-3xl font-bold">Financeiro</h1>
          <Link href="/" className="px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700">
            Voltar
          </Link>
        </div>

        {/* Organograma */}
        {extrato_selecionado && (
          <div className="mb-8">
            <Organograma area="financeiro" item_id={extrato_selecionado.id} />
          </div>
        )}

        {/* Abas */}
        <div className="flex gap-4 mb-8 border-b">
          <button
            onClick={() => setAbaAtiva('import')}
            className={`px-4 py-2 font-medium ${
              aba_ativa === 'import'
                ? 'border-b-2 border-indigo-600 text-indigo-600'
                : 'text-gray-600'
            }`}
          >
            Importar
          </button>
          <button
            onClick={() => setAbaAtiva('resultados')}
            className={`px-4 py-2 font-medium ${
              aba_ativa === 'resultados'
                ? 'border-b-2 border-indigo-600 text-indigo-600'
                : 'text-gray-600'
            }`}
          >
            Resultados
          </button>
          <button
            onClick={() => setAbaAtiva('aprovacoes')}
            className={`px-4 py-2 font-medium ${
              aba_ativa === 'aprovacoes'
                ? 'border-b-2 border-indigo-600 text-indigo-600'
                : 'text-gray-600'
            }`}
          >
            Aprovações
          </button>
        </div>

        {aba_ativa === 'import' && (
          <div className="bg-white rounded-lg shadow p-6">
            <div className="mb-6">
              <label className="block text-sm font-medium mb-2">Upload de Extrato</label>
              <input
                type="file"
                accept=".csv"
                onChange={handleUploadArquivo}
                className="block w-full text-sm border rounded px-3 py-2"
              />
            </div>

            {preview_antes && (
              <div className="grid grid-cols-2 gap-4 mb-6">
                <div>
                  <h3 className="font-medium mb-2">Antes</h3>
                  <pre className="bg-gray-50 p-3 text-xs overflow-auto h-40 border rounded">
                    {preview_antes}
                  </pre>
                </div>
                <div>
                  <h3 className="font-medium mb-2">Depois (limpo)</h3>
                  <pre className="bg-gray-50 p-3 text-xs overflow-auto h-40 border rounded">
                    {preview_depois}
                  </pre>
                </div>
              </div>
            )}

            {arquivo && (
              <button
                onClick={handleImportarArquivo}
                className="px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700"
              >
                Importar
              </button>
            )}

            {extrato_selecionado && (
              <div className="mt-6 pt-6 border-t">
                <button
                  onClick={handleConciliar}
                  disabled={conciliando}
                  className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50"
                >
                  {conciliando ? 'Conciliando...' : 'Conciliar'}
                </button>
              </div>
            )}
          </div>
        )}

        {aba_ativa === 'resultados' && (
          <div className="space-y-6">
            {/* Casados */}
            <div className="bg-white rounded-lg shadow p-6 border-l-4 border-green-500">
              <h3 className="text-lg font-semibold mb-4 text-green-700">
                Casados ({casados.length})
              </h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left py-2 px-3">Data</th>
                      <th className="text-left py-2 px-3">Descrição</th>
                      <th className="text-right py-2 px-3">Valor</th>
                      <th className="text-left py-2 px-3">Título</th>
                    </tr>
                  </thead>
                  <tbody>
                    {casados.slice(0, 10).map((l) => (
                      <tr key={l.id} className="border-b hover:bg-gray-50">
                        <td className="py-2 px-3">{l.data}</td>
                        <td className="py-2 px-3">{l.descricao}</td>
                        <td className="py-2 px-3 text-right">R$ {l.valor.toFixed(2)}</td>
                        <td className="py-2 px-3">{l.cod_titulo_casado}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Divergências */}
            <div className="bg-white rounded-lg shadow p-6 border-l-4 border-yellow-500">
              <h3 className="text-lg font-semibold mb-4 text-yellow-700">
                Divergências ({divergentes.length})
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {divergentes.map((d) => (
                  <div key={d.id} className="p-4 border rounded bg-yellow-50">
                    <div className="font-medium text-sm">{d.tipo_inicial}</div>
                    <div className="text-sm text-gray-600 mt-1">
                      R$ {d.valor_lancamento?.toFixed(2)}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Ignorados */}
            <div className="bg-white rounded-lg shadow p-6 border-l-4 border-gray-400">
              <h3 className="text-lg font-semibold mb-4 text-gray-700">
                Ignorados ({ignorados.length})
              </h3>
              <div className="text-sm text-gray-600">Débitos não processados</div>
            </div>
          </div>
        )}

        {aba_ativa === 'aprovacoes' && <FilaAprovacao area="financeiro" />}
      </div>
    </main>
  )
}
