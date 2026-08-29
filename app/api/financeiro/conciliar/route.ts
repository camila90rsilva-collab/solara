import { orquestradorFinanceiro } from '@/lib/orquestradores/financeiro'
import { NextRequest, NextResponse } from 'next/server'

export const maxDuration = 60

export async function POST(request: NextRequest) {
  try {
    const { extrato_id } = await request.json()

    if (!extrato_id) {
      return NextResponse.json(
        { erro: 'extrato_id é obrigatório' },
        { status: 400 }
      )
    }

    await orquestradorFinanceiro({ extrato_id })

    return NextResponse.json({ sucesso: true })
  } catch (erro) {
    console.error(erro)
    return NextResponse.json(
      {
        erro: erro instanceof Error ? erro.message : 'Erro ao conciliar',
      },
      { status: 500 }
    )
  }
}
