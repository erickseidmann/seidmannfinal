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
import ConfirmModal from '@/components/admin/ConfirmModal'
import Toast from '@/components/admin/Toast'
import Button from '@/components/ui/Button'
import { Plus, Send, X, Trash2, Eraser, Loader2 } from 'lucide-react'

interface TeacherAlertItem {
  id: string
  teacherId: string
  teacher: { id: string; nome: string; email: string }
  message: string
  level: string | null
  isActive: boolean
  criadoEm: string
  createdBy: { id: string; nome: string } | null
}

interface StudentAlertItem {
  id: string
  enrollmentId: string
  enrollment: { id: string; nome: string; email: string; whatsapp: string }
  message: string
  level: string | null
  isActive: boolean
  criadoEm: string
  createdBy: { id: string; nome: string } | null
}

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
  const [teacherAlerts, setTeacherAlerts] = useState<TeacherAlertItem[]>([])
  const [studentAlerts, setStudentAlerts] = useState<StudentAlertItem[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingAlerts, setLoadingAlerts] = useState(true)
  const [loadingStudentAlerts, setLoadingStudentAlerts] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [confirmModal, setConfirmModal] = useState<{ title: string; message: string; onConfirm: () => void; confirmLabel?: string } | null>(null)
  const [clearingTeachers, setClearingTeachers] = useState(false)
  const [clearingStudents, setClearingStudents] = useState(false)
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null)
  const [formData, setFormData] = useState({
    title: '',
    message: '',
    channel: 'EMAIL',
    audience: 'ALL',
  })

  useEffect(() => {
    fetchAnnouncements()
  }, [])

  useEffect(() => {
    fetchTeacherAlerts()
  }, [])

  useEffect(() => {
    fetchStudentAlerts()
  }, [])

  const fetchTeacherAlerts = async () => {
    setLoadingAlerts(true)
    try {
      const res = await fetch('/api/admin/teacher-alerts', { credentials: 'include' })
      const json = await res.json()
      if (json.ok) setTeacherAlerts(json.data.alerts || [])
    } catch (err) {
      console.error('Erro ao buscar alertas de professores:', err)
    } finally {
      setLoadingAlerts(false)
    }
  }

  const fetchStudentAlerts = async () => {
    setLoadingStudentAlerts(true)
    try {
      const res = await fetch('/api/admin/student-alerts', { credentials: 'include' })
      const json = await res.json()
      if (json.ok) setStudentAlerts(json.data.alerts || [])
    } catch (err) {
      console.error('Erro ao buscar alertas de alunos:', err)
    } finally {
      setLoadingStudentAlerts(false)
    }
  }

  const handleDeleteTeacherAlert = (id: string) => {
    setConfirmModal({
      title: 'Excluir alerta',
      message: 'Deseja excluir este alerta?',
      confirmLabel: 'Excluir',
      onConfirm: async () => {
        try {
          const res = await fetch(`/api/admin/teacher-alerts/${id}`, {
            method: 'DELETE',
            credentials: 'include',
          })
          const json = await res.json()
          if (json.ok) {
            fetchTeacherAlerts()
            setToast({ message: 'Alerta excluído', type: 'success' })
          } else setToast({ message: json.message || 'Erro ao excluir', type: 'error' })
        } catch (err) {
          setToast({ message: 'Erro ao excluir alerta', type: 'error' })
        }
      },
    })
  }

  const handleClearTeacherAlerts = () => {
    setConfirmModal({
      title: 'Limpar notificações de professores',
      message: `Deseja excluir todas as ${teacherAlerts.length} notificação(ões) de professores? Esta ação não pode ser desfeita.`,
      confirmLabel: 'Excluir todas',
      onConfirm: async () => {
        setConfirmModal(null)
        setClearingTeachers(true)
        try {
          const res = await fetch('/api/admin/teacher-alerts/clear', {
            method: 'DELETE',
            credentials: 'include',
          })
          const json = await res.json()
          if (json.ok) {
            setTeacherAlerts([])
            setToast({ message: json.message || 'Notificações excluídas', type: 'success' })
          } else {
            setToast({ message: json.message || 'Erro ao excluir', type: 'error' })
          }
        } catch (err) {
          setToast({ message: 'Erro ao excluir notificações', type: 'error' })
        } finally {
          setClearingTeachers(false)
        }
      },
    })
  }

  const handleClearStudentAlerts = () => {
    setConfirmModal({
      title: 'Limpar notificações de alunos',
      message: `Deseja excluir todas as ${studentAlerts.length} notificação(ões) de alunos? Esta ação não pode ser desfeita.`,
      confirmLabel: 'Excluir todas',
      onConfirm: async () => {
        setConfirmModal(null)
        setClearingStudents(true)
        try {
          const res = await fetch('/api/admin/student-alerts/clear', {
            method: 'DELETE',
            credentials: 'include',
          })
          const json = await res.json()
          if (json.ok) {
            setStudentAlerts([])
            setToast({ message: json.message || 'Notificações excluídas', type: 'success' })
          } else {
            setToast({ message: json.message || 'Erro ao excluir', type: 'error' })
          }
        } catch (err) {
          setToast({ message: 'Erro ao excluir notificações', type: 'error' })
        } finally {
          setClearingStudents(false)
        }
      },
    })
  }

  const handleDeleteStudentAlert = (id: string) => {
    setConfirmModal({
      title: 'Excluir alerta',
      message: 'Deseja excluir este alerta do aluno?',
      confirmLabel: 'Excluir',
      onConfirm: async () => {
        try {
          const res = await fetch(`/api/admin/student-alerts/${id}`, {
            method: 'DELETE',
            credentials: 'include',
          })
          const json = await res.json()
          if (json.ok) {
            fetchStudentAlerts()
            setToast({ message: 'Alerta excluído', type: 'success' })
          } else setToast({ message: json.message || 'Erro ao excluir', type: 'error' })
        } catch (err) {
          setToast({ message: 'Erro ao excluir alerta', type: 'error' })
        }
      },
    })
  }

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

      setToast({ message: 'Anúncio criado com sucesso!', type: 'success' })
      setIsModalOpen(false)
      fetchAnnouncements()
    } catch (err) {
      setToast({ message: err instanceof Error ? err.message : 'Erro ao criar anúncio', type: 'error' })
    }
  }

  const handleSend = (id: string) => {
    setConfirmModal({
      title: 'Enviar anúncio',
      message: 'Deseja enviar este anúncio agora?',
      onConfirm: async () => {
        try {
          const response = await fetch(`/api/admin/announcements/${id}/send`, {
            method: 'POST',
            credentials: 'include',
          })
          const json = await response.json()
          if (!response.ok || !json.ok) throw new Error(json.message || 'Erro ao enviar anúncio')
          setToast({ message: 'Anúncio enviado com sucesso!', type: 'success' })
          fetchAnnouncements()
        } catch (err) {
          setToast({ message: err instanceof Error ? err.message : 'Erro ao enviar anúncio', type: 'error' })
        }
      },
    })
  }

  const handleCancel = (id: string) => {
    setConfirmModal({
      title: 'Cancelar anúncio',
      message: 'Deseja cancelar este anúncio?',
      onConfirm: async () => {
        try {
          const response = await fetch(`/api/admin/announcements/${id}/cancel`, {
            method: 'POST',
            credentials: 'include',
          })
          const json = await response.json()
          if (!response.ok || !json.ok) throw new Error(json.message || 'Erro ao cancelar anúncio')
          setToast({ message: 'Anúncio cancelado com sucesso!', type: 'success' })
          fetchAnnouncements()
        } catch (err) {
          setToast({ message: err instanceof Error ? err.message : 'Erro ao cancelar anúncio', type: 'error' })
        }
      },
    })
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

        {/* Alertas de Professores */}
        <div className="mt-12">
          <div className="flex items-center justify-between gap-4 mb-4">
            <h2 className="text-xl font-bold text-gray-900">Notificações de Professores</h2>
            <Button
              variant="outline"
              size="sm"
              onClick={handleClearTeacherAlerts}
              disabled={teacherAlerts.length === 0 || clearingTeachers}
              className="flex items-center gap-2"
            >
              {clearingTeachers ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Eraser className="w-4 h-4" />
              )}
              Limpar notificações
            </Button>
          </div>
          <p className="text-sm text-gray-600 mb-4">
            Alertas criados na página de Professores (ícone de sino). Passe o mouse para ver o conteúdo.
          </p>
          <Table
            columns={[
              {
                key: 'teacher',
                label: 'Professor',
                render: (a: TeacherAlertItem) => a.teacher.nome,
              },
              {
                key: 'message',
                label: 'Mensagem',
                render: (a: TeacherAlertItem) => (
                  <span title={a.message} className="max-w-xs truncate block" style={{ maxWidth: 250 }}>
                    {a.message}
                  </span>
                ),
              },
              {
                key: 'createdBy',
                label: 'Adicionado por',
                render: (a: TeacherAlertItem) => a.createdBy?.nome ?? '—',
              },
              { key: 'level', label: 'Nível', render: (a: TeacherAlertItem) => a.level || '-' },
              {
                key: 'criadoEm',
                label: 'Criado em',
                render: (a: TeacherAlertItem) => new Date(a.criadoEm).toLocaleString('pt-BR'),
              },
              {
                key: 'actions',
                label: 'Ações',
                render: (a: TeacherAlertItem) => (
                  <button
                    onClick={() => handleDeleteTeacherAlert(a.id)}
                    className="text-red-600 hover:text-red-800 text-sm font-medium"
                    title="Excluir"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                ),
              },
            ]}
            data={teacherAlerts}
            loading={loadingAlerts}
            emptyMessage="Nenhuma notificação de professor"
          />
        </div>

        {/* Alertas de Alunos */}
        <div className="mt-12">
          <div className="flex items-center justify-between gap-4 mb-4">
            <h2 className="text-xl font-bold text-gray-900">Notificações de Alunos</h2>
            <Button
              variant="outline"
              size="sm"
              onClick={handleClearStudentAlerts}
              disabled={studentAlerts.length === 0 || clearingStudents}
              className="flex items-center gap-2"
            >
              {clearingStudents ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Eraser className="w-4 h-4" />
              )}
              Limpar notificações
            </Button>
          </div>
          <p className="text-sm text-gray-600 mb-4">
            Alertas criados na página de Alunos (ícone de sino). Ao adicionar um alerta para um aluno, ele aparece aqui.
          </p>
          <Table
            columns={[
              {
                key: 'enrollment',
                label: 'Aluno',
                render: (a: StudentAlertItem) => a.enrollment.nome,
              },
              {
                key: 'message',
                label: 'Mensagem',
                render: (a: StudentAlertItem) => (
                  <span title={a.message} className="max-w-xs truncate block" style={{ maxWidth: 250 }}>
                    {a.message}
                  </span>
                ),
              },
              {
                key: 'createdBy',
                label: 'Adicionado por',
                render: (a: StudentAlertItem) => a.createdBy?.nome ?? '—',
              },
              { key: 'level', label: 'Nível', render: (a: StudentAlertItem) => a.level || '-' },
              {
                key: 'criadoEm',
                label: 'Criado em',
                render: (a: StudentAlertItem) => new Date(a.criadoEm).toLocaleString('pt-BR'),
              },
              {
                key: 'actions',
                label: 'Ações',
                render: (a: StudentAlertItem) => (
                  <button
                    onClick={() => handleDeleteStudentAlert(a.id)}
                    className="text-red-600 hover:text-red-800 text-sm font-medium"
                    title="Excluir"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                ),
              },
            ]}
            data={studentAlerts}
            loading={loadingStudentAlerts}
            emptyMessage="Nenhuma notificação de aluno"
          />
        </div>

        {/* Modal de Confirmação */}
        {confirmModal && (
          <ConfirmModal
            isOpen={!!confirmModal}
            onClose={() => setConfirmModal(null)}
            onConfirm={confirmModal.onConfirm}
            title={confirmModal.title}
            message={confirmModal.message}
            confirmLabel={confirmModal.confirmLabel ?? 'Confirmar'}
            cancelLabel="Cancelar"
          />
        )}

        {/* Toast */}
        {toast && (
          <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />
        )}

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
              <Button variant="primary" onClick={() => void handleSubmit({ preventDefault: () => {} } as React.FormEvent)}>
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
