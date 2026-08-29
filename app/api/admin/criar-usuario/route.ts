import { createClient } from '@/utils/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()

    // Verificar se é admin
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ erro: 'Não autenticado' }, { status: 401 })
    }

    const { data: perfil } = await supabase
      .from('perfis')
      .select('papel')
      .eq('id', user.id)
      .single()

    if (perfil?.papel !== 'admin') {
      return NextResponse.json({ erro: 'Acesso negado' }, { status: 403 })
    }

    const { email, password, nome, papel, areas } = await request.json()

    if (!email || !password || !nome) {
      return NextResponse.json(
        { erro: 'Email, senha e nome são obrigatórios' },
        { status: 400 }
      )
    }

    // Usar service role para criar usuário
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL

    if (!serviceRoleKey || !supabaseUrl) {
      return NextResponse.json(
        { erro: 'Configuração de servidor incompleta' },
        { status: 500 }
      )
    }

    const { createClient: createServiceClient } = await import('@supabase/supabase-js')
    const supabaseAdmin = createServiceClient(supabaseUrl, serviceRoleKey)

    // Criar usuário no Auth
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    })

    if (authError || !authData.user) {
      return NextResponse.json(
        { erro: authError?.message || 'Erro ao criar usuário' },
        { status: 400 }
      )
    }

    // Criar perfil
    const { error: perfilError } = await supabase
      .from('perfis')
      .insert({
        id: authData.user.id,
        email,
        nome,
        papel,
        areas,
      })

    if (perfilError) {
      // Deletar usuário do Auth se falhar ao criar perfil
      await supabaseAdmin.auth.admin.deleteUser(authData.user.id)
      return NextResponse.json(
        { erro: 'Erro ao criar perfil: ' + perfilError.message },
        { status: 400 }
      )
    }

    return NextResponse.json({ sucesso: true })
  } catch (erro) {
    console.error(erro)
    return NextResponse.json(
      { erro: 'Erro interno do servidor' },
      { status: 500 }
    )
  }
}
