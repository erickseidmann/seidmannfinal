/**
 * Página Admin: Gerenciar Usuários
 * 
 * Lista e gerencia usuários do sistema
 */

'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import AdminLayout from '@/components/admin/AdminLayout'
import Table from '@/components/admin/Table'
import Modal from '@/components/admin/Modal'
import Button from '@/components/ui/Button'
import { Edit, Power } from 'lucide-react'

interface User {
  id: string
  nome: string
  email: string
  whatsapp: string
  role: string
  status: string
  enrollmentsCount: number
  booksCount: number
  criadoEm: string
  atualizadoEm: string
}

export default function AdminUsuariosPage() {
  const router = useRouter()
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingUser, setEditingUser] = useState<User | null>(null)
  const [filters, setFilters] = useState({
    status: '',
    role: '',
    search: '',
  })
  const [formData, setFormData] = useState({
    nome: '',
    email: '',
    whatsapp: '',
    role: 'STUDENT',
    status: 'PENDING',
  })

  useEffect(() => {
    fetchUsers()
  }, [filters])

  const fetchUsers = async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (filters.status) params.append('status', filters.status)
      if (filters.role) params.append('role', filters.role)
      if (filters.search) params.append('search', filters.search)

      const response = await fetch(`/api/admin/users?${params.toString()}`, {
        credentials: 'include',
      })

      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          router.push('/login?tab=admin')
          return
        }
        throw new Error('Erro ao carregar usuários')
      }

      const json = await response.json()
      if (json.ok) {
        setUsers(json.data.users)
      } else {
        throw new Error(json.message || 'Erro ao carregar usuários')
      }
    } catch (err) {
      console.error('Erro ao buscar usuários:', err)
      setError(err instanceof Error ? err.message : 'Erro ao carregar dados')
    } finally {
      setLoading(false)
    }
  }

  const handleEdit = (user: User) => {
    setEditingUser(user)
    setFormData({
      nome: user.nome,
      email: user.email,
      whatsapp: user.whatsapp,
      role: user.role,
      status: user.status,
    })
    setIsModalOpen(true)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!editingUser) return

    try {
      const response = await fetch(`/api/admin/users/${editingUser.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(formData),
      })

      const json = await response.json()

      if (!response.ok || !json.ok) {
        if (response.status === 401 || response.status === 403) {
          router.push('/login?tab=admin')
          return
        }
        throw new Error(json.message || 'Erro ao salvar usuário')
      }

      setIsModalOpen(false)
      fetchUsers()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Erro ao salvar usuário')
    }
  }

  const handleToggle = async (user: User) => {
    if (!confirm(`Deseja ${user.status === 'ACTIVE' ? 'desativar' : 'ativar'} o usuário ${user.nome}?`)) {
      return
    }

    try {
      const response = await fetch(`/api/admin/users/${user.id}/toggle`, {
        method: 'POST',
        credentials: 'include',
      })

      const json = await response.json()

      if (!response.ok || !json.ok) {
        throw new Error(json.message || 'Erro ao alterar status')
      }

      fetchUsers()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Erro ao alterar status')
    }
  }

  const columns = [
    { key: 'nome', label: 'Nome' },
    { key: 'email', label: 'Email' },
    { key: 'whatsapp', label: 'WhatsApp' },
    {
      key: 'role',
      label: 'Role',
      render: (u: User) => (
        <span className="px-2 py-1 rounded-full text-xs font-semibold bg-blue-100 text-blue-800">
          {u.role}
        </span>
      ),
    },
    {
      key: 'status',
      label: 'Status',
      render: (u: User) => (
        <span className={`px-2 py-1 rounded-full text-xs font-semibold ${
          u.status === 'ACTIVE' ? 'bg-green-100 text-green-800' :
          u.status === 'PENDING' ? 'bg-yellow-100 text-yellow-800' :
          'bg-red-100 text-red-800'
        }`}>
          {u.status}
        </span>
      ),
    },
    {
      key: 'actions',
      label: 'Ações',
      render: (u: User) => (
        <div className="flex gap-2">
          <button
            onClick={() => handleEdit(u)}
            className="text-brand-orange hover:text-orange-700 text-sm font-medium"
            title="Editar"
          >
            <Edit className="w-4 h-4" />
          </button>
          <button
            onClick={() => handleToggle(u)}
            className="text-gray-600 hover:text-gray-800 text-sm font-medium"
            title={u.status === 'ACTIVE' ? 'Desativar' : 'Ativar'}
          >
            <Power className="w-4 h-4" />
          </button>
        </div>
      ),
    },
  ]

  return (
    <AdminLayout>
      <div>
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Usuários</h1>
          <p className="text-sm text-gray-600">Gerencie usuários do sistema</p>
        </div>

        {/* Filtros */}
        <div className="mb-6 grid grid-cols-1 md:grid-cols-4 gap-4">
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">Status</label>
            <select
              value={filters.status}
              onChange={(e) => setFilters({ ...filters, status: e.target.value })}
              className="input w-full"
            >
              <option value="">Todos</option>
              <option value="ACTIVE">Ativo</option>
              <option value="PENDING">Pendente</option>
              <option value="INACTIVE">Inativo</option>
              <option value="BLOCKED">Bloqueado</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">Role</label>
            <select
              value={filters.role}
              onChange={(e) => setFilters({ ...filters, role: e.target.value })}
              className="input w-full"
            >
              <option value="">Todos</option>
              <option value="STUDENT">Aluno</option>
              <option value="TEACHER">Professor</option>
              <option value="ADMIN">Admin</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">Buscar</label>
            <input
              type="text"
              value={filters.search}
              onChange={(e) => setFilters({ ...filters, search: e.target.value })}
              className="input w-full"
              placeholder="Nome, email, whatsapp..."
            />
          </div>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg text-red-800">
            {error}
          </div>
        )}

        <Table
          columns={columns}
          data={users}
          loading={loading}
          emptyMessage="Nenhum usuário encontrado"
        />

        {/* Modal Editar */}
        <Modal
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          title="Editar Usuário"
          size="md"
          footer={
            <>
              <Button variant="outline" onClick={() => setIsModalOpen(false)}>
                Cancelar
              </Button>
              <Button variant="primary" onClick={handleSubmit}>
                Salvar
              </Button>
            </>
          }
        >
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">Nome</label>
              <input
                type="text"
                value={formData.nome}
                onChange={(e) => setFormData({ ...formData, nome: e.target.value })}
                className="input w-full"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">Email</label>
              <input
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                className="input w-full"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">WhatsApp</label>
              <input
                type="text"
                value={formData.whatsapp}
                onChange={(e) => setFormData({ ...formData, whatsapp: e.target.value })}
                className="input w-full"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">Role</label>
              <select
                value={formData.role}
                onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                className="input w-full"
              >
                <option value="STUDENT">Aluno</option>
                <option value="TEACHER">Professor</option>
                <option value="ADMIN">Admin</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">Status</label>
              <select
                value={formData.status}
                onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                className="input w-full"
              >
                <option value="PENDING">Pendente</option>
                <option value="ACTIVE">Ativo</option>
                <option value="INACTIVE">Inativo</option>
                <option value="BLOCKED">Bloqueado</option>
              </select>
            </div>
          </form>
        </Modal>
      </div>
    </AdminLayout>
  )
}
