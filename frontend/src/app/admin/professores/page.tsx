/**
 * Página Admin: Gerenciar Professores
 * 
 * CRUD completo de professores
 */

'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import AdminLayout from '@/components/admin/AdminLayout'
import Table from '@/components/admin/Table'
import Modal from '@/components/admin/Modal'
import Button from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Plus, Edit, Power, Bell } from 'lucide-react'

interface Teacher {
  id: string
  nome: string
  email: string
  whatsapp: string | null
  status: string
  userId: string | null
  user: { id: string; nome: string; email: string } | null
  attendancesCount: number
  alertsCount: number
  criadoEm: string
  atualizadoEm: string
}

export default function AdminProfessoresPage() {
  const router = useRouter()
  const [teachers, setTeachers] = useState<Teacher[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingTeacher, setEditingTeacher] = useState<Teacher | null>(null)
  const [formData, setFormData] = useState({
    nome: '',
    email: '',
    whatsapp: '',
    status: 'ACTIVE',
  })

  useEffect(() => {
    fetchTeachers()
  }, [])

  const fetchTeachers = async () => {
    setLoading(true)
    try {
      const response = await fetch('/api/admin/teachers', {
        credentials: 'include',
      })

      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          router.push('/login?tab=admin')
          return
        }
        throw new Error('Erro ao carregar professores')
      }

      const json = await response.json()
      if (json.ok) {
        setTeachers(json.data.teachers)
      } else {
        throw new Error(json.message || 'Erro ao carregar professores')
      }
    } catch (err) {
      console.error('Erro ao buscar professores:', err)
      setError(err instanceof Error ? err.message : 'Erro ao carregar dados')
    } finally {
      setLoading(false)
    }
  }

  const handleCreate = () => {
    setEditingTeacher(null)
    setFormData({ nome: '', email: '', whatsapp: '', status: 'ACTIVE' })
    setIsModalOpen(true)
  }

  const handleEdit = (teacher: Teacher) => {
    setEditingTeacher(teacher)
    setFormData({
      nome: teacher.nome,
      email: teacher.email,
      whatsapp: teacher.whatsapp || '',
      status: teacher.status,
    })
    setIsModalOpen(true)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    try {
      const url = editingTeacher
        ? `/api/admin/teachers/${editingTeacher.id}`
        : '/api/admin/teachers'
      const method = editingTeacher ? 'PATCH' : 'POST'

      const response = await fetch(url, {
        method,
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
        throw new Error(json.message || 'Erro ao salvar professor')
      }

      setIsModalOpen(false)
      fetchTeachers()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Erro ao salvar professor')
    }
  }

  const handleToggle = async (teacher: Teacher) => {
    if (!confirm(`Deseja ${teacher.status === 'ACTIVE' ? 'desativar' : 'ativar'} o professor ${teacher.nome}?`)) {
      return
    }

    try {
      const response = await fetch(`/api/admin/teachers/${teacher.id}/toggle`, {
        method: 'POST',
        credentials: 'include',
      })

      const json = await response.json()

      if (!response.ok || !json.ok) {
        throw new Error(json.message || 'Erro ao alterar status')
      }

      fetchTeachers()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Erro ao alterar status')
    }
  }

  const handleCreateAlert = (teacher: Teacher) => {
    const message = prompt('Digite a mensagem do alerta:')
    if (!message) return

    const level = prompt('Nível (INFO, WARN, ERROR):', 'INFO') || 'INFO'

    fetch('/api/admin/teacher-alerts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ teacherId: teacher.id, message, level }),
    })
      .then((res) => res.json())
      .then((json) => {
        if (json.ok) {
          alert('Alerta criado com sucesso!')
        } else {
          alert(json.message || 'Erro ao criar alerta')
        }
      })
      .catch((err) => {
        alert('Erro ao criar alerta')
        console.error(err)
      })
  }

  const columns = [
    {
      key: 'nome',
      label: 'Nome',
    },
    {
      key: 'email',
      label: 'Email',
    },
    {
      key: 'whatsapp',
      label: 'WhatsApp',
      render: (t: Teacher) => t.whatsapp || '-',
    },
    {
      key: 'status',
      label: 'Status',
      render: (t: Teacher) => (
        <span className={`px-2 py-1 rounded-full text-xs font-semibold ${
          t.status === 'ACTIVE' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
        }`}>
          {t.status}
        </span>
      ),
    },
    {
      key: 'actions',
      label: 'Ações',
      render: (t: Teacher) => (
        <div className="flex gap-2">
          <button
            onClick={() => handleEdit(t)}
            className="text-brand-orange hover:text-orange-700 text-sm font-medium"
            title="Editar"
          >
            <Edit className="w-4 h-4" />
          </button>
          <button
            onClick={() => handleToggle(t)}
            className="text-gray-600 hover:text-gray-800 text-sm font-medium"
            title={t.status === 'ACTIVE' ? 'Desativar' : 'Ativar'}
          >
            <Power className="w-4 h-4" />
          </button>
          <button
            onClick={() => handleCreateAlert(t)}
            className="text-blue-600 hover:text-blue-800 text-sm font-medium"
            title="Criar Alerta"
          >
            <Bell className="w-4 h-4" />
          </button>
        </div>
      ),
    },
  ]

  return (
    <AdminLayout>
      <div>
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 mb-2">Professores</h1>
            <p className="text-sm text-gray-600">Gerencie professores do instituto</p>
          </div>
          <Button onClick={handleCreate} variant="primary" size="md" className="flex items-center gap-2">
            <Plus className="w-4 h-4" />
            Novo Professor
          </Button>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg text-red-800">
            {error}
          </div>
        )}

        <Table
          columns={columns}
          data={teachers}
          loading={loading}
          emptyMessage="Nenhum professor cadastrado"
        />

        {/* Modal Criar/Editar */}
        <Modal
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          title={editingTeacher ? 'Editar Professor' : 'Novo Professor'}
          size="md"
          footer={
            <>
              <Button variant="outline" onClick={() => setIsModalOpen(false)}>
                Cancelar
              </Button>
              <Button variant="primary" onClick={handleSubmit}>
                {editingTeacher ? 'Salvar' : 'Criar'}
              </Button>
            </>
          }
        >
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Nome <span className="text-red-500">*</span>
              </label>
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
                Email <span className="text-red-500">*</span>
              </label>
              <input
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                className="input w-full"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                WhatsApp
              </label>
              <input
                type="text"
                value={formData.whatsapp}
                onChange={(e) => setFormData({ ...formData, whatsapp: e.target.value })}
                className="input w-full"
                placeholder="11999999999"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Status
              </label>
              <select
                value={formData.status}
                onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                className="input w-full"
              >
                <option value="ACTIVE">Ativo</option>
                <option value="INACTIVE">Inativo</option>
              </select>
            </div>
          </form>
        </Modal>
      </div>
    </AdminLayout>
  )
}
