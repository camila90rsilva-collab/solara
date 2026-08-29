'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/utils/supabase/client'

interface Execucao {
  id: string
  agente: string
  status: string
  tokens_entrada?: number
  tokens_saida?: number
  inicio: string
  fim?: string
  entrada?: Record<string, any>
  saida?: Record<string, any>
  erro?: string
}

export function LinhaDoTempo({ item_id }: { item_id: string }) {
  const supabase = createClient()
  const [execucoes, setExecucoes] = useState<Execucao[]>([])
  const [expandido, setExpandido] = useState<string | null>(null)

  useEffect(() => {
    const loadExecucoes = async () => {
      const { data } = await supabase
        .from('execucoes_agentes')
        .select('*')
        .eq('item_id', item_id)
        .order('inicio', { ascending: true })

      if (data) setExecucoes(data)
    }

    loadExecucoes()

    const channel = supabase
      .channel(`linha-tempo-${item_id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'execucoes_agentes',
          filter: `item_id=eq.${item_id}`,
        },
        () => loadExecucoes()
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [item_id, supabase])

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <h3 className="text-lg font-semibold mb-4">Histórico de Execução</h3>

      {execucoes.length === 0 ? (
        <div className="text-center text-gray-500 py-8">Nenhuma execução ainda</div>
      ) : (
        <div className="space-y-2">
          {execucoes.map((exec, idx) => {
            const tempo = exec.fim
              ? Math.round(
                  (new Date(exec.fim).getTime() - new Date(exec.inicio).getTime()) / 1000
                )
              : null
            const tokens = (exec.tokens_entrada || 0) + (exec.tokens_saida || 0)

            let statusBg = 'bg-gray-100'
            let statusText = 'text-gray-700'

            if (exec.status === 'ok') {
              statusBg = 'bg-green-100'
              statusText = 'text-green-900'
            } else if (exec.status === 'erro') {
              statusBg = 'bg-red-100'
              statusText = 'text-red-900'
            } else if (exec.status === 'rodando') {
              statusBg = 'bg-yellow-100'
              statusText = 'text-yellow-900'
            }

            return (
              <div key={exec.id} className="border rounded">
                <button
                  onClick={() => setExpandido(expandido === exec.id ? null : exec.id)}
                  className={`w-full p-3 text-left ${statusBg} hover:opacity-80 transition-opacity`}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <div className={`font-medium ${statusText}`}>{exec.agente}</div>
                      <div className="text-sm text-gray-600 mt-1">
                        {new Date(exec.inicio).toLocaleTimeString('pt-BR')}
                        {tempo && ` · ${tempo}s`}
                        {tokens > 0 && ` · ${tokens} tokens`}
                      </div>
                    </div>
                    <div className={`text-sm font-medium ${statusText}`}>{exec.status}</div>
                  </div>
                </button>

                {expandido === exec.id && (
                  <div className="p-4 bg-gray-50 border-t space-y-4">
                    {exec.entrada && (
                      <div>
                        <h4 className="font-medium text-sm mb-2">Entrada</h4>
                        <pre className="bg-white p-2 rounded text-xs overflow-x-auto border">
                          {JSON.stringify(exec.entrada, null, 2)}
                        </pre>
                      </div>
                    )}

                    {exec.saida && (
                      <div>
                        <h4 className="font-medium text-sm mb-2">Saída</h4>
                        <pre className="bg-white p-2 rounded text-xs overflow-x-auto border">
                          {JSON.stringify(exec.saida, null, 2)}
                        </pre>
                      </div>
                    )}

                    {exec.erro && (
                      <div>
                        <h4 className="font-medium text-sm mb-2 text-red-700">Erro</h4>
                        <pre className="bg-white p-2 rounded text-xs text-red-700 border border-red-200">
                          {exec.erro}
                        </pre>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
