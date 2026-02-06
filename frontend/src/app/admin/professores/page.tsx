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
import { Plus, Edit, Power, Bell, Star, Trash2, AlertCircle, Upload, FileSpreadsheet, Key, Clock, Users, Download, Loader2, Search, X } from 'lucide-react'
import StatCard from '@/components/admin/StatCard'

const IDIOMAS_OPCOES = [
  { value: 'INGLES', label: 'Inglês' },
  { value: 'ESPANHOL', label: 'Espanhol' },
  { value: 'PORTUGUES', label: 'Português' },
  { value: 'ITALIANO', label: 'Italiano' },
  { value: 'FRANCES', label: 'Francês' },
] as const

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
  idiomasFala?: string[] | null
  idiomasEnsina?: string[] | null
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
    senha: '',
    idiomasFala: [] as string[],
    idiomasEnsina: [] as string[],
  })
  const [criarAcessoTeacher, setCriarAcessoTeacher] = useState<Teacher | null>(null)
  const [criarAcessoSenha, setCriarAcessoSenha] = useState('')
  const [criarAcessoLoading, setCriarAcessoLoading] = useState(false)
  const [alterarSenhaTeacher, setAlterarSenhaTeacher] = useState<Teacher | null>(null)
  const [alterarSenhaNova, setAlterarSenhaNova] = useState('')
  const [alterarSenhaConfirmar, setAlterarSenhaConfirmar] = useState('')
  const [alterarSenhaLoading, setAlterarSenhaLoading] = useState(false)
  const [importModalOpen, setImportModalOpen] = useState(false)
  const [importFile, setImportFile] = useState<File | null>(null)
  const [importLoading, setImportLoading] = useState(false)
  const [importResult, setImportResult] = useState<{
    created: number
    teachers: { id: string; nome: string; email: string }[]
    errors: { row: number; message: string }[]
  } | null>(null)
  const [availabilityModalTeacher, setAvailabilityModalTeacher] = useState<Teacher | null>(null)
  const [availabilitySlots, setAvailabilitySlots] = useState<{ id: string; dayOfWeek: number; startMinutes: number; endMinutes: number }[]>([])
  const [availabilityLoading, setAvailabilityLoading] = useState(false)
  const [availabilitySaving, setAvailabilitySaving] = useState(false)
  /** Set de chaves "dayOfWeek-startMinutes" (ex: "1-540" = Seg 9h) para a tabela de checkboxes */
  const [availabilityChecked, setAvailabilityChecked] = useState<Set<string>>(new Set())
  const [newSlotForm, setNewSlotForm] = useState({ dayOfWeek: 1, startTime: '09:00', endTime: '12:00' })
  const [addingSlot, setAddingSlot] = useState(false)
  const [selectedTeacherIds, setSelectedTeacherIds] = useState<Set<string>>(new Set())
  const [bulkActionLoading, setBulkActionLoading] = useState(false)
  const [alunosModalTeacher, setAlunosModalTeacher] = useState<Teacher | null>(null)
  const [alunosData, setAlunosData] = useState<{
    teacher: { id: string; nome: string }
    alunos: { enrollmentId: string; nome: string; diasHorarios: string; lessons: unknown[] }[]
  } | null>(null)
  const [alunosLoading, setAlunosLoading] = useState(false)
  const [searchName, setSearchName] = useState('')
  const [stats, setStats] = useState<{ nota1: number; nota2: number; nota45: number; teacherRequests: number } | null>(null)
  const [statsLoading, setStatsLoading] = useState(false)
  const [listModal, setListModal] = useState<{ type: 'nota1' | 'nota2' | 'nota45'; title: string } | null>(null)
  const [listTeachers, setListTeachers] = useState<Teacher[]>([])
  const [listTeachersLoading, setListTeachersLoading] = useState(false)
  const [freeSlotsModalOpen, setFreeSlotsModalOpen] = useState(false)
  const [freeSlotsForm, setFreeSlotsForm] = useState({ dayOfWeeks: [] as number[], startTime: '09:00', endTime: '10:00' })
  const [freeSlotsResult, setFreeSlotsResult] = useState<{
    id: string
    nome: string
    idiomasFala?: string[]
    idiomasEnsina?: string[]
  }[]>([])
  const [freeSlotsLoading, setFreeSlotsLoading] = useState(false)
  const [requestTeacherModalOpen, setRequestTeacherModalOpen] = useState(false)
  const [requestTeacherForm, setRequestTeacherForm] = useState({ horarios: '', idiomas: [] as string[] })
  const [requestTeacherSaving, setRequestTeacherSaving] = useState(false)
  const [teacherRequests, setTeacherRequests] = useState<{ id: string; horarios: string; idiomas: string; criadoEm: string }[]>([])
  const [teacherRequestsModalOpen, setTeacherRequestsModalOpen] = useState(false)
  const [teacherRequestsLoading, setTeacherRequestsLoading] = useState(false)

  useEffect(() => {
    fetchTeachers()
    fetchStats()
  }, [])

  useEffect(() => {
    if (!availabilityModalTeacher) {
      setAvailabilitySlots([])
      setAvailabilityChecked(new Set())
      return
    }
    setAvailabilityLoading(true)
    fetch(`/api/admin/teachers/${availabilityModalTeacher.id}/availability`, { credentials: 'include' })
      .then((r) => r.json())
      .then((j) => {
        const slots = j.ok && j.data?.slots ? j.data.slots : []
        setAvailabilitySlots(slots)
        const set = new Set<string>()
        for (const s of slots) {
          for (let m = s.startMinutes; m < s.endMinutes; m += 30) {
            set.add(`${s.dayOfWeek}-${m}`)
          }
        }
        setAvailabilityChecked(set)
      })
      .catch(() => {
        setAvailabilitySlots([])
        setAvailabilityChecked(new Set())
      })
      .finally(() => setAvailabilityLoading(false))
  }, [availabilityModalTeacher?.id])

  useEffect(() => {
    if (!alunosModalTeacher) {
      setAlunosData(null)
      return
    }
    setAlunosLoading(true)
    fetch(`/api/admin/teachers/${alunosModalTeacher.id}/alunos`, { credentials: 'include' })
      .then((r) => r.json())
      .then((j) => {
        if (j.ok && j.data) setAlunosData(j.data)
        else setAlunosData(null)
      })
      .catch(() => setAlunosData(null))
      .finally(() => setAlunosLoading(false))
  }, [alunosModalTeacher?.id])

  // Sincroniza o professor do modal de alertas quando a lista é atualizada (ex: após excluir)
  useEffect(() => {
    if (alertsModalTeacher && teachers.length > 0) {
      const updated = teachers.find((t) => t.id === alertsModalTeacher.id)
      if (updated) setAlertsModalTeacher(updated)
      else setAlertsModalTeacher(null)
    }
  }, [teachers])

  useEffect(() => {
    if (!listModal) {
      setListTeachers([])
      return
    }
    setListTeachersLoading(true)
    const nota = listModal.type === 'nota1' ? '1' : listModal.type === 'nota2' ? '2' : '45'
    fetch('/api/admin/teachers?nota=' + nota, { credentials: 'include' })
      .then((r) => r.json())
      .then((j) => {
        if (j.ok && j.data?.teachers) setListTeachers(j.data.teachers)
        else setListTeachers([])
      })
      .catch(() => setListTeachers([]))
      .finally(() => setListTeachersLoading(false))
  }, [listModal?.type])

  const fetchTeachers = async (opts?: { search?: string; nota?: string }) => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (opts?.search?.trim()) params.set('search', opts.search.trim())
      if (opts?.nota) params.set('nota', opts.nota)
      const url = '/api/admin/teachers' + (params.toString() ? '?' + params.toString() : '')
      const response = await fetch(url, { credentials: 'include' })

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

  const fetchStats = async () => {
    setStatsLoading(true)
    try {
      const res = await fetch('/api/admin/teachers/stats', { credentials: 'include' })
      const json = await res.json()
      if (res.ok && json.ok) setStats(json.data)
      else setStats(null)
    } catch {
      setStats(null)
    } finally {
      setStatsLoading(false)
    }
  }

  const fetchTeacherRequests = async () => {
    setTeacherRequestsLoading(true)
    try {
      const res = await fetch('/api/admin/teacher-requests', { credentials: 'include' })
      const json = await res.json()
      if (res.ok && json.ok) setTeacherRequests(json.data)
      else setTeacherRequests([])
    } catch {
      setTeacherRequests([])
    } finally {
      setTeacherRequestsLoading(false)
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
      senha: '',
      idiomasFala: [],
      idiomasEnsina: [],
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
      senha: '',
      idiomasFala: Array.isArray(teacher.idiomasFala) ? [...teacher.idiomasFala] : [],
      idiomasEnsina: Array.isArray(teacher.idiomasEnsina) ? [...teacher.idiomasEnsina] : [],
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

      const payload: Record<string, unknown> = { ...formData }
      if (!payload.senha || String(payload.senha).trim() === '') delete payload.senha
      else payload.senha = String(payload.senha).trim()

      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload),
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

  const handleAlterarSenhaSubmit = async () => {
    if (!alterarSenhaTeacher || !alterarSenhaNova.trim() || alterarSenhaNova.trim().length < 6) {
      setToast({ message: 'Nova senha deve ter no mínimo 6 caracteres', type: 'error' })
      return
    }
    if (alterarSenhaNova !== alterarSenhaConfirmar) {
      setToast({ message: 'A nova senha e a confirmação não coincidem', type: 'error' })
      return
    }
    setAlterarSenhaLoading(true)
    try {
      const res = await fetch(`/api/admin/teachers/${alterarSenhaTeacher.id}/alterar-senha`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ novaSenha: alterarSenhaNova.trim() }),
      })
      const json = await res.json()
      if (!res.ok || !json.ok) {
        setToast({ message: json.message || 'Erro ao alterar senha', type: 'error' })
        return
      }
      setToast({ message: json.data?.message || 'Senha alterada.', type: 'success' })
      setAlterarSenhaTeacher(null)
      setAlterarSenhaNova('')
      setAlterarSenhaConfirmar('')
      fetchTeachers()
    } catch (err) {
      setToast({ message: err instanceof Error ? err.message : 'Erro ao alterar senha', type: 'error' })
    } finally {
      setAlterarSenhaLoading(false)
    }
  }

  const handleCriarAcessoSubmit = async () => {
    if (!criarAcessoTeacher) return
    if (criarAcessoSenha.trim().length > 0 && criarAcessoSenha.trim().length < 6) {
      setToast({ message: 'Senha deve ter no mínimo 6 caracteres', type: 'error' })
      return
    }
    setCriarAcessoLoading(true)
    try {
      const res = await fetch(`/api/admin/teachers/${criarAcessoTeacher.id}/criar-acesso`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(criarAcessoSenha.trim().length >= 6 ? { senha: criarAcessoSenha.trim() } : {}),
      })
      const json = await res.json()
      if (!res.ok || !json.ok) {
        setToast({ message: json.message || 'Erro ao criar acesso', type: 'error' })
        return
      }
      setToast({ message: json.data?.message || 'Acesso ao Dashboard Professores criado.', type: 'success' })
      setCriarAcessoTeacher(null)
      setCriarAcessoSenha('')
      fetchTeachers()
    } catch (err) {
      setToast({ message: err instanceof Error ? err.message : 'Erro ao criar acesso', type: 'error' })
    } finally {
      setCriarAcessoLoading(false)
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

  const DIAS_SEMANA_AVAIL = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']

  const timeToMinutes = (time: string): number => {
    const [h, m] = time.split(':').map(Number)
    return (h ?? 0) * 60 + (m ?? 0)
  }

  const minutesToTime = (minutes: number): string => {
    const h = Math.floor(minutes / 60)
    const m = minutes % 60
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`
  }

  const handleAddAvailabilitySlot = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!availabilityModalTeacher) return
    const startMinutes = timeToMinutes(newSlotForm.startTime)
    const endMinutes = timeToMinutes(newSlotForm.endTime)
    if (startMinutes >= endMinutes) {
      setToast({ message: 'Horário de início deve ser anterior ao fim', type: 'error' })
      return
    }
    setAddingSlot(true)
    setToast(null)
    try {
      const res = await fetch(`/api/admin/teachers/${availabilityModalTeacher.id}/availability`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          dayOfWeek: newSlotForm.dayOfWeek,
          startMinutes,
          endMinutes,
        }),
      })
      const json = await res.json()
      if (!res.ok || !json.ok) {
        setToast({ message: json.message || 'Erro ao adicionar horário', type: 'error' })
        return
      }
      setToast({ message: 'Horário adicionado', type: 'success' })
      setNewSlotForm({ dayOfWeek: 1, startTime: '09:00', endTime: '12:00' })
      const listRes = await fetch(`/api/admin/teachers/${availabilityModalTeacher.id}/availability`, { credentials: 'include' })
      const listJson = await listRes.json()
      if (listJson.ok && listJson.data?.slots) setAvailabilitySlots(listJson.data.slots)
    } catch {
      setToast({ message: 'Erro ao adicionar horário', type: 'error' })
    } finally {
      setAddingSlot(false)
    }
  }

  const handleDeleteAvailabilitySlot = async (slotId: string) => {
    if (!availabilityModalTeacher) return
    try {
      const res = await fetch(
        `/api/admin/teachers/${availabilityModalTeacher.id}/availability?slotId=${encodeURIComponent(slotId)}`,
        { method: 'DELETE', credentials: 'include' }
      )
      const json = await res.json()
      if (!res.ok || !json.ok) {
        setToast({ message: json.message || 'Erro ao remover', type: 'error' })
        return
      }
      setAvailabilitySlots((prev) => prev.filter((s) => s.id !== slotId))
      setToast({ message: 'Horário removido', type: 'success' })
    } catch {
      setToast({ message: 'Erro ao remover horário', type: 'error' })
    }
  }

  /** Horários da tabela: 06:00 até 23:00 (cada célula = 30 minutos) - igual ao calendário */
  const AVAIL_HORAS = Array.from({ length: 35 }, (_, i) => 360 + i * 30) // 360 (6h), 390 (6h30), 420 (7h), ..., 1380 (23h)
  const AVAIL_DIAS = [
    { dayOfWeek: 1, label: 'Seg' },
    { dayOfWeek: 2, label: 'Ter' },
    { dayOfWeek: 3, label: 'Qua' },
    { dayOfWeek: 4, label: 'Qui' },
    { dayOfWeek: 5, label: 'Sex' },
    { dayOfWeek: 6, label: 'Sáb' },
    { dayOfWeek: 0, label: 'Dom' },
  ]

  const toggleAvailabilityCell = (dayOfWeek: number, startMinutes: number) => {
    const key = `${dayOfWeek}-${startMinutes}`
    setAvailabilityChecked((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  /** Converte o set de checkboxes em slots (intervalos consecutivos por dia) */
  const buildSlotsFromGrid = (): { dayOfWeek: number; startMinutes: number; endMinutes: number }[] => {
    const slots: { dayOfWeek: number; startMinutes: number; endMinutes: number }[] = []
    for (const { dayOfWeek } of AVAIL_DIAS) {
      const minutes = AVAIL_HORAS.filter((m) => availabilityChecked.has(`${dayOfWeek}-${m}`)).sort((a, b) => a - b)
      if (minutes.length === 0) continue
      let start = minutes[0]
      let end = start + 30
      for (let i = 1; i <= minutes.length; i++) {
        if (i < minutes.length && minutes[i] === end) {
          end += 30
        } else {
          slots.push({ dayOfWeek, startMinutes: start, endMinutes: end })
          if (i < minutes.length) {
            start = minutes[i]
            end = start + 30
          }
        }
      }
    }
    return slots
  }

  const handleSaveAvailabilityGrid = async () => {
    if (!availabilityModalTeacher) return
    setAvailabilitySaving(true)
    setToast(null)
    try {
      const slots = buildSlotsFromGrid()
      const res = await fetch(`/api/admin/teachers/${availabilityModalTeacher.id}/availability`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ slots }),
      })
      const json = await res.json()
      if (!res.ok || !json.ok) {
        setToast({ message: json.message || 'Erro ao salvar horários', type: 'error' })
        return
      }
      if (json.data?.slots) setAvailabilitySlots(json.data.slots)
      setToast({ message: 'Horários salvos.', type: 'success' })
      setAvailabilityModalTeacher(null)
    } catch {
      setToast({ message: 'Erro ao salvar horários', type: 'error' })
    } finally {
      setAvailabilitySaving(false)
    }
  }

  const handleExportAlunos = () => {
    if (!alunosData) return
    const headers = ['Aluno', 'Dias e horários']
    const rows = alunosData.alunos.map((a) => [a.nome, a.diasHorarios])
    const csv = [headers.join(';'), ...rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(';'))].join('\r\n')
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `alunos-${alunosData.teacher.nome.replace(/\s+/g, '-')}.csv`
    a.click()
    URL.revokeObjectURL(url)
    setToast({ message: 'Exportado!', type: 'success' })
  }

  const toggleSelectTeacher = (id: string) => {
    setSelectedTeacherIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }
  const selectAllTeachers = () => {
    if (selectedTeacherIds.size === teachers.length) {
      setSelectedTeacherIds(new Set())
    } else {
      setSelectedTeacherIds(new Set(teachers.map((t) => t.id)))
    }
  }
  const handleBulkActivate = async () => {
    const ids = teachers.filter((t) => selectedTeacherIds.has(t.id) && t.status !== 'ACTIVE').map((t) => t.id)
    if (ids.length === 0) {
      setToast({ message: 'Nenhum professor inativo nos selecionados.', type: 'error' })
      return
    }
    setBulkActionLoading(true)
    try {
      let ok = 0
      for (const id of ids) {
        const res = await fetch(`/api/admin/teachers/${id}/toggle`, { method: 'POST', credentials: 'include' })
        const json = await res.json()
        if (res.ok && json.ok) ok++
      }
      fetchTeachers()
      setSelectedTeacherIds(new Set())
      setToast({ message: `${ok} professor(es) ativado(s).`, type: 'success' })
    } catch {
      setToast({ message: 'Erro ao ativar selecionados', type: 'error' })
    } finally {
      setBulkActionLoading(false)
    }
  }
  const handleBulkDeactivate = () => {
    const ids = [...selectedTeacherIds]
    if (ids.length === 0) return
    setConfirmModal({
      title: 'Desativar professores',
      message: `Deseja desativar ${ids.length} professor(es) selecionado(s)?`,
      variant: 'danger',
      confirmLabel: 'Sim, desativar',
      onConfirm: async () => {
        setBulkActionLoading(true)
        try {
          let ok = 0
          for (const id of ids) {
            const res = await fetch(`/api/admin/teachers/${id}/toggle`, { method: 'POST', credentials: 'include' })
            const json = await res.json()
            if (res.ok && json.ok) ok++
          }
          fetchTeachers()
          setSelectedTeacherIds(new Set())
          setToast({ message: `${ok} professor(es) desativado(s).`, type: 'success' })
        } catch {
          setToast({ message: 'Erro ao desativar', type: 'error' })
        } finally {
          setBulkActionLoading(false)
          setConfirmModal(null)
        }
      },
    })
  }

  const columns = [
    {
      key: 'select',
      label: ' ',
      fixed: true,
      render: (t: Teacher) => (
        <input
          type="checkbox"
          checked={selectedTeacherIds.has(t.id)}
          onChange={() => toggleSelectTeacher(t.id)}
          onClick={(e) => e.stopPropagation()}
          className="rounded border-gray-300 text-brand-orange focus:ring-brand-orange"
        />
      ),
    },
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
      key: 'acesso',
      label: 'Acesso Dashboard',
      render: (t: Teacher) =>
        t.userId ? (
          <span className="text-green-600 text-sm">Sim</span>
        ) : (
          <button
            type="button"
            onClick={() => {
              setCriarAcessoTeacher(t)
              setCriarAcessoSenha('')
            }}
            className="text-brand-orange hover:text-orange-700 text-sm font-medium flex items-center gap-1"
            title="Criar login para o professor acessar o Dashboard Professores"
          >
            <Key className="w-4 h-4" />
            Criar acesso
          </button>
        ),
    },
    {
      key: 'alterarSenha',
      label: 'Alterar senha',
      render: (t: Teacher) =>
        t.userId ? (
          <button
            type="button"
            onClick={() => {
              setAlterarSenhaTeacher(t)
              setAlterarSenhaNova('')
              setAlterarSenhaConfirmar('')
            }}
            className="text-blue-600 hover:text-blue-800 text-sm font-medium"
            title="Alterar senha do professor"
          >
            Alterar senha
          </button>
        ) : (
          <span className="text-gray-400 text-sm">—</span>
        ),
    },
    {
      key: 'horarios',
      label: 'Horários disponíveis',
      render: (t: Teacher) => (
        <button
          type="button"
          onClick={() => setAvailabilityModalTeacher(t)}
          className="text-brand-orange hover:text-orange-700 text-sm font-medium flex items-center gap-1"
          title="Ver e editar horários disponíveis"
        >
          <Clock className="w-4 h-4" />
          Horários
        </button>
      ),
    },
    {
      key: 'alunos',
      label: 'Alunos',
      render: (t: Teacher) => (
        <button
          type="button"
          onClick={() => setAlunosModalTeacher(t)}
          className="text-blue-600 hover:text-blue-800 text-sm font-medium flex items-center gap-1"
          title="Ver alunos, dias e horários das aulas"
        >
          <Users className="w-4 h-4" />
          Alunos
        </button>
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
          <div className="flex gap-2 flex-wrap">
            <Button
              variant="outline"
              size="md"
              className="flex items-center gap-2"
              onClick={() => setFreeSlotsModalOpen(true)}
            >
              <Clock className="w-4 h-4" />
              Pesquisar horários livres
            </Button>
            <Button
              variant="outline"
              size="md"
              className="flex items-center gap-2"
              onClick={() => {
                setRequestTeacherForm({ horarios: '', idiomas: [] })
                setRequestTeacherModalOpen(true)
              }}
            >
              <Users className="w-4 h-4" />
              Solicitar novo teacher
            </Button>
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

        <div className="mb-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div
            role="button"
            tabIndex={0}
            onClick={() => setListModal({ type: 'nota1', title: 'Professores que precisam ser substituídos' })}
            onKeyDown={(e) => e.key === 'Enter' && setListModal({ type: 'nota1', title: 'Professores que precisam ser substituídos' })}
            className="cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-brand-orange rounded-lg"
          >
            <StatCard
              title="Precisam ser substituídos"
              value={statsLoading ? '...' : (stats?.nota1 ?? 0)}
              icon={<AlertCircle className="w-6 h-6" />}
              color="red"
              subtitle="1 estrela"
            />
          </div>
          <div
            role="button"
            tabIndex={0}
            onClick={() => setListModal({ type: 'nota45', title: 'Professores 4 e 5 estrelas' })}
            onKeyDown={(e) => e.key === 'Enter' && setListModal({ type: 'nota45', title: 'Professores 4 e 5 estrelas' })}
            className="cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-brand-orange rounded-lg"
          >
            <StatCard
              title="4 e 5 estrelas"
              value={statsLoading ? '...' : (stats?.nota45 ?? 0)}
              icon={<Star className="w-6 h-6" />}
              color="green"
            />
          </div>
          <div
            role="button"
            tabIndex={0}
            onClick={() => setListModal({ type: 'nota2', title: 'Professores com problemas' })}
            onKeyDown={(e) => e.key === 'Enter' && setListModal({ type: 'nota2', title: 'Professores com problemas' })}
            className="cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-brand-orange rounded-lg"
          >
            <StatCard
              title="Com problemas"
              value={statsLoading ? '...' : (stats?.nota2 ?? 0)}
              icon={<AlertCircle className="w-6 h-6" />}
              color="orange"
              subtitle="2 estrelas"
            />
          </div>
          <div
            role="button"
            tabIndex={0}
            onClick={() => {
              setTeacherRequestsModalOpen(true)
              fetchTeacherRequests()
            }}
            onKeyDown={(e) => e.key === 'Enter' && (setTeacherRequestsModalOpen(true), fetchTeacherRequests())}
            className="cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-brand-orange rounded-lg"
          >
            <StatCard
              title="Solicitação de professor"
              value={statsLoading ? '...' : (stats?.teacherRequests ?? 0)}
              icon={<Users className="w-6 h-6" />}
              color="blue"
            />
          </div>
        </div>

        <div className="mb-4 flex flex-wrap items-end gap-2">
          <div className="min-w-[200px] max-w-xs">
            <label className="block text-sm font-semibold text-gray-700 mb-1">Pesquisar por nome</label>
            <div className="flex gap-2">
              <input
                type="text"
                value={searchName}
                onChange={(e) => setSearchName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && fetchTeachers({ search: searchName })}
                placeholder="Nome do professor"
                className="input flex-1"
              />
              <Button
                type="button"
                variant="outline"
                size="md"
                onClick={() => fetchTeachers({ search: searchName })}
                className="flex items-center gap-1"
              >
                <Search className="w-4 h-4" />
                Pesquisar
              </Button>
            </div>
          </div>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg text-red-800">
            {error}
          </div>
        )}

        {teachers.length > 0 && (
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={teachers.length > 0 && selectedTeacherIds.size === teachers.length}
                ref={(el) => {
                  if (el) el.indeterminate = selectedTeacherIds.size > 0 && selectedTeacherIds.size < teachers.length
                }}
                onChange={selectAllTeachers}
                className="rounded border-gray-300 text-brand-orange focus:ring-brand-orange"
              />
              <span className="text-sm font-medium text-gray-700">Selecionar todos</span>
            </label>
            {selectedTeacherIds.size > 0 && (
              <>
                <span className="text-sm text-gray-500">({selectedTeacherIds.size} selecionado(s))</span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleBulkActivate}
                  disabled={bulkActionLoading}
                >
                  {bulkActionLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                  Ativar selecionados
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="border-red-200 text-red-700 hover:bg-red-50"
                  onClick={handleBulkDeactivate}
                  disabled={bulkActionLoading}
                >
                  Excluir selecionados
                </Button>
              </>
            )}
          </div>
        )}

        <Table
          columns={columns}
          data={teachers}
          loading={loading}
          emptyMessage="Nenhum professor cadastrado"
          getRowClassName={(t) => {
            const n = t.nota ?? 0
            if (n === 1) return 'bg-red-100'
            if (n === 2) return 'bg-red-50'
            return ''
          }}
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

        {/* Modal lista por cubo (nota 1, 2, 4-5) */}
        <Modal
          isOpen={!!listModal}
          onClose={() => setListModal(null)}
          title={listModal?.title ?? ''}
          size="md"
        >
          {listTeachersLoading ? (
            <p className="text-gray-500">Carregando...</p>
          ) : listTeachers.length === 0 ? (
            <p className="text-gray-500">Nenhum professor.</p>
          ) : (
            <ul className="space-y-2 max-h-[60vh] overflow-y-auto">
              {listTeachers.map((t) => (
                <li key={t.id} className="flex items-center gap-2 py-2 border-b border-gray-100 last:border-0">
                  <StarRating value={t.nota ?? null} />
                  <span className="font-medium">{t.nome}</span>
                  <span className="text-gray-500 text-sm">{t.email}</span>
                </li>
              ))}
            </ul>
          )}
        </Modal>

        {/* Modal Pesquisar horários livres */}
        <Modal
          isOpen={freeSlotsModalOpen}
          onClose={() => {
            setFreeSlotsModalOpen(false)
            setFreeSlotsResult([])
          }}
          title="Pesquisar horários livres"
          size="md"
          footer={
            <>
              <Button variant="outline" onClick={() => setFreeSlotsModalOpen(false)}>
                Fechar
              </Button>
              <Button
                variant="primary"
                disabled={freeSlotsForm.dayOfWeeks.length === 0 || freeSlotsLoading}
                onClick={async () => {
                  if (freeSlotsForm.dayOfWeeks.length === 0) {
                    setToast({ message: 'Selecione ao menos um dia da semana.', type: 'error' })
                    return
                  }
                  setFreeSlotsLoading(true)
                  setFreeSlotsResult([])
                  try {
                    const [sh, sm] = freeSlotsForm.startTime.split(':').map(Number)
                    const [eh, em] = freeSlotsForm.endTime.split(':').map(Number)
                    const startMinutes = sh * 60 + (sm || 0)
                    const endMinutes = eh * 60 + (em || 0)
                    const res = await fetch(
                      `/api/admin/teachers/free-slots?dayOfWeeks=${freeSlotsForm.dayOfWeeks.join(',')}&startMinutes=${startMinutes}&endMinutes=${endMinutes}`,
                      { credentials: 'include' }
                    )
                    const json = await res.json()
                    if (res.ok && json.ok && json.data?.teachers) {
                      setFreeSlotsResult(json.data.teachers)
                      setToast({ message: `${json.data.teachers.length} professor(es) encontrado(s).`, type: 'success' })
                    } else {
                      setToast({ message: json.message || 'Erro ao pesquisar', type: 'error' })
                    }
                  } catch {
                    setToast({ message: 'Erro ao pesquisar horários', type: 'error' })
                  } finally {
                    setFreeSlotsLoading(false)
                  }
                }}
              >
                {freeSlotsLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                Pesquisar
              </Button>
            </>
          }
        >
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">Horário</label>
              <div className="flex items-center gap-2">
                <input
                  type="time"
                  value={freeSlotsForm.startTime}
                  onChange={(e) => setFreeSlotsForm({ ...freeSlotsForm, startTime: e.target.value })}
                  className="input"
                />
                <span>até</span>
                <input
                  type="time"
                  value={freeSlotsForm.endTime}
                  onChange={(e) => setFreeSlotsForm({ ...freeSlotsForm, endTime: e.target.value })}
                  className="input"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">Dias da semana (selecione ao menos 1)</label>
              <div className="flex flex-wrap gap-2">
                {[
                  { d: 0, label: 'Dom' },
                  { d: 1, label: 'Seg' },
                  { d: 2, label: 'Ter' },
                  { d: 3, label: 'Qua' },
                  { d: 4, label: 'Qui' },
                  { d: 5, label: 'Sex' },
                  { d: 6, label: 'Sáb' },
                ].map(({ d, label }) => (
                  <label key={d} className="flex items-center gap-1 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={freeSlotsForm.dayOfWeeks.includes(d)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setFreeSlotsForm({ ...freeSlotsForm, dayOfWeeks: [...freeSlotsForm.dayOfWeeks, d].sort((a, b) => a - b) })
                        } else {
                          setFreeSlotsForm({ ...freeSlotsForm, dayOfWeeks: freeSlotsForm.dayOfWeeks.filter((x) => x !== d) })
                        }
                      }}
                      className="rounded border-gray-300 text-brand-orange focus:ring-brand-orange"
                    />
                    <span className="text-sm">{label}</span>
                  </label>
                ))}
              </div>
            </div>
            {freeSlotsResult.length > 0 && (
              <div className="pt-2 border-t">
                <p className="text-sm font-semibold text-gray-700 mb-2">Professores sem aula nesse(s) horário(s):</p>
                <ul className="space-y-2">
                  {freeSlotsResult.map((t) => {
                    const ensina = (t.idiomasEnsina ?? []).map((c) => IDIOMAS_OPCOES.find((o) => o.value === c)?.label ?? c).filter(Boolean)
                    const fala = (t.idiomasFala ?? []).map((c) => IDIOMAS_OPCOES.find((o) => o.value === c)?.label ?? c).filter(Boolean)
                    return (
                      <li key={t.id} className="text-sm border-b border-gray-100 pb-2 last:border-0 last:pb-0">
                        <span className="font-medium text-gray-900">{t.nome}</span>
                        {(ensina.length > 0 || fala.length > 0) && (
                          <div className="mt-0.5 text-gray-600 text-xs">
                            {ensina.length > 0 && <span>Ensina: {ensina.join(', ')}</span>}
                            {ensina.length > 0 && fala.length > 0 && ' · '}
                            {fala.length > 0 && <span>Fala: {fala.join(', ')}</span>}
                          </div>
                        )}
                      </li>
                    )
                  })}
                </ul>
              </div>
            )}
          </div>
        </Modal>

        {/* Modal Solicitar novo teacher */}
        <Modal
          isOpen={requestTeacherModalOpen}
          onClose={() => setRequestTeacherModalOpen(false)}
          title="Solicitar novo teacher"
          size="md"
          footer={
            <>
              <Button variant="outline" onClick={() => setRequestTeacherModalOpen(false)}>
                Cancelar
              </Button>
              <Button
                variant="primary"
                disabled={!requestTeacherForm.horarios.trim() || requestTeacherSaving}
                onClick={async () => {
                  setRequestTeacherSaving(true)
                  try {
                    const res = await fetch('/api/admin/teacher-requests', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      credentials: 'include',
                      body: JSON.stringify({
                        horarios: requestTeacherForm.horarios.trim(),
                        idiomas: requestTeacherForm.idiomas.join(', '),
                      }),
                    })
                    const json = await res.json()
                    if (res.ok && json.ok) {
                      setRequestTeacherModalOpen(false)
                      fetchStats()
                      setToast({ message: 'Solicitação registrada. Aparece no cubo "Solicitação de professor".', type: 'success' })
                    } else {
                      setToast({ message: json.message || 'Erro ao criar solicitação', type: 'error' })
                    }
                  } catch {
                    setToast({ message: 'Erro ao criar solicitação', type: 'error' })
                  } finally {
                    setRequestTeacherSaving(false)
                  }
                }}
              >
                {requestTeacherSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                Salvar
              </Button>
            </>
          }
        >
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">Quais horários e dias da semana?</label>
              <textarea
                value={requestTeacherForm.horarios}
                onChange={(e) => setRequestTeacherForm({ ...requestTeacherForm, horarios: e.target.value })}
                className="input w-full min-h-[80px]"
                placeholder="Ex.: Segunda e Quarta 9h-12h, Sexta 14h-18h"
                rows={3}
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">Idiomas do professor</label>
              <div className="flex flex-wrap gap-2">
                {IDIOMAS_OPCOES.map((opt) => (
                  <label key={opt.value} className="flex items-center gap-1 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={requestTeacherForm.idiomas.includes(opt.value)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setRequestTeacherForm({ ...requestTeacherForm, idiomas: [...requestTeacherForm.idiomas, opt.value] })
                        } else {
                          setRequestTeacherForm({ ...requestTeacherForm, idiomas: requestTeacherForm.idiomas.filter((x) => x !== opt.value) })
                        }
                      }}
                      className="rounded border-gray-300 text-brand-orange focus:ring-brand-orange"
                    />
                    <span className="text-sm">{opt.label}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>
        </Modal>

        {/* Modal Solicitação de professor (lista com X para apagar) */}
        <Modal
          isOpen={teacherRequestsModalOpen}
          onClose={() => setTeacherRequestsModalOpen(false)}
          title="Solicitação de professor"
          size="md"
        >
          {teacherRequestsLoading ? (
            <p className="text-gray-500">Carregando...</p>
          ) : teacherRequests.length === 0 ? (
            <p className="text-gray-500">Nenhuma solicitação.</p>
          ) : (
            <ul className="space-y-3 max-h-[60vh] overflow-y-auto">
              {teacherRequests.map((r) => (
                <li key={r.id} className="flex items-start justify-between gap-2 p-3 border border-gray-200 rounded-lg bg-gray-50">
                  <div>
                    <p className="font-medium text-gray-900">{r.horarios}</p>
                    {r.idiomas && <p className="text-sm text-gray-600">Idiomas: {r.idiomas}</p>}
                    <p className="text-xs text-gray-500 mt-1">{new Date(r.criadoEm).toLocaleDateString('pt-BR')}</p>
                  </div>
                  <button
                    type="button"
                    onClick={async () => {
                      try {
                        const res = await fetch(`/api/admin/teacher-requests/${r.id}`, { method: 'DELETE', credentials: 'include' })
                        const json = await res.json()
                        if (res.ok && json.ok) {
                          setTeacherRequests((prev) => prev.filter((x) => x.id !== r.id))
                          fetchStats()
                          setToast({ message: 'Solicitação removida.', type: 'success' })
                        } else {
                          setToast({ message: json.message || 'Erro ao remover', type: 'error' })
                        }
                      } catch {
                        setToast({ message: 'Erro ao remover', type: 'error' })
                      }
                    }}
                    className="shrink-0 p-1 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded"
                    title="Remover solicitação"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Modal>

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
                Idiomas que o professor fala
              </label>
              <div className="flex flex-wrap gap-4">
                {IDIOMAS_OPCOES.map((opt) => (
                  <label key={opt.value} className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formData.idiomasFala.includes(opt.value)}
                      onChange={(e) => {
                        const next = e.target.checked
                          ? [...formData.idiomasFala, opt.value]
                          : formData.idiomasFala.filter((x) => x !== opt.value)
                        setFormData({ ...formData, idiomasFala: next })
                      }}
                      className="rounded border-gray-300"
                    />
                    <span className="text-sm">{opt.label}</span>
                  </label>
                ))}
              </div>
              <p className="text-xs text-gray-500 mt-1">Idiomas em que o professor se comunica (ex.: para avisos).</p>
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Idiomas de aula (que o professor ensina)
              </label>
              <div className="flex flex-wrap gap-4">
                {IDIOMAS_OPCOES.map((opt) => (
                  <label key={opt.value} className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formData.idiomasEnsina.includes(opt.value)}
                      onChange={(e) => {
                        const next = e.target.checked
                          ? [...formData.idiomasEnsina, opt.value]
                          : formData.idiomasEnsina.filter((x) => x !== opt.value)
                        setFormData({ ...formData, idiomasEnsina: next })
                      }}
                      className="rounded border-gray-300"
                    />
                    <span className="text-sm">{opt.label}</span>
                  </label>
                ))}
              </div>
              <p className="text-xs text-gray-500 mt-1">Idiomas em que o professor dá aula (inglês, espanhol, etc.).</p>
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
            <div className="rounded-lg border border-blue-200 bg-blue-50 p-3">
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Senha para acesso ao Dashboard Professores <span className="text-gray-500 font-normal">(opcional)</span>
              </label>
              <input
                type="password"
                value={formData.senha}
                onChange={(e) => setFormData({ ...formData, senha: e.target.value })}
                className="input w-full"
                placeholder="Deixe em branco para usar 123456 (professor altera no 1º acesso)"
                minLength={6}
                autoComplete="new-password"
              />
              <p className="text-xs text-gray-600 mt-1">
                Em branco: senha padrão 123456 (o professor deve alterar no primeiro acesso). Preencha para definir outra senha.
              </p>
            </div>
          </form>
        </Modal>

        {/* Modal Criar acesso ao Dashboard (para professor sem userId) */}
        <Modal
          isOpen={!!criarAcessoTeacher}
          onClose={() => {
            setCriarAcessoTeacher(null)
            setCriarAcessoSenha('')
          }}
          title={`Criar acesso ao Dashboard – ${criarAcessoTeacher?.nome ?? ''}`}
          size="md"
          footer={
            <>
              <Button
                variant="outline"
                onClick={() => {
                  setCriarAcessoTeacher(null)
                  setCriarAcessoSenha('')
                }}
              >
                Cancelar
              </Button>
              <Button
                variant="primary"
                onClick={handleCriarAcessoSubmit}
                disabled={criarAcessoLoading}
              >
                {criarAcessoLoading ? 'Salvando...' : criarAcessoSenha.trim().length >= 6 ? 'Criar acesso' : 'Usar senha padrão (123456)'}
              </Button>
            </>
          }
        >
          {criarAcessoTeacher && (
            <div className="space-y-4">
              <p className="text-sm text-gray-600">
                O professor <strong>{criarAcessoTeacher.nome}</strong> acessará o Dashboard Professores com o email <strong>{criarAcessoTeacher.email}</strong>. Deixe em branco para usar a senha padrão <strong>123456</strong> (o professor deverá alterar no primeiro acesso) ou defina uma senha personalizada.
              </p>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Senha <span className="text-gray-500 font-normal">(opcional – padrão: 123456)</span>
                </label>
                <input
                  type="password"
                  value={criarAcessoSenha}
                  onChange={(e) => setCriarAcessoSenha(e.target.value)}
                  className="input w-full"
                  placeholder="Deixe em branco para 123456"
                  minLength={6}
                  autoComplete="new-password"
                />
              </div>
            </div>
          )}
        </Modal>

        {/* Modal Alterar senha do professor (admin) */}
        <Modal
          isOpen={!!alterarSenhaTeacher}
          onClose={() => {
            setAlterarSenhaTeacher(null)
            setAlterarSenhaNova('')
            setAlterarSenhaConfirmar('')
          }}
          title={`Alterar senha – ${alterarSenhaTeacher?.nome ?? ''}`}
          size="md"
          footer={
            <>
              <Button
                variant="outline"
                onClick={() => {
                  setAlterarSenhaTeacher(null)
                  setAlterarSenhaNova('')
                  setAlterarSenhaConfirmar('')
                }}
              >
                Cancelar
              </Button>
              <Button
                variant="primary"
                onClick={handleAlterarSenhaSubmit}
                disabled={alterarSenhaNova.trim().length < 6 || alterarSenhaNova !== alterarSenhaConfirmar || alterarSenhaLoading}
              >
                {alterarSenhaLoading ? 'Salvando...' : 'Alterar senha'}
              </Button>
            </>
          }
        >
          {alterarSenhaTeacher && (
            <div className="space-y-4">
              <p className="text-sm text-gray-600">
                Defina uma nova senha para o professor <strong>{alterarSenhaTeacher.nome}</strong>. Ele usará o mesmo email e esta nova senha no próximo login.
              </p>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Nova senha <span className="text-red-500">*</span>
                </label>
                <input
                  type="password"
                  value={alterarSenhaNova}
                  onChange={(e) => setAlterarSenhaNova(e.target.value)}
                  className="input w-full"
                  placeholder="Mínimo 6 caracteres"
                  minLength={6}
                  autoComplete="new-password"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Confirmar nova senha <span className="text-red-500">*</span>
                </label>
                <input
                  type="password"
                  value={alterarSenhaConfirmar}
                  onChange={(e) => setAlterarSenhaConfirmar(e.target.value)}
                  className="input w-full"
                  placeholder="Repita a nova senha"
                  minLength={6}
                  autoComplete="new-password"
                />
              </div>
            </div>
          )}
        </Modal>

        {/* Modal Horários disponíveis – tabela de dias e horários para ticar */}
        <Modal
          isOpen={!!availabilityModalTeacher}
          onClose={() => setAvailabilityModalTeacher(null)}
          title={`Horários disponíveis – ${availabilityModalTeacher?.nome ?? ''}`}
          size="lg"
          footer={
            <>
              <Button variant="outline" onClick={() => setAvailabilityModalTeacher(null)}>
                Fechar
              </Button>
              <Button
                variant="primary"
                onClick={handleSaveAvailabilityGrid}
                disabled={availabilityLoading || availabilitySaving}
                className="flex items-center gap-2"
              >
                {availabilitySaving && <Loader2 className="w-4 h-4 animate-spin" />}
                {availabilitySaving ? 'Salvando...' : 'Salvar horários'}
              </Button>
            </>
          }
        >
          {availabilityModalTeacher && (
            <div className="space-y-4">
              <p className="text-sm text-gray-600">
                Por padrão o professor está disponível em <strong>todos os horários</strong>. Marque os horários em que ele pode dar aula; fora desses períodos aparecerá como &quot;Indisponível&quot; ao agendar.
              </p>
              {availabilityLoading ? (
                <div className="flex items-center gap-2 text-gray-500">
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Carregando...
                </div>
              ) : (
                <div className="overflow-x-auto -mx-2">
                  <table className="w-full border-collapse text-sm min-w-[1400px]">
                    <thead>
                      <tr className="border-b border-gray-200">
                        <th className="text-left py-2 px-2 font-semibold text-gray-700 w-14">Dia</th>
                        {AVAIL_HORAS.map((m) => (
                          <th key={m} className="py-2 px-1 text-center font-semibold text-gray-600 w-12">
                            {minutesToTime(m)}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {AVAIL_DIAS.map(({ dayOfWeek, label }) => (
                        <tr key={dayOfWeek} className="border-b border-gray-100 hover:bg-gray-50/50">
                          <td className="py-1.5 px-2 font-medium text-gray-800">{label}</td>
                          {AVAIL_HORAS.map((startMinutes) => {
                            const key = `${dayOfWeek}-${startMinutes}`
                            const checked = availabilityChecked.has(key)
                            return (
                              <td key={key} className="py-1 px-1 text-center">
                                <label className="inline-flex items-center justify-center w-10 h-8 cursor-pointer rounded border border-gray-200 hover:bg-gray-100">
                                  <input
                                    type="checkbox"
                                    checked={checked}
                                    onChange={() => toggleAvailabilityCell(dayOfWeek, startMinutes)}
                                    className="rounded border-gray-300 text-brand-orange focus:ring-brand-orange w-4 h-4"
                                  />
                                </label>
                              </td>
                            )
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </Modal>

        {/* Modal Alunos do professor */}
        <Modal
          isOpen={!!alunosModalTeacher}
          onClose={() => setAlunosModalTeacher(null)}
          title={`Alunos – ${alunosModalTeacher?.nome ?? ''}`}
          size="lg"
          footer={
            <>
              <Button variant="outline" onClick={handleExportAlunos} disabled={!alunosData?.alunos?.length}>
                <Download className="w-4 h-4 mr-2" />
                Exportar CSV
              </Button>
              <Button variant="primary" onClick={() => setAlunosModalTeacher(null)}>
                Fechar
              </Button>
            </>
          }
        >
          {alunosModalTeacher && (
            <div className="space-y-4">
              {alunosLoading ? (
                <div className="flex items-center gap-2 text-gray-500">
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Carregando...
                </div>
              ) : alunosData?.alunos?.length ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm border-collapse">
                    <thead>
                      <tr className="border-b border-gray-200">
                        <th className="text-left py-2 px-2 font-semibold text-gray-700">Aluno</th>
                        <th className="text-left py-2 px-2 font-semibold text-gray-700">Dias e horários</th>
                      </tr>
                    </thead>
                    <tbody>
                      {alunosData.alunos.map((a) => (
                        <tr key={a.enrollmentId} className="border-b border-gray-100">
                          <td className="py-2 px-2">{a.nome}</td>
                          <td className="py-2 px-2 text-gray-600">{a.diasHorarios || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-gray-500 text-sm">Nenhum aluno com aulas agendadas para este professor.</p>
              )}
            </div>
          )}
        </Modal>
      </div>
    </AdminLayout>
  )
}
