'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/utils/supabase/client'
import type { RealtimeChannel } from '@supabase/supabase-js'

interface Aprovacao {
  id: string
  item_id: string
  titulo: string
  proposta: Record<string, any>
  status: string
  observacao?: string
}

export function FilaAprovacao({ area }: { area: string }) {
  const supabase = createClient()
  const [items, setItems] = useState<Aprovacao[]>([])
  const [expandido, setExpandido] = useState<string | null>(null)
  const [proposta_editada, setPropostaEditada] = useState<Record<string, any>>({})
  const [observacao, setObservacao] = useState('')
  const [usuario_id, setUsuarioId] = useState<string>('')

  useEffect(() => {
    const getUser = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) setUsuarioId(user.id)
    }
    getUser()

    // Carregar itens pendentes
    const loadItems = async () => {
      const { data } = await supabase
        .from('aprovacoes')
        .select('*')
        .eq('area', area)
        .eq('status', 'pendente')
        .order('created_at', { ascending: false })

      if (data) setItems(data)
    }

    loadItems()

    // Realtime
    const channel = supabase
      .channel(`aprovacoes-${area}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'aprovacoes',
          filter: `area=eq.${area}`,
        },
        () => loadItems()
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [area, supabase])

  const handleAprovar = async (id: string) => {
    await supabase
      .from('aprovacoes')
      .update({
        status: 'aprovada',
        decidido_por: usuario_id,
        decidido_em: new Date().toISOString(),
      })
      .eq('id', id)

    setItems(items.filter((i) => i.id !== id))
  }

  const handleEditar = async (id: string) => {
    await supabase
      .from('aprovacoes')
      .update({
        status: 'editada',
        proposta: proposta_editada,
        decidido_por: usuario_id,
        decidido_em: new Date().toISOString(),
      })
      .eq('id', id)

    setExpandido(null)
    setPropostaEditada({})
    setItems(items.filter((i) => i.id !== id))
  }

  const handleRejeitar = async (id: string) => {
    await supabase
      .from('aprovacoes')
      .update({
        status: 'rejeitada',
        decidido_por: usuario_id,
        decidido_em: new Date().toISOString(),
        observacao,
      })
      .eq('id', id)

    setExpandido(null)
    setObservacao('')
    setItems(items.filter((i) => i.id !== id))
  }

  return (
    <div className="bg-white rounded-lg shadow">
      <div className="p-6 border-b">
        <h3 className="text-lg font-semibold">Fila de Aprovação ({items.length})</h3>
      </div>

      {items.length === 0 ? (
        <div className="p-6 text-center text-gray-500">Nenhum item aguardando aprovação</div>
      ) : (
        <div className="divide-y">
          {items.map((item) => (
            <div key={item.id} className="p-4">
              <button
                onClick={() => setExpandido(expandido === item.id ? null : item.id)}
                className="w-full text-left hover:bg-gray-50 p-2 rounded"
              >
                <div className="font-medium">{item.titulo}</div>
                <div className="text-sm text-gray-500 mt-1">{item.item_id}</div>
              </button>

              {expandido === item.id && (
                <div className="mt-4 p-4 bg-gray-50 rounded space-y-4">
                  <div>
                    <label className="block text-sm font-medium mb-2">Proposta</label>
                    <textarea
                      value={JSON.stringify(proposta_editada || item.proposta, null, 2)}
                      onChange={(e) => {
                        try {
                          setPropostaEditada(JSON.parse(e.target.value))
                        } catch {
                          // JSON inválido, ignorar
                        }
                      }}
                      className="w-full h-48 p-2 border rounded font-mono text-sm"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-2">Observação (se rejeitar)</label>
                    <textarea
                      value={observacao}
                      onChange={(e) => setObservacao(e.target.value)}
                      className="w-full h-20 p-2 border rounded"
                      placeholder="Motivo da rejeição..."
                    />
                  </div>

                  <div className="flex gap-2">
                    <button
                      onClick={() => handleAprovar(item.id)}
                      className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700"
                    >
                      Aprovar
                    </button>
                    <button
                      onClick={() => handleEditar(item.id)}
                      className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
                    >
                      Salvar edição e aprovar
                    </button>
                    <button
                      onClick={() => handleRejeitar(item.id)}
                      className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
                    >
                      Rejeitar
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
