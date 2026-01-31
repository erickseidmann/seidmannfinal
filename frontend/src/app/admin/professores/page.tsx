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
import ConfirmModal from '@/components/admin/ConfirmModal'
import Toast from '@/components/admin/Toast'
import Button from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Plus, Edit, Power, Bell, Star, Trash2, AlertCircle, Upload, FileSpreadsheet } from 'lucide-react'

interface Teacher {
  id: string
  nome: string
  nomePreferido?: string | null
  email: string
  whatsapp: string | null
  cpf?: string | null
  cnpj?: string | null
  valorPorHora?: number | null
  metodoPagamento?: string | null
  infosPagamento?: string | null
  nota?: number | null
  status: string
  userId: string | null
  user: { id: string; nome: string; email: string } | null
  attendancesCount: number
  alertsCount: number
  alerts?: { id: string; message: string; level: string | null }[]
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
  const [alertsModalTeacher, setAlertsModalTeacher] = useState<Teacher | null>(null)
  const [createAlertModalTeacher, setCreateAlertModalTeacher] = useState<Teacher | null>(null)
  const [newAlertForm, setNewAlertForm] = useState({ message: '', level: 'INFO' })
  const [confirmModal, setConfirmModal] = useState<{ title: string; message: string; onConfirm: () => void; variant?: 'danger' | 'default'; confirmLabel?: string } | null>(null)
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null)
  const [formData, setFormData] = useState({
    nome: '',
    nomePreferido: '',
    email: '',
    whatsapp: '',
    valorPorHora: '',
    metodoPagamento: '',
    infosPagamento: '',
    cpf: '',
    cnpj: '',
    nota: '',
    status: 'ACTIVE',
  })
  const [importModalOpen, setImportModalOpen] = useState(false)
  const [importFile, setImportFile] = useState<File | null>(null)
  const [importLoading, setImportLoading] = useState(false)
  const [importResult, setImportResult] = useState<{
    created: number
    teachers: { id: string; nome: string; email: string }[]
    errors: { row: number; message: string }[]
  } | null>(null)

  useEffect(() => {
    fetchTeachers()
  }, [])

  // Sincroniza o professor do modal de alertas quando a lista é atualizada (ex: após excluir)
  useEffect(() => {
    if (alertsModalTeacher && teachers.length > 0) {
      const updated = teachers.find((t) => t.id === alertsModalTeacher.id)
      if (updated) setAlertsModalTeacher(updated)
      else setAlertsModalTeacher(null)
    }
  }, [teachers])

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
    setFormData({
      nome: '',
      nomePreferido: '',
      email: '',
      whatsapp: '',
      valorPorHora: '',
      metodoPagamento: '',
      infosPagamento: '',
      cpf: '',
      cnpj: '',
      nota: '',
      status: 'ACTIVE',
    })
    setIsModalOpen(true)
  }

  const handleEdit = (teacher: Teacher) => {
    setEditingTeacher(teacher)
    setFormData({
      nome: teacher.nome,
      nomePreferido: teacher.nomePreferido || '',
      email: teacher.email,
      whatsapp: teacher.whatsapp || '',
      valorPorHora: teacher.valorPorHora != null ? String(teacher.valorPorHora) : '',
      metodoPagamento: teacher.metodoPagamento || '',
      infosPagamento: teacher.infosPagamento || '',
      cpf: teacher.cpf || '',
      cnpj: teacher.cnpj || '',
      nota: teacher.nota != null ? String(teacher.nota) : '',
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
      setToast({ message: 'Professor salvo com sucesso!', type: 'success' })
    } catch (err) {
      setToast({ message: err instanceof Error ? err.message : 'Erro ao salvar professor', type: 'error' })
    }
  }

  const handleToggle = (teacher: Teacher) => {
    setConfirmModal({
      title: teacher.status === 'ACTIVE' ? 'Desativar professor' : 'Ativar professor',
      message: `Deseja ${teacher.status === 'ACTIVE' ? 'desativar' : 'ativar'} o professor ${teacher.nome}?`,
      onConfirm: async () => {
        try {
          const response = await fetch(`/api/admin/teachers/${teacher.id}/toggle`, {
            method: 'POST',
            credentials: 'include',
          })
          const json = await response.json()
          if (!response.ok || !json.ok) throw new Error(json.message || 'Erro ao alterar status')
          fetchTeachers()
          setToast({ message: 'Status alterado com sucesso!', type: 'success' })
        } catch (err) {
          setToast({ message: err instanceof Error ? err.message : 'Erro ao alterar status', type: 'error' })
        }
      },
    })
  }

  const openCreateAlertModal = (teacher: Teacher) => {
    setCreateAlertModalTeacher(teacher)
    setNewAlertForm({ message: '', level: 'INFO' })
  }

  const handleCreateAlertSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!createAlertModalTeacher || !newAlertForm.message.trim()) return

    try {
      const res = await fetch('/api/admin/teacher-alerts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          teacherId: createAlertModalTeacher.id,
          message: newAlertForm.message.trim(),
          level: newAlertForm.level,
        }),
      })
      const json = await res.json()
      if (json.ok) {
        setCreateAlertModalTeacher(null)
        setNewAlertForm({ message: '', level: 'INFO' })
        setToast({ message: 'Alerta criado com sucesso!', type: 'success' })
        fetchTeachers()
      } else {
        setToast({ message: json.message || 'Erro ao criar alerta', type: 'error' })
      }
    } catch (err) {
      setToast({ message: 'Erro ao criar alerta', type: 'error' })
      console.error(err)
    }
  }

  const handleDeleteAlert = (alertId: string) => {
    setConfirmModal({
      title: 'Excluir alerta',
      message: 'Deseja excluir este alerta?',
      variant: 'danger',
      confirmLabel: 'Excluir',
      onConfirm: async () => {
        try {
          const res = await fetch(`/api/admin/teacher-alerts/${alertId}`, {
            method: 'DELETE',
            credentials: 'include',
          })
          const json = await res.json()
          if (json.ok) {
            fetchTeachers()
            setToast({ message: 'Alerta excluído', type: 'success' })
          } else {
            setToast({ message: json.message || 'Erro ao excluir', type: 'error' })
          }
        } catch (err) {
          setToast({ message: 'Erro ao excluir alerta', type: 'error' })
        }
      },
    })
  }

  const StarRating = ({ value }: { value: number | null }) => {
    if (value == null) return <span className="text-gray-400">—</span>
    return (
      <div className="flex gap-0.5" title={`${value}/5`}>
        {[1, 2, 3, 4, 5].map((i) => (
          <Star
            key={i}
            className={`w-4 h-4 ${i <= value ? 'fill-amber-400 text-amber-500' : 'text-gray-300'}`}
          />
        ))}
      </div>
    )
  }

  const getAlertLevelStyles = (level: string | null) => {
    switch (level?.toUpperCase()) {
      case 'ERROR':
        return 'bg-red-100 text-red-800 border-red-200'
      case 'WARN':
        return 'bg-amber-100 text-amber-800 border-amber-200'
      case 'INFO':
      default:
        return 'bg-blue-100 text-blue-800 border-blue-200'
    }
  }

  const getAlertSymbolColor = (alerts: { level: string | null }[]) => {
    const hasError = alerts.some((a) => a.level?.toUpperCase() === 'ERROR')
    const hasWarn = alerts.some((a) => a.level?.toUpperCase() === 'WARN')
    if (hasError) return 'text-red-500 hover:text-red-600'
    if (hasWarn) return 'text-amber-500 hover:text-amber-600'
    return 'text-blue-500 hover:text-blue-600'
  }

  const handleDownloadTemplate = async () => {
    try {
      const res = await fetch('/api/admin/teachers/template', { credentials: 'include' })
      if (!res.ok) {
        setToast({ message: 'Erro ao baixar modelo', type: 'error' })
        return
      }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'professores-modelo.csv'
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      setToast({ message: 'Erro ao baixar modelo', type: 'error' })
    }
  }

  const handleImportSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!importFile) {
      setToast({ message: 'Selecione um arquivo CSV', type: 'error' })
      return
    }
    setImportLoading(true)
    setImportResult(null)
    try {
      const form = new FormData()
      form.append('file', importFile)
      const res = await fetch('/api/admin/teachers/import', {
        method: 'POST',
        credentials: 'include',
        body: form,
      })
      const json = await res.json()
      if (!res.ok) {
        setToast({ message: json.message || 'Erro ao importar', type: 'error' })
        return
      }
      if (json.ok && json.data) {
        setImportResult(json.data)
        if (json.data.created > 0) {
          fetchTeachers()
          setToast({
            message: `${json.data.created} professor(es) adicionado(s) com sucesso!`,
            type: 'success',
          })
        }
      }
    } catch (err) {
      setToast({
        message: err instanceof Error ? err.message : 'Erro ao importar',
        type: 'error',
      })
    } finally {
      setImportLoading(false)
    }
  }

  const closeImportModal = () => {
    setImportModalOpen(false)
    setImportFile(null)
    setImportResult(null)
  }

  const columns = [
    {
      key: 'nome',
      label: 'Nome',
      render: (t: Teacher) => (
        <div className="flex items-center gap-2">
          {t.alerts && t.alerts.length > 0 && (
            <button
              onClick={() => setAlertsModalTeacher(t)}
              className={`shrink-0 ${getAlertSymbolColor(t.alerts)}`}
              title="Ver notificações"
              type="button"
            >
              <AlertCircle className="w-4 h-4 fill-current" />
            </button>
          )}
          <span>{t.nome}</span>
        </div>
      ),
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
      key: 'nota',
      label: 'Nota',
      render: (t: Teacher) => <StarRating value={t.nota ?? null} />,
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
            onClick={() => t.alerts?.length ? setAlertsModalTeacher(t) : openCreateAlertModal(t)}
            className="text-blue-600 hover:text-blue-800 text-sm font-medium"
            title={t.alerts?.length ? 'Ver alertas / Criar novo' : 'Criar Alerta'}
          >
            <Bell className={`w-4 h-4 ${t.alerts?.length ? 'fill-blue-600' : ''}`} />
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
          <div className="flex gap-2">
            <Button
              onClick={() => setImportModalOpen(true)}
              variant="outline"
              size="md"
              className="flex items-center gap-2"
            >
              <FileSpreadsheet className="w-4 h-4" />
              Adicionar por lista
            </Button>
            <Button onClick={handleCreate} variant="primary" size="md" className="flex items-center gap-2">
              <Plus className="w-4 h-4" />
              Novo Professor
            </Button>
          </div>
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

        {/* Modal Notificações do Professor */}
        <Modal
          isOpen={!!alertsModalTeacher}
          onClose={() => setAlertsModalTeacher(null)}
          title={`Notificações – ${alertsModalTeacher?.nome ?? ''}`}
          size="md"
          footer={
            <>
              {alertsModalTeacher && (
                <Button
                  variant="outline"
                  onClick={() => {
                    setAlertsModalTeacher(null)
                    openCreateAlertModal(alertsModalTeacher)
                  }}
                >
                  Novo Alerta
                </Button>
              )}
              <Button variant="primary" onClick={() => setAlertsModalTeacher(null)}>
                Fechar
              </Button>
            </>
          }
        >
          {alertsModalTeacher && (
            <div className="space-y-3">
              {alertsModalTeacher.alerts && alertsModalTeacher.alerts.length > 0 ? (
                alertsModalTeacher.alerts.map((a) => (
                  <div
                    key={a.id}
                    className={`flex items-start justify-between gap-3 p-4 rounded-lg border ${getAlertLevelStyles(a.level)}`}
                  >
                    <p className="flex-1 text-sm">{a.message}</p>
                    <button
                      onClick={() => handleDeleteAlert(a.id)}
                      className="shrink-0 text-gray-500 hover:text-red-600 p-1"
                      title="Excluir"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))
              ) : (
                <p className="text-gray-500 text-sm">Nenhuma notificação.</p>
              )}
            </div>
          )}
        </Modal>

        {/* Modal Novo Alerta */}
        <Modal
          isOpen={!!createAlertModalTeacher}
          onClose={() => {
            setCreateAlertModalTeacher(null)
            setNewAlertForm({ message: '', level: 'INFO' })
          }}
          title={`Novo Alerta – ${createAlertModalTeacher?.nome ?? ''}`}
          size="md"
          footer={
            createAlertModalTeacher ? (
              <>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setCreateAlertModalTeacher(null)
                    setNewAlertForm({ message: '', level: 'INFO' })
                  }}
                >
                  Cancelar
                </Button>
                <Button
                  type="button"
                  variant="primary"
                  onClick={(e) => handleCreateAlertSubmit(e as unknown as React.FormEvent)}
                >
                  Criar
                </Button>
              </>
            ) : undefined
          }
        >
          {createAlertModalTeacher && (
            <form id="create-alert-form" onSubmit={handleCreateAlertSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Mensagem <span className="text-red-500">*</span>
                </label>
                <textarea
                  value={newAlertForm.message}
                  onChange={(e) => setNewAlertForm({ ...newAlertForm, message: e.target.value })}
                  className="input w-full min-h-[80px]"
                  placeholder="Digite a mensagem do alerta"
                  rows={3}
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Nível
                </label>
                <select
                  value={newAlertForm.level}
                  onChange={(e) => setNewAlertForm({ ...newAlertForm, level: e.target.value })}
                  className="input w-full"
                >
                  <option value="INFO">INFO – Informativo</option>
                  <option value="WARN">WARN – Aviso</option>
                  <option value="ERROR">ERROR – Erro</option>
                </select>
              </div>
            </form>
          )}
        </Modal>

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
            variant={confirmModal.variant ?? 'default'}
          />
        )}

        {/* Modal Importar por lista */}
        <Modal
          isOpen={importModalOpen}
          onClose={closeImportModal}
          title="Adicionar professores por lista"
          size="md"
          footer={
            <>
              <Button variant="outline" onClick={closeImportModal}>
                Fechar
              </Button>
              {importFile && (
                <Button
                  variant="primary"
                  onClick={handleImportSubmit}
                  disabled={importLoading}
                  className="flex items-center gap-2"
                >
                  {importLoading ? (
                    'Importando...'
                  ) : (
                    <>
                      <Upload className="w-4 h-4" />
                      Importar
                    </>
                  )}
                </Button>
              )}
            </>
          }
        >
          <div className="space-y-4">
            <p className="text-sm text-gray-600">
              Baixe o modelo CSV com as colunas necessárias, preencha com os dados dos professores e faça o upload.
            </p>
            <div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleDownloadTemplate}
                className="flex items-center gap-2"
              >
                <FileSpreadsheet className="w-4 h-4" />
                Baixar planilha modelo
              </Button>
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Arquivo CSV
              </label>
              <input
                type="file"
                accept=".csv"
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  setImportFile(f || null)
                  setImportResult(null)
                }}
                className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:text-sm file:font-medium file:bg-brand-orange file:text-white hover:file:bg-orange-600"
              />
            </div>
            {importResult && (
              <div className="space-y-2 pt-2 border-t">
                <p className="text-sm font-medium text-green-700">
                  {importResult.created} professor(es) adicionado(s).
                </p>
                {importResult.errors.length > 0 && (
                  <div>
                    <p className="text-sm font-medium text-amber-700 mb-1">
                      {importResult.errors.length} linha(s) com erro:
                    </p>
                    <ul className="text-xs text-gray-600 max-h-32 overflow-y-auto space-y-0.5">
                      {importResult.errors.map((err, i) => (
                        <li key={i}>
                          Linha {err.row}: {err.message}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </div>
        </Modal>

        {/* Toast */}
        {toast && (
          <Toast
            message={toast.message}
            type={toast.type}
            onClose={() => setToast(null)}
          />
        )}

        {/* Modal Criar/Editar */}
        <Modal
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          title={editingTeacher ? 'Editar Professor' : 'Novo Professor'}
          size="lg"
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
                Nome que prefere ser chamado
              </label>
              <input
                type="text"
                value={formData.nomePreferido}
                onChange={(e) => setFormData({ ...formData, nomePreferido: e.target.value })}
                className="input w-full"
                placeholder="Como o professor prefere ser chamado"
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
                Valor por hora (R$)
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={formData.valorPorHora}
                onChange={(e) => setFormData({ ...formData, valorPorHora: e.target.value })}
                className="input w-full"
                placeholder="0,00"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Método de pagamento
              </label>
              <select
                value={formData.metodoPagamento}
                onChange={(e) => setFormData({ ...formData, metodoPagamento: e.target.value })}
                className="input w-full"
              >
                <option value="">Selecione</option>
                <option value="PIX">PIX</option>
                <option value="CARTAO">Cartão</option>
                <option value="OUTRO">Outro (descreva abaixo)</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Infos para pagamento
              </label>
              <textarea
                value={formData.infosPagamento}
                onChange={(e) => setFormData({ ...formData, infosPagamento: e.target.value })}
                className="input w-full min-h-[80px]"
                placeholder={
                  formData.metodoPagamento === 'OUTRO'
                    ? 'Descreva o método de pagamento...'
                    : 'Dados bancários, chave PIX, etc.'
                }
                rows={3}
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Nota (1-5 estrelas)
              </label>
              <select
                value={formData.nota}
                onChange={(e) => setFormData({ ...formData, nota: e.target.value })}
                className="input w-full"
              >
                <option value="">Sem nota</option>
                {[1, 2, 3, 4, 5].map((n) => (
                  <option key={n} value={n}>
                    {'★'.repeat(n)} {n} estrela{n > 1 ? 's' : ''}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  CPF <span className="text-gray-400">(opcional)</span>
                </label>
                <input
                  type="text"
                  value={formData.cpf}
                  onChange={(e) => setFormData({ ...formData, cpf: e.target.value })}
                  className="input w-full"
                  placeholder="000.000.000-00"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  CNPJ <span className="text-gray-400">(opcional)</span>
                </label>
                <input
                  type="text"
                  value={formData.cnpj}
                  onChange={(e) => setFormData({ ...formData, cnpj: e.target.value })}
                  className="input w-full"
                  placeholder="00.000.000/0001-00"
                />
              </div>
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
