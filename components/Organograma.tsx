'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/utils/supabase/client'
import type { RealtimeChannel } from '@supabase/supabase-js'

interface Execucao {
  id: string
  agente: string
  status: 'rodando' | 'ok' | 'erro'
  tokens_entrada?: number
  tokens_saida?: number
  inicio: string
  fim?: string
}

const AGENTES_VENDAS = ['triador', 'pesquisador', 'redator', 'revisor']
const AGENTES_FINANCEIRO = ['investigador', 'consolidador', 'revisor']

export function Organograma({ area, item_id }: { area: string; item_id: string }) {
  const supabase = createClient()
  const [execucoes, setExecucoes] = useState<Record<string, Execucao>>({})
  const [conexao, setConexao] = useState(false)

  useEffect(() => {
    let channel: RealtimeChannel

    const setupRealtime = async () => {
      // Carregar execuções existentes
      const { data } = await supabase
        .from('execucoes_agentes')
        .select('*')
        .eq('item_id', item_id)

      if (data) {
        const mapa: Record<string, Execucao> = {}
        data.forEach((exec) => {
          mapa[exec.agente] = {
            id: exec.id,
            agente: exec.agente,
            status: exec.status,
            tokens_entrada: exec.tokens_entrada,
            tokens_saida: exec.tokens_saida,
            inicio: exec.inicio,
            fim: exec.fim,
          }
        })
        setExecucoes(mapa)
      }

      // Assinar Realtime
      channel = supabase
        .channel(`execucoes-${item_id}`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'execucoes_agentes',
            filter: `item_id=eq.${item_id}`,
          },
          (payload) => {
            const exec = payload.new as Execucao
            setExecucoes((prev) => ({
              ...prev,
              [exec.agente]: exec,
            }))
          }
        )
        .subscribe(() => setConexao(true))
    }

    setupRealtime()

    return () => {
      if (channel) {
        supabase.removeChannel(channel)
      }
    }
  }, [item_id, supabase])

  const agentes = area === 'vendas' ? AGENTES_VENDAS : AGENTES_FINANCEIRO

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-lg font-semibold">Processamento</h3>
        <div className={`w-2 h-2 rounded-full ${conexao ? 'bg-green-500' : 'bg-gray-300'}`} />
      </div>

      <div className="space-y-6">
        {/* Orquestrador */}
        <div className="flex justify-center">
          <div className="px-6 py-3 bg-blue-100 border-2 border-blue-400 rounded-lg text-center min-w-40">
            <div className="font-medium text-blue-900">Orquestrador</div>
          </div>
        </div>

        {/* Agentes */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {agentes.map((agente_nome) => {
            const exec = execucoes[agente_nome]
            const status = exec?.status || 'idle'
            const tempo = exec?.fim
              ? Math.round(
                  (new Date(exec.fim).getTime() - new Date(exec.inicio).getTime()) / 1000
                )
              : null

            let bgColor = 'bg-gray-100 border-gray-300'
            let textColor = 'text-gray-700'

            if (status === 'rodando') {
              bgColor = 'bg-yellow-100 border-yellow-400 animate-pulse'
              textColor = 'text-yellow-900'
            } else if (status === 'ok') {
              bgColor = 'bg-green-100 border-green-400'
              textColor = 'text-green-900'
            } else if (status === 'erro') {
              bgColor = 'bg-red-100 border-red-400'
              textColor = 'text-red-900'
            }

            return (
              <div key={agente_nome} className="flex flex-col items-center">
                {/* Seta do orquestrador */}
                {exec && <div className="h-8 w-px bg-gray-300 mb-2" />}

                <div
                  className={`w-full px-3 py-2 border-2 rounded text-center ${bgColor} ${textColor}`}
                >
                  <div className="font-medium text-sm">{agente_nome}</div>
                  {exec && status === 'ok' && (
                    <div className="text-xs mt-1">
                      {tempo}s · {(exec.tokens_entrada || 0) + (exec.tokens_saida || 0)} tokens
                    </div>
                  )}
                  {exec && status === 'rodando' && <div className="text-xs mt-1">processando...</div>}
                  {exec && status === 'erro' && <div className="text-xs mt-1">erro</div>}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
