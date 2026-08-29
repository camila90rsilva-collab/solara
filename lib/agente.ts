import { Anthropic } from '@anthropic-ai/sdk'

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
  // Implementação será feita quando os prompts estiverem prontos
  throw new Error('Agente não implementado ainda')
}
