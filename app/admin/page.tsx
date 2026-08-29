'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/utils/supabase/client'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

interface Perfil {
  id: string
  email: string
  nome: string
  papel: string
  areas: string[]
}

export default function AdminPage() {
  const router = useRouter()
  const supabase = createClient()
  const [perfis, setPerfis] = useState<Perfil[]>([])
  const [loading, setLoading] = useState(true)
  const [eh_admin, setEhAdmin] = useState(false)
  const [formulario, setFormulario] = useState({
    email: '',
    senha: '',
    nome: '',
    papel: 'operador',
    areas: [] as string[],
  })
  const [erro, setErro] = useState('')
  const [sucesso, setSucesso] = useState('')

  useEffect(() => {
    const checkAdmin = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.push('/login')
        return
      }

      const { data: perfilData } = await supabase
        .from('perfis')
        .select('papel')
        .eq('id', user.id)
        .single()

      if (perfilData?.papel !== 'admin') {
        router.push('/')
        return
      }

      setEhAdmin(true)

      // Carregar perfis
      const { data: perfisData } = await supabase.from('perfis').select('*')
      if (perfisData) {
        setPerfis(perfisData)
      }

      setLoading(false)
    }

    checkAdmin()
  }, [supabase, router])

  const handleCriarUsuario = async (e: React.FormEvent) => {
    e.preventDefault()
    setErro('')
    setSucesso('')

    try {
      // Chamar rota de API para criar usuário
      const response = await fetch('/api/admin/criar-usuario', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: formulario.email,
          password: formulario.senha,
          nome: formulario.nome,
          papel: formulario.papel,
          areas: formulario.areas,
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        setErro(data.erro || 'Erro ao criar usuário')
        return
      }

      setSucesso('Usuário criado com sucesso')
      setFormulario({
        email: '',
        senha: '',
        nome: '',
        papel: 'operador',
        areas: [],
      })

      // Recarregar perfis
      const { data: perfisData } = await supabase.from('perfis').select('*')
      if (perfisData) {
        setPerfis(perfisData)
      }
    } catch (err) {
      setErro('Erro ao criar usuário')
    }
  }

  const toggleArea = (area: string) => {
    setFormulario((prev) => ({
      ...prev,
      areas: prev.areas.includes(area)
        ? prev.areas.filter((a) => a !== area)
        : [...prev.areas, area],
    }))
  }

  if (loading) {
    return <div className="flex items-center justify-center h-screen">Carregando...</div>
  }

  if (!eh_admin) {
    return null
  }

  return (
    <main className="min-h-screen bg-gray-50">
      <div className="container mx-auto px-4 py-8">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-3xl font-bold">Administração</h1>
          <Link href="/" className="px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700">
            Voltar
          </Link>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Formulário */}
          <div className="lg:col-span-1 bg-white rounded-lg shadow p-6">
            <h2 className="text-xl font-semibold mb-6">Criar Usuário</h2>

            {erro && <div className="bg-red-50 border border-red-200 text-red-700 p-3 rounded mb-4">{erro}</div>}
            {sucesso && (
              <div className="bg-green-50 border border-green-200 text-green-700 p-3 rounded mb-4">
                {sucesso}
              </div>
            )}

            <form onSubmit={handleCriarUsuario} className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">E-mail</label>
                <input
                  type="email"
                  value={formulario.email}
                  onChange={(e) => setFormulario({ ...formulario, email: e.target.value })}
                  required
                  className="w-full px-3 py-2 border rounded"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Senha</label>
                <input
                  type="password"
                  value={formulario.senha}
                  onChange={(e) => setFormulario({ ...formulario, senha: e.target.value })}
                  required
                  className="w-full px-3 py-2 border rounded"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Nome</label>
                <input
                  type="text"
                  value={formulario.nome}
                  onChange={(e) => setFormulario({ ...formulario, nome: e.target.value })}
                  required
                  className="w-full px-3 py-2 border rounded"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Papel</label>
                <select
                  value={formulario.papel}
                  onChange={(e) => setFormulario({ ...formulario, papel: e.target.value })}
                  className="w-full px-3 py-2 border rounded"
                >
                  <option value="operador">Operador</option>
                  <option value="admin">Admin</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Áreas</label>
                <div className="space-y-2">
                  {['vendas', 'financeiro'].map((area) => (
                    <label key={area} className="flex items-center">
                      <input
                        type="checkbox"
                        checked={formulario.areas.includes(area)}
                        onChange={() => toggleArea(area)}
                        className="mr-2"
                      />
                      {area.charAt(0).toUpperCase() + area.slice(1)}
                    </label>
                  ))}
                </div>
              </div>

              <button
                type="submit"
                className="w-full px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700"
              >
                Criar
              </button>
            </form>
          </div>

          {/* Lista de usuários */}
          <div className="lg:col-span-2 bg-white rounded-lg shadow p-6">
            <h2 className="text-xl font-semibold mb-6">Usuários</h2>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-2 px-4">E-mail</th>
                    <th className="text-left py-2 px-4">Nome</th>
                    <th className="text-left py-2 px-4">Papel</th>
                    <th className="text-left py-2 px-4">Áreas</th>
                  </tr>
                </thead>
                <tbody>
                  {perfis.map((perfil) => (
                    <tr key={perfil.id} className="border-b hover:bg-gray-50">
                      <td className="py-3 px-4">{perfil.email}</td>
                      <td className="py-3 px-4">{perfil.nome}</td>
                      <td className="py-3 px-4">
                        <span
                          className={`px-2 py-1 rounded text-xs font-medium ${
                            perfil.papel === 'admin'
                              ? 'bg-purple-100 text-purple-800'
                              : 'bg-blue-100 text-blue-800'
                          }`}
                        >
                          {perfil.papel}
                        </span>
                      </td>
                      <td className="py-3 px-4">{perfil.areas?.join(', ') || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </main>
  )
}
