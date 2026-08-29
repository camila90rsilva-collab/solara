'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/utils/supabase/client'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Organograma } from '@/components/Organograma'
import { FilaAprovacao } from '@/components/FilaAprovacao'
import { LinhaDoTempo } from '@/components/LinhaDoTempo'

interface Pedido {
  cod_pedido: string
  status: string
  mensagem: string
  canal: string
  created_at: string
  clientes?: { nome: string }
}

interface Cliente {
  cod_cliente: string
  nome: string
}

export default function VendasPage() {
  const router = useRouter()
  const supabase = createClient()
  const [pedidos, setPedidos] = useState<Pedido[]>([])
  const [clientes, setClientes] = useState<Cliente[]>([])
  const [pedido_selecionado, setPedidoSelecionado] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [aba_ativa, setAbaAtiva] = useState<'kanban' | 'aprovacoes'>('kanban')
  const [modal_novo, setModalNovo] = useState(false)
  const [novo_pedido, setNovoPedido] = useState({
    cod_cliente: '',
    canal: 'email',
    mensagem: '',
  })
  const [processando, setProcessando] = useState<string | null>(null)

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

      if (!perfil?.areas?.includes('vendas')) {
        router.push('/')
        return
      }

      // Carregar pedidos
      const { data: pedidosData } = await supabase
        .from('pedidos_orcamento')
        .select('*, clientes(nome)')
        .order('created_at', { ascending: false })

      if (pedidosData) setPedidos(pedidosData)

      // Carregar clientes
      const { data: clientesData } = await supabase.from('clientes').select('cod_cliente, nome')
      if (clientesData) setClientes(clientesData)

      setLoading(false)
    }

    loadData()

    // Realtime para pedidos
    const channel = supabase
      .channel('pedidos-vendas')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'pedidos_orcamento',
        },
        () => {
          // Recarregar
          supabase
            .from('pedidos_orcamento')
            .select('*, clientes(nome)')
            .order('created_at', { ascending: false })
            .then(({ data }) => {
              if (data) setPedidos(data)
            })
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [supabase, router])

  const handleProcessar = async (cod_pedido: string) => {
    setProcessando(cod_pedido)
    try {
      const response = await fetch('/api/vendas/processar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cod_pedido }),
      })

      if (!response.ok) {
        const data = await response.json()
        alert(`Erro: ${data.erro}`)
      }
    } catch (erro) {
      alert('Erro ao processar pedido')
    } finally {
      setProcessando(null)
    }
  }

  const handleCriarPedido = async () => {
    if (!novo_pedido.cod_cliente || !novo_pedido.mensagem) {
      alert('Preencha cliente e mensagem')
      return
    }

    try {
      // Gerar próximo cod_pedido
      const ultimoPedido = pedidos[0]
      let proximo = 'PED001'
      if (ultimoPedido?.cod_pedido) {
        const num = parseInt(ultimoPedido.cod_pedido.replace('PED', '')) + 1
        proximo = `PED${String(num).padStart(3, '0')}`
      }

      const { error } = await supabase.from('pedidos_orcamento').insert({
        cod_pedido: proximo,
        cod_cliente: novo_pedido.cod_cliente,
        canal: novo_pedido.canal,
        mensagem: novo_pedido.mensagem,
        status: 'novo',
      })

      if (error) throw error

      setModalNovo(false)
      setNovoPedido({ cod_cliente: '', canal: 'email', mensagem: '' })
    } catch (erro) {
      alert('Erro ao criar pedido')
    }
  }

  if (loading) {
    return <div className="flex items-center justify-center h-screen">Carregando...</div>
  }

  const statuses = ['novo', 'processando', 'aguardando_aprovacao', 'respondido', 'rejeitado']
  const pedidoSelecionadoObj = pedidos.find((p) => p.cod_pedido === pedido_selecionado)

  return (
    <main className="min-h-screen bg-gray-50">
      <div className="container mx-auto px-4 py-8">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-3xl font-bold">Vendas</h1>
          <Link href="/" className="px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700">
            Voltar
          </Link>
        </div>

        {/* Organograma */}
        {pedido_selecionado && (
          <div className="mb-8">
            <Organograma area="vendas" item_id={pedido_selecionado} />
          </div>
        )}

        {/* Abas */}
        <div className="flex gap-4 mb-8 border-b">
          <button
            onClick={() => setAbaAtiva('kanban')}
            className={`px-4 py-2 font-medium ${
              aba_ativa === 'kanban'
                ? 'border-b-2 border-indigo-600 text-indigo-600'
                : 'text-gray-600'
            }`}
          >
            Kanban
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

        {aba_ativa === 'kanban' ? (
          <>
            <div className="flex gap-2 mb-4">
              <button
                onClick={() => setModalNovo(true)}
                className="px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700"
              >
                + Novo Pedido
              </button>
            </div>

            {/* Modal novo pedido */}
            {modal_novo && (
              <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                <div className="bg-white rounded-lg p-6 max-w-md w-full">
                  <h2 className="text-xl font-bold mb-4">Novo Pedido</h2>
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium mb-1">Cliente</label>
                      <select
                        value={novo_pedido.cod_cliente}
                        onChange={(e) =>
                          setNovoPedido({ ...novo_pedido, cod_cliente: e.target.value })
                        }
                        className="w-full px-3 py-2 border rounded"
                      >
                        <option value="">Selecione...</option>
                        {clientes.map((c) => (
                          <option key={c.cod_cliente} value={c.cod_cliente}>
                            {c.nome}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1">Canal</label>
                      <select
                        value={novo_pedido.canal}
                        onChange={(e) => setNovoPedido({ ...novo_pedido, canal: e.target.value })}
                        className="w-full px-3 py-2 border rounded"
                      >
                        <option value="email">E-mail</option>
                        <option value="whatsapp">WhatsApp</option>
                        <option value="telefone">Telefone</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1">Mensagem</label>
                      <textarea
                        value={novo_pedido.mensagem}
                        onChange={(e) =>
                          setNovoPedido({ ...novo_pedido, mensagem: e.target.value })
                        }
                        className="w-full px-3 py-2 border rounded h-32"
                      />
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={handleCriarPedido}
                        className="flex-1 px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700"
                      >
                        Criar
                      </button>
                      <button
                        onClick={() => setModalNovo(false)}
                        className="flex-1 px-4 py-2 bg-gray-300 text-gray-800 rounded hover:bg-gray-400"
                      >
                        Cancelar
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Kanban */}
            <div className="grid grid-cols-5 gap-4">
              {statuses.map((status) => (
                <div key={status} className="bg-white rounded-lg shadow p-4">
                  <h3 className="font-semibold mb-4 text-sm capitalize">{status.replace('_', ' ')}</h3>
                  <div className="space-y-2">
                    {pedidos
                      .filter((p) => p.status === status)
                      .map((pedido) => (
                        <div
                          key={pedido.cod_pedido}
                          onClick={() => setPedidoSelecionado(pedido.cod_pedido)}
                          className={`p-3 rounded border cursor-pointer text-sm ${
                            pedido_selecionado === pedido.cod_pedido
                              ? 'bg-indigo-100 border-indigo-400'
                              : 'bg-gray-50 border-gray-200 hover:border-gray-300'
                          }`}
                        >
                          <div className="font-medium">{pedido.cod_pedido}</div>
                          <div className="text-gray-600">{pedido.clientes?.nome}</div>
                          <div className="text-gray-500 text-xs mt-1">
                            {new Date(pedido.created_at).toLocaleDateString('pt-BR')}
                          </div>
                          <div className="text-gray-600 text-xs mt-2 line-clamp-2">
                            {pedido.mensagem.substring(0, 80)}
                          </div>
                          {status === 'novo' && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation()
                                handleProcessar(pedido.cod_pedido)
                              }}
                              disabled={processando === pedido.cod_pedido}
                              className="mt-2 w-full px-2 py-1 text-xs bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50"
                            >
                              {processando === pedido.cod_pedido ? 'Processando...' : 'Processar'}
                            </button>
                          )}
                        </div>
                      ))}
                  </div>
                </div>
              ))}
            </div>

            {/* Painel lateral */}
            {pedido_selecionado && pedidoSelecionadoObj && (
              <div className="fixed right-0 top-0 h-full w-96 bg-white shadow-lg p-6 overflow-y-auto">
                <button
                  onClick={() => setPedidoSelecionado(null)}
                  className="absolute top-4 right-4 text-gray-500 hover:text-gray-700"
                >
                  ✕
                </button>
                <h3 className="text-lg font-bold mb-4">{pedido_selecionado}</h3>
                <LinhaDoTempo item_id={pedido_selecionado} />
              </div>
            )}
          </>
        ) : (
          <FilaAprovacao area="vendas" />
        )}
      </div>
    </main>
  )
}
