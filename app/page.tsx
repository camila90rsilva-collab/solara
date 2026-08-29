'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/utils/supabase/client'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

interface Perfil {
  papel: string
  areas: string[]
}

export default function Home() {
  const router = useRouter()
  const supabase = createClient()
  const [email, setEmail] = useState<string>('')
  const [perfil, setPerfil] = useState<Perfil | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const getUser = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        setEmail(user.email || '')

        const { data: perfilData } = await supabase
          .from('perfis')
          .select('papel, areas')
          .eq('id', user.id)
          .single()

        if (perfilData) {
          setPerfil(perfilData)
        }
      }
      setLoading(false)
    }
    getUser()
  }, [supabase])

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push('/login')
  }

  if (loading) {
    return <div className="flex items-center justify-center h-screen">Carregando...</div>
  }

  const areas = [
    { id: 'vendas', nome: 'Vendas', ativo: perfil?.areas?.includes('vendas') || false },
    {
      id: 'financeiro',
      nome: 'Financeiro',
      ativo: perfil?.areas?.includes('financeiro') || false,
    },
    { id: 'rh', nome: 'RH', ativo: false },
    { id: 'juridico', nome: 'Jurídico', ativo: false },
    { id: 'operacoes', nome: 'Operações', ativo: false },
  ]

  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      <div className="container mx-auto px-4 py-8">
        <div className="flex justify-between items-start mb-12">
          <div>
            <h1 className="text-4xl font-bold text-gray-900">Solara OS</h1>
            <p className="text-gray-600 mt-2">{email}</p>
          </div>
          <div className="flex gap-2">
            {perfil?.papel === 'admin' && (
              <Link
                href="/admin"
                className="px-4 py-2 bg-slate-600 text-white rounded hover:bg-slate-700"
              >
                Admin
              </Link>
            )}
            <button
              onClick={handleLogout}
              className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
            >
              Sair
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {areas.map((area) => (
            <div
              key={area.id}
              className={`rounded-lg shadow p-6 transition-all ${
                area.ativo
                  ? 'bg-white hover:shadow-lg cursor-pointer border-2 border-transparent hover:border-indigo-400'
                  : 'bg-gray-100 opacity-50 cursor-not-allowed'
              }`}
            >
              {area.ativo ? (
                <Link href={`/${area.id}`} className="block">
                  <h2 className="text-2xl font-bold text-gray-900">{area.nome}</h2>
                  <p className="text-gray-600 mt-2">Clique para acessar</p>
                </Link>
              ) : (
                <>
                  <h2 className="text-2xl font-bold text-gray-600">{area.nome}</h2>
                  <p className="text-gray-500 mt-2">Em breve</p>
                </>
              )}
            </div>
          ))}
        </div>
      </div>
    </main>
  )
}
