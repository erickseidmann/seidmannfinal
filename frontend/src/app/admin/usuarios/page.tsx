/**
 * Página Admin: Usuários do ADM
 *
 * Apenas admin@seidmann.com pode acessar. Lista funcionários (email @seidmann.com).
 * Campos: Nome, Email, Telefone, Email de acesso (@seidmann.com), Função, delegar acessos (quais páginas do dashboard).
 */

'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import AdminLayout from '@/components/admin/AdminLayout'
import Table from '@/components/admin/Table'
import Modal from '@/components/admin/Modal'
import ConfirmModal from '@/components/admin/ConfirmModal'
import Toast from '@/components/admin/Toast'
import Button from '@/components/ui/Button'
import { Edit, Power, Plus, Shield, X } from 'lucide-react'

const ADMIN_PAGES = [
  { key: 'dashboard', label: 'Dashboard' },
  { key: 'professores', label: 'Professores' },
  { key: 'alunos', label: 'Alunos' },
  { key: 'livros', label: 'Livros' },
  { key: 'alertas', label: 'Alertas' },
  { key: 'calendario', label: 'Calendário' },
  { key: 'registros-aulas', label: 'Registros de aulas' },
  { key: 'chat', label: 'Chat' },
  { key: 'financeiro', label: 'Financeiro (todas)' },
  { key: 'financeiro-geral', label: 'Financeiro – Geral' },
  { key: 'financeiro-alunos', label: 'Financeiro – Alunos' },
  { key: 'financeiro-professores', label: 'Financeiro – Professores' },
  { key: 'financeiro-administracao', label: 'Financeiro – Administração' },
  { key: 'financeiro-relatorios', label: 'Financeiro – Relatórios' },
  { key: 'financeiro-cupons', label: 'Financeiro – Cupons' },
] as const

type AdminPageKey = (typeof ADMIN_PAGES)[number]['key']

interface User {
  id: string
  nome: string
  email: string
  whatsapp: string
  role: string
  status: string
  funcao: string | null
  emailPessoal: string | null
  adminPages: string[]
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
  const [confirmModal, setConfirmModal] = useState<{
    title: string
    message: string
    onConfirm: () => void
    variant?: 'danger' | 'default'
  } | null>(null)
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null)
  const [filters, setFilters] = useState({ status: '', search: '' })
  const [formData, setFormData] = useState({
    nome: '',
    email: '',
    telefone: '',
    emailPessoal: '',
    funcao: '',
    senha: '',
    adminPages: [] as string[],
    status: 'ACTIVE',
  })
  const [superAdminOk, setSuperAdminOk] = useState<boolean | null>(null)

  useEffect(() => {
    fetch('/api/admin/me', { credentials: 'include' })
      .then((res) => res.ok && res.json())
      .then((json) => {
        if (json?.ok && json?.data?.isSuperAdmin) setSuperAdminOk(true)
        else setSuperAdminOk(false)
      })
      .catch(() => setSuperAdminOk(false))
  }, [])

  useEffect(() => {
    if (superAdminOk === false) {
      router.replace('/admin/dashboard')
      return
    }
    if (superAdminOk) fetchUsers()
  }, [superAdminOk, filters])

  const fetchUsers = async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (filters.status) params.append('status', filters.status)
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
      if (json.ok) setUsers(json.data.users)
      else throw new Error(json.message || 'Erro ao carregar usuários')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar dados')
    } finally {
      setLoading(false)
    }
  }

  const handleCreate = () => {
    setEditingUser(null)
    setFormData({
      nome: '',
      email: '',
      telefone: '',
      emailPessoal: '',
      funcao: '',
      senha: '',
      adminPages: [],
      status: 'ACTIVE',
    })
    setIsModalOpen(true)
  }

  const handleEdit = (user: User) => {
    setEditingUser(user)
    setFormData({
      nome: user.nome,
      email: user.email,
      telefone: user.whatsapp,
      emailPessoal: user.emailPessoal || '',
      funcao: user.funcao || '',
      senha: '',
      adminPages: Array.isArray(user.adminPages) ? [...user.adminPages] : [],
      status: user.status,
    })
    setIsModalOpen(true)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const email = formData.email.trim().toLowerCase()
    if (!email.endsWith('@seidmann.com')) {
      setToast({ message: 'Email de acesso deve terminar com @seidmann.com', type: 'error' })
      return
    }
    if (!editingUser && !formData.senha) {
      setToast({ message: 'Informe uma senha temporária para o novo usuário', type: 'error' })
      return
    }
    if (editingUser && formData.senha && formData.senha.length < 6) {
      setToast({ message: 'Senha deve ter pelo menos 6 caracteres', type: 'error' })
      return
    }

    try {
      if (editingUser) {
        const body: Record<string, unknown> = {
          nome: formData.nome,
          email: formData.email,
          telefone: formData.telefone,
          emailPessoal: formData.emailPessoal || undefined,
          funcao: formData.funcao || undefined,
          adminPages: formData.adminPages,
          status: formData.status,
        }
        if (formData.senha) body.senha = formData.senha
        const response = await fetch(`/api/admin/users/${editingUser.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify(body),
        })
        const json = await response.json()
        if (!response.ok || !json.ok) {
          setToast({ message: json.message || 'Erro ao salvar', type: 'error' })
          return
        }
        setToast({ message: 'Usuário atualizado com sucesso', type: 'success' })
      } else {
        const response = await fetch('/api/admin/users', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            nome: formData.nome,
            email: formData.email,
            telefone: formData.telefone,
            emailPessoal: formData.emailPessoal || undefined,
            funcao: formData.funcao || undefined,
            adminPages: formData.adminPages,
            senha: formData.senha,
          }),
        })
        const json = await response.json()
        if (!response.ok || !json.ok) {
          setToast({ message: json.message || 'Erro ao criar usuário', type: 'error' })
          return
        }
        setToast({ message: 'Usuário adicionado com sucesso', type: 'success' })
      }
      setIsModalOpen(false)
      fetchUsers()
    } catch (err) {
      setToast({ message: err instanceof Error ? err.message : 'Erro ao salvar', type: 'error' })
    }
  }

  const handleToggle = (user: User) => {
    setConfirmModal({
      title: user.status === 'ACTIVE' ? 'Desativar usuário' : 'Ativar usuário',
      message: `Deseja ${user.status === 'ACTIVE' ? 'desativar' : 'ativar'} ${user.nome}?`,
      onConfirm: async () => {
        try {
          const res = await fetch(`/api/admin/users/${user.id}/toggle`, {
            method: 'POST',
            credentials: 'include',
          })
          const json = await res.json()
          if (!res.ok || !json.ok) {
            setToast({ message: json.message || 'Erro ao alterar status', type: 'error' })
            return
          }
          setToast({ message: 'Status alterado com sucesso', type: 'success' })
          fetchUsers()
        } catch {
          setToast({ message: 'Erro ao alterar status', type: 'error' })
        }
      },
    })
  }

  const handleDelete = (user: User) => {
    if (user.email.toLowerCase() === 'admin@seidmann.com') {
      setToast({ message: 'Não é permitido excluir o administrador principal', type: 'error' })
      return
    }
    setConfirmModal({
      title: 'Excluir usuário',
      message: `Tem certeza que deseja excluir o usuário "${user.nome}" (${user.email})? Esta ação não pode ser desfeita.`,
      variant: 'danger',
      onConfirm: async () => {
        try {
          const res = await fetch(`/api/admin/users/${user.id}`, { method: 'DELETE', credentials: 'include' })
          const json = await res.json()
          if (!res.ok || !json.ok) {
            setToast({ message: json.message || 'Erro ao excluir usuário', type: 'error' })
            return
          }
          setToast({ message: 'Usuário excluído com sucesso', type: 'success' })
          fetchUsers()
        } catch {
          setToast({ message: 'Erro ao excluir usuário', type: 'error' })
        }
      },
    })
  }

  const togglePage = (key: AdminPageKey) => {
    setFormData((prev) => ({
      ...prev,
      adminPages: prev.adminPages.includes(key)
        ? prev.adminPages.filter((p) => p !== key)
        : [...prev.adminPages, key],
    }))
  }

  if (superAdminOk === null || superAdminOk === false) {
    return (
      <AdminLayout>
        <div className="flex items-center justify-center min-h-[40vh]">
          <p className="text-gray-500">Verificando acesso...</p>
        </div>
      </AdminLayout>
    )
  }

  const columns = [
    { key: 'nome', label: 'Nome' },
    { key: 'email', label: 'Email' },
    { key: 'whatsapp', label: 'Telefone', render: (u: User) => u.whatsapp || '—' },
    {
      key: 'emailAcesso',
      label: 'Email de acesso',
      render: (u: User) => (
        <span className={u.email.endsWith('@seidmann.com') ? 'text-gray-900' : 'text-amber-700'}>
          {u.email}
        </span>
      ),
    },
    {
      key: 'funcao',
      label: 'Função',
      render: (u: User) => u.funcao || '—',
    },
    {
      key: 'status',
      label: 'Status',
      render: (u: User) => (
        <span
          className={`px-2 py-1 rounded-full text-xs font-semibold ${
            u.status === 'ACTIVE'
              ? 'bg-green-100 text-green-800'
              : u.status === 'PENDING'
                ? 'bg-yellow-100 text-yellow-800'
                : 'bg-red-100 text-red-800'
          }`}
        >
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
            onClick={() => handleEdit(u)}
            className="text-blue-600 hover:text-blue-800 text-sm font-medium"
            title="Delegar acessos"
          >
            <Shield className="w-4 h-4" />
          </button>
          <button
            onClick={() => handleToggle(u)}
            className="text-gray-600 hover:text-gray-800 text-sm font-medium"
            title={u.status === 'ACTIVE' ? 'Desativar' : 'Ativar'}
          >
            <Power className="w-4 h-4" />
          </button>
          {u.email.toLowerCase() !== 'admin@seidmann.com' && (
            <button
              onClick={() => handleDelete(u)}
              className="text-red-600 hover:text-red-800 text-sm font-medium"
              title="Excluir"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      ),
    },
  ]

  return (
    <AdminLayout>
      <div>
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 mb-2">Usuários do ADM</h1>
            <p className="text-sm text-gray-600">Funcionários da escola (email @seidmann.com)</p>
          </div>
          <Button onClick={handleCreate} variant="primary" size="md" className="flex items-center gap-2">
            <Plus className="w-4 h-4" />
            Adicionar Usuário
          </Button>
        </div>

        <div className="mb-6 grid grid-cols-1 md:grid-cols-3 gap-4">
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
            <label className="block text-sm font-semibold text-gray-700 mb-2">Buscar</label>
            <input
              type="text"
              value={filters.search}
              onChange={(e) => setFilters({ ...filters, search: e.target.value })}
              className="input w-full"
              placeholder="Nome, email, telefone, função..."
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
          emptyMessage="Nenhum usuário do ADM cadastrado"
        />

        <Modal
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          title={editingUser ? 'Editar usuário / Delegar acessos' : 'Adicionar Usuário'}
          size="lg"
          footer={
            <>
              <Button variant="outline" onClick={() => setIsModalOpen(false)}>
                Cancelar
              </Button>
              <Button variant="primary" onClick={() => void handleSubmit({ preventDefault: () => {} } as React.FormEvent)}>
                {editingUser ? 'Salvar' : 'Criar'}
              </Button>
            </>
          }
        >
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">Nome *</label>
              <input
                type="text"
                value={formData.nome}
                onChange={(e) => setFormData({ ...formData, nome: e.target.value })}
                className="input w-full"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Email de acesso * <span className="text-gray-500 font-normal">(deve terminar com @seidmann.com)</span>
              </label>
              <input
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                className="input w-full"
                placeholder="exemplo@seidmann.com"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">Telefone</label>
              <input
                type="text"
                value={formData.telefone}
                onChange={(e) => setFormData({ ...formData, telefone: e.target.value })}
                className="input w-full"
                placeholder="11999999999"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">Email pessoal</label>
              <input
                type="email"
                value={formData.emailPessoal}
                onChange={(e) => setFormData({ ...formData, emailPessoal: e.target.value })}
                className="input w-full"
                placeholder="exemplo@gmail.com"
              />
              <p className="text-xs text-gray-500 mt-0.5">Email pessoal (opcional, qualquer domínio)</p>
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">Função</label>
              <input
                type="text"
                value={formData.funcao}
                onChange={(e) => setFormData({ ...formData, funcao: e.target.value })}
                className="input w-full"
                placeholder="Ex: Coordenador, Secretária..."
              />
            </div>
            {!editingUser && (
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Senha temporária *</label>
                <input
                  type="password"
                  value={formData.senha}
                  onChange={(e) => setFormData({ ...formData, senha: e.target.value })}
                  className="input w-full"
                  placeholder="Mínimo 6 caracteres"
                  minLength={6}
                  required={!editingUser}
                />
              </div>
            )}
            {editingUser && (
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Nova senha (deixe em branco para manter)</label>
                <input
                  type="password"
                  value={formData.senha}
                  onChange={(e) => setFormData({ ...formData, senha: e.target.value })}
                  className="input w-full"
                  placeholder="Mínimo 6 caracteres"
                  minLength={6}
                />
              </div>
            )}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">Páginas que pode acessar (delegar acessos)</label>
              <p className="text-xs text-gray-500 mb-2">Marque as páginas do dashboard que este usuário poderá acessar.</p>
              <div className="flex flex-wrap gap-4">
                {ADMIN_PAGES.map(({ key, label }) => (
                  <label key={key} className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formData.adminPages.includes(key)}
                      onChange={() => togglePage(key)}
                      className="rounded border-gray-300 text-brand-orange focus:ring-brand-orange"
                    />
                    <span className="text-sm">{label}</span>
                  </label>
                ))}
              </div>
            </div>
            {editingUser && (
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Status</label>
                <select
                  value={formData.status}
                  onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                  className="input w-full"
                >
                  <option value="ACTIVE">Ativo</option>
                  <option value="INACTIVE">Inativo</option>
                  <option value="PENDING">Pendente</option>
                  <option value="BLOCKED">Bloqueado</option>
                </select>
              </div>
            )}
          </form>
        </Modal>

        {confirmModal && (
          <ConfirmModal
            isOpen={!!confirmModal}
            onClose={() => setConfirmModal(null)}
            onConfirm={() => {
              confirmModal.onConfirm()
              setConfirmModal(null)
            }}
            title={confirmModal.title}
            message={confirmModal.message}
            confirmLabel="Confirmar"
            cancelLabel="Cancelar"
            variant={confirmModal.variant}
          />
        )}

        {toast && (
          <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />
        )}
      </div>
    </AdminLayout>
  )
}
