import { orquestradorVendas } from '@/lib/orquestradores/vendas'
import { NextRequest, NextResponse } from 'next/server'

export const maxDuration = 60

export async function POST(request: NextRequest) {
  try {
    const { cod_pedido } = await request.json()

    if (!cod_pedido) {
      return NextResponse.json(
        { erro: 'cod_pedido é obrigatório' },
        { status: 400 }
      )
    }

    await orquestradorVendas({ cod_pedido })

    return NextResponse.json({ sucesso: true })
  } catch (erro) {
    console.error(erro)
    return NextResponse.json(
      {
        erro: erro instanceof Error ? erro.message : 'Erro ao processar pedido',
      },
      { status: 500 }
    )
  }
}
