/**
 * Página Admin: Gerenciar Alertas
 * 
 * Criar e gerenciar anúncios (email/SMS)
 */

'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import AdminLayout from '@/components/admin/AdminLayout'
import Table from '@/components/admin/Table'
import Modal from '@/components/admin/Modal'
import Button from '@/components/ui/Button'
import { Plus, Send, X } from 'lucide-react'

interface Announcement {
  id: string
  title: string
  message: string
  channel: string
  audience: string
  status: string
  createdByAdminEmail: string
  sentAt: string | null
  criadoEm: string
  atualizadoEm: string
}

export default function AdminAlertasPage() {
  const router = useRouter()
  const [announcements, setAnnouncements] = useState<Announcement[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [formData, setFormData] = useState({
    title: '',
    message: '',
    channel: 'EMAIL',
    audience: 'ALL',
  })

  useEffect(() => {
    fetchAnnouncements()
  }, [])

  const fetchAnnouncements = async () => {
    setLoading(true)
    try {
      const response = await fetch('/api/admin/announcements', {
        credentials: 'include',
      })

      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          router.push('/login?tab=admin')
          return
        }
        throw new Error('Erro ao carregar anúncios')
      }

      const json = await response.json()
      if (json.ok) {
        setAnnouncements(json.data.announcements)
      } else {
        throw new Error(json.message || 'Erro ao carregar anúncios')
      }
    } catch (err) {
      console.error('Erro ao buscar anúncios:', err)
      setError(err instanceof Error ? err.message : 'Erro ao carregar dados')
    } finally {
      setLoading(false)
    }
  }

  const handleCreate = () => {
    setFormData({ title: '', message: '', channel: 'EMAIL', audience: 'ALL' })
    setIsModalOpen(true)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    try {
      const response = await fetch('/api/admin/announcements', {
        method: 'POST',
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
        throw new Error(json.message || 'Erro ao criar anúncio')
      }

      alert('Anúncio criado com sucesso!')
      setIsModalOpen(false)
      fetchAnnouncements()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Erro ao criar anúncio')
    }
  }

  const handleSend = async (id: string) => {
    if (!confirm('Deseja enviar este anúncio agora?')) return

    try {
      const response = await fetch(`/api/admin/announcements/${id}/send`, {
        method: 'POST',
        credentials: 'include',
      })

      const json = await response.json()

      if (!response.ok || !json.ok) {
        throw new Error(json.message || 'Erro ao enviar anúncio')
      }

      alert('Anúncio enviado com sucesso!')
      fetchAnnouncements()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Erro ao enviar anúncio')
    }
  }

  const handleCancel = async (id: string) => {
    if (!confirm('Deseja cancelar este anúncio?')) return

    try {
      const response = await fetch(`/api/admin/announcements/${id}/cancel`, {
        method: 'POST',
        credentials: 'include',
      })

      const json = await response.json()

      if (!response.ok || !json.ok) {
        throw new Error(json.message || 'Erro ao cancelar anúncio')
      }

      alert('Anúncio cancelado com sucesso!')
      fetchAnnouncements()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Erro ao cancelar anúncio')
    }
  }

  const columns = [
    { key: 'title', label: 'Título' },
    { key: 'channel', label: 'Canal', render: (a: Announcement) => a.channel },
    { key: 'audience', label: 'Audiência', render: (a: Announcement) => a.audience },
    {
      key: 'status',
      label: 'Status',
      render: (a: Announcement) => (
        <span className={`px-2 py-1 rounded-full text-xs font-semibold ${
          a.status === 'SENT' ? 'bg-green-100 text-green-800' :
          a.status === 'PENDING' ? 'bg-yellow-100 text-yellow-800' :
          'bg-red-100 text-red-800'
        }`}>
          {a.status}
        </span>
      ),
    },
    {
      key: 'sentAt',
      label: 'Enviado em',
      render: (a: Announcement) => a.sentAt ? new Date(a.sentAt).toLocaleString('pt-BR') : '-',
    },
    {
      key: 'actions',
      label: 'Ações',
      render: (a: Announcement) => (
        <div className="flex gap-2">
          {a.status === 'PENDING' && (
            <>
              <button
                onClick={() => handleSend(a.id)}
                className="text-green-600 hover:text-green-800 text-sm font-medium"
                title="Enviar"
              >
                <Send className="w-4 h-4" />
              </button>
              <button
                onClick={() => handleCancel(a.id)}
                className="text-red-600 hover:text-red-800 text-sm font-medium"
                title="Cancelar"
              >
                <X className="w-4 h-4" />
              </button>
            </>
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
            <h1 className="text-3xl font-bold text-gray-900 mb-2">Alertas</h1>
            <p className="text-sm text-gray-600">Crie e gerencie anúncios (email/SMS)</p>
          </div>
          <Button onClick={handleCreate} variant="primary" size="md" className="flex items-center gap-2">
            <Plus className="w-4 h-4" />
            Novo Anúncio
          </Button>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg text-red-800">
            {error}
          </div>
        )}

        <Table
          columns={columns}
          data={announcements}
          loading={loading}
          emptyMessage="Nenhum anúncio criado"
        />

        {/* Modal Criar Anúncio */}
        <Modal
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          title="Novo Anúncio"
          size="lg"
          footer={
            <>
              <Button variant="outline" onClick={() => setIsModalOpen(false)}>
                Cancelar
              </Button>
              <Button variant="primary" onClick={handleSubmit}>
                Criar
              </Button>
            </>
          }
        >
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Título <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                className="input w-full"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Mensagem <span className="text-red-500">*</span>
              </label>
              <textarea
                value={formData.message}
                onChange={(e) => setFormData({ ...formData, message: e.target.value })}
                className="input w-full"
                rows={5}
                required
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Canal <span className="text-red-500">*</span>
              </label>
              <select
                value={formData.channel}
                onChange={(e) => setFormData({ ...formData, channel: e.target.value })}
                className="input w-full"
              >
                <option value="EMAIL">Email</option>
                <option value="SMS">SMS</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Audiência <span className="text-red-500">*</span>
              </label>
              <select
                value={formData.audience}
                onChange={(e) => setFormData({ ...formData, audience: e.target.value })}
                className="input w-full"
              >
                <option value="ALL">Todos</option>
                <option value="STUDENTS">Alunos</option>
                <option value="TEACHERS">Professores</option>
                <option value="ACTIVE_ONLY">Apenas Ativos</option>
              </select>
            </div>
          </form>
        </Modal>
      </div>
    </AdminLayout>
  )
}
