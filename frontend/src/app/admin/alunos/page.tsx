/**
 * Página Admin: Alunos (Students)
 *
 * Lista de alunos (matrículas) do instituto + formulário Adicionar aluno
 */

'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import AdminLayout from '@/components/admin/AdminLayout'
import Table from '@/components/admin/Table'
import Modal from '@/components/admin/Modal'
import Toast from '@/components/admin/Toast'
import Button from '@/components/ui/Button'
import ConfirmModal from '@/components/admin/ConfirmModal'
import { Plus, Edit, Bell, Trash2, FileSpreadsheet, Upload, Undo2, Key, UserPlus, Users, UserCheck, UserX, GraduationCap, AlertTriangle, FileDown, Loader2 } from 'lucide-react'
import StatCard from '@/components/admin/StatCard'

interface StudentAlertItem {
  id: string
  message: string
  level: string | null
}

interface Student {
  id: string
  nome: string
  email: string
  whatsapp: string
  idioma: string | null
  nivel: string | null
  status: string
  trackingCode: string | null
  criadoEm: string
  dataNascimento?: string | null
  observacoes?: string | null
  alerts?: StudentAlertItem[]
  alertsCount?: number
  nomeResponsavel?: string | null
  cpf?: string | null
  cpfResponsavel?: string | null
  curso?: string | null
  frequenciaSemanal?: number | null
  tempoAulaMinutos?: number | null
  tipoAula?: string | null
  nomeGrupo?: string | null
  teacherNameForWeek?: string | null
  cep?: string | null
  rua?: string | null
  cidade?: string | null
  estado?: string | null
  numero?: string | null
  complemento?: string | null
  moraNoExterior?: boolean
  enderecoExterior?: string | null
  valorMensalidade?: string | number | null
  metodoPagamento?: string | null
  diaPagamento?: number | null
  melhoresHorarios?: string | null
  melhoresDiasSemana?: string | null
  nomeVendedor?: string | null
  nomeEmpresaOuIndicador?: string | null
  escolaMatricula?: string | null
  escolaMatriculaOutro?: string | null
  activationDate?: string | null
  user?: { id: string; nome: string; email: string; whatsapp: string | null } | null
}

const TEMPO_AULA_OPCOES = [
  { value: 30, label: '00:30' },
  { value: 40, label: '00:40' },
  { value: 60, label: '01:00' },
  { value: 120, label: '02:00' },
]

function isMenorDeIdade(dataNascimento: string | null): boolean {
  if (!dataNascimento) return false
  const nasc = new Date(dataNascimento)
  const hoje = new Date()
  let idade = hoje.getFullYear() - nasc.getFullYear()
  const m = hoje.getMonth() - nasc.getMonth()
  if (m < 0 || (m === 0 && hoje.getDate() < nasc.getDate())) idade--
  return idade < 18
}

function calcularIdade(dataNascimento: string | null | undefined): number | null {
  if (!dataNascimento) return null
  const nasc = new Date(dataNascimento)
  const hoje = new Date()
  let idade = hoje.getFullYear() - nasc.getFullYear()
  const m = hoje.getMonth() - nasc.getMonth()
  if (m < 0 || (m === 0 && hoje.getDate() < nasc.getDate())) idade--
  return idade >= 0 ? idade : null
}

function getMonday(d: Date): Date {
  const date = new Date(d)
  const day = date.getDay()
  const diff = day === 0 ? -6 : 1 - day
  date.setDate(date.getDate() + diff)
  date.setHours(0, 0, 0, 0)
  return date
}

async function buscarCep(cep: string): Promise<{ logradouro: string; localidade: string; uf: string } | null> {
  const limpo = cep.replace(/\D/g, '')
  if (limpo.length !== 8) return null
  try {
    const res = await fetch(`https://viacep.com.br/ws/${limpo}/json/`)
    const data = await res.json()
    if (data.erro) return null
    return {
      logradouro: data.logradouro || '',
      localidade: data.localidade || '',
      uf: data.uf || '',
    }
  } catch {
    return null
  }
}

const LAST_IMPORTED_IDS_KEY = 'seidmann_admin_last_imported_ids'

const STATUS_LABELS: Record<string, string> = {
  LEAD: 'Lead',
  REGISTERED: 'Matriculado',
  CONTRACT_ACCEPTED: 'Contrato aceito',
  PAYMENT_PENDING: 'Pagamento pendente',
  ACTIVE: 'Ativo',
  INACTIVE: 'Inativo',
  PAUSED: 'Pausado',
  BLOCKED: 'Bloqueado',
  COMPLETED: 'Concluído',
}

const MESES = [
  { value: '', label: 'Todos' },
  { value: '1', label: 'Janeiro' },
  { value: '2', label: 'Fevereiro' },
  { value: '3', label: 'Março' },
  { value: '4', label: 'Abril' },
  { value: '5', label: 'Maio' },
  { value: '6', label: 'Junho' },
  { value: '7', label: 'Julho' },
  { value: '8', label: 'Agosto' },
  { value: '9', label: 'Setembro' },
  { value: '10', label: 'Outubro' },
  { value: '11', label: 'Novembro' },
  { value: '12', label: 'Dezembro' },
]

function formatEndereco(s: Student): string {
  if ((s as { moraNoExterior?: boolean }).moraNoExterior && (s as { enderecoExterior?: string | null }).enderecoExterior) {
    return (s as { enderecoExterior: string }).enderecoExterior
  }
  const parts = [
    (s as { rua?: string | null }).rua,
    (s as { numero?: string | null }).numero,
    (s as { complemento?: string | null }).complemento,
    (s as { cep?: string | null }).cep,
    (s as { cidade?: string | null }).cidade,
    (s as { estado?: string | null }).estado,
  ].filter(Boolean)
  return parts.length ? parts.join(', ') : '—'
}

const REPORT_COLUMNS: { key: string; label: string; getValue: (s: Student) => string }[] = [
  { key: 'nome', label: 'Nome', getValue: (s) => (s.nome ?? '').replace(/;/g, ',') },
  { key: 'idade', label: 'Idade', getValue: (s) => (calcularIdade(s.dataNascimento) ?? '—').toString() },
  { key: 'email', label: 'Email', getValue: (s) => (s.email ?? '').replace(/;/g, ',') },
  { key: 'whatsapp', label: 'WhatsApp', getValue: (s) => (s.whatsapp ?? '').replace(/;/g, ',') },
  { key: 'cpf', label: 'CPF', getValue: (s) => (s.cpf ?? '').replace(/;/g, ',') },
  { key: 'endereco', label: 'Endereço', getValue: (s) => formatEndereco(s).replace(/;/g, ',').replace(/\n/g, ' ') },
  { key: 'valorMensalidade', label: 'Valor', getValue: (s) => (s.valorMensalidade != null ? String(s.valorMensalidade).replace('.', ',') : '—') },
  { key: 'tipoAula', label: 'Tipo', getValue: (s) => (s.tipoAula === 'PARTICULAR' ? 'Particular' : s.nomeGrupo ? `Grupo/${s.nomeGrupo}` : s.tipoAula ?? '—') },
  { key: 'teacherNameForWeek', label: 'Professor (semana)', getValue: (s) => (s.teacherNameForWeek ?? 's/ professor').replace(/;/g, ',') },
  { key: 'status', label: 'Status', getValue: (s) => STATUS_LABELS[s.status] ?? s.status ?? '—' },
  { key: 'trackingCode', label: 'Código', getValue: (s) => (s.trackingCode ?? '').replace(/;/g, ',') },
  { key: 'criadoEm', label: 'Criado em', getValue: (s) => s.criadoEm ? new Date(s.criadoEm).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—' },
  { key: 'escolaMatricula', label: 'Escola de matrícula', getValue: (s) => (s.escolaMatricula === 'SEIDMANN' ? 'Seidmann' : s.escolaMatricula === 'YOUBECOME' ? 'Youbecome' : s.escolaMatricula === 'HIGHWAY' ? 'Highway' : s.escolaMatricula === 'OUTRO' ? (s.escolaMatriculaOutro || 'Outro') : '—') },
]

const initialForm = {
  nome: '',
  email: '',
  whatsapp: '',
  dataNascimento: '',
  nomeResponsavel: '',
  cpf: '',
  cpfResponsavel: '',
  curso: '',
  frequenciaSemanal: '',
  tempoAulaMinutos: '',
  tipoAula: '',
  nomeGrupo: '',
  cep: '',
  rua: '',
  cidade: '',
  estado: '',
  numero: '',
  complemento: '',
  moraNoExterior: false,
  enderecoExterior: '',
  valorMensalidade: '',
  metodoPagamento: '',
  diaPagamento: '',
  melhoresHorarios: '',
  melhoresDiasSemana: '',
  nomeVendedor: '',
  nomeEmpresaOuIndicador: '',
  escolaMatricula: '',
  escolaMatriculaOutro: '',
  observacoes: '',
  status: 'ACTIVE',
  activationDate: '',
}

export default function AdminAlunosPage() {
  const router = useRouter()
  const [students, setStudents] = useState<Student[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filters, setFilters] = useState({ status: '', search: '', tipo: '', professor: '', escola: '' })
  const [sortKey, setSortKey] = useState<string>('criadoEm')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [formData, setFormData] = useState(initialForm)
  const [submitLoading, setSubmitLoading] = useState(false)
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null)
  const [cepLoading, setCepLoading] = useState(false)
  const [editingStudent, setEditingStudent] = useState<Student | null>(null)
  const [alertsModalStudent, setAlertsModalStudent] = useState<Student | null>(null)
  const [createAlertModalStudent, setCreateAlertModalStudent] = useState<Student | null>(null)
  const [newAlertForm, setNewAlertForm] = useState({ message: '', level: 'INFO' })
  const [confirmModal, setConfirmModal] = useState<{ title: string; message: string; onConfirm: () => void; variant?: 'danger'; confirmLabel?: string } | null>(null)
  const [importModalOpen, setImportModalOpen] = useState(false)
  const [importFile, setImportFile] = useState<File | null>(null)
  const [importLoading, setImportLoading] = useState(false)
  const [importResult, setImportResult] = useState<{
    created: number
    enrollments: { id: string; nome: string; email: string }[]
    errors: { row: number; message: string }[]
  } | null>(null)
  const [lastImportedIds, setLastImportedIds] = useState<string[]>(() => {
    if (typeof window === 'undefined') return []
    try {
      const raw = localStorage.getItem(LAST_IMPORTED_IDS_KEY)
      if (!raw) return []
      const parsed = JSON.parse(raw)
      return Array.isArray(parsed) ? parsed.filter((id: unknown) => typeof id === 'string') : []
    } catch {
      return []
    }
  })
  const [importValidationErrors, setImportValidationErrors] = useState<{
    message: string
    validationErrors: { row: number; message: string }[]
    totalValidationErrors: number
  } | null>(null)
  const [passwordModalStudent, setPasswordModalStudent] = useState<Student | null>(null)
  const [passwordForm, setPasswordForm] = useState({ novaSenha: '123456', obrigarAlteracao: true })
  const [passwordLoading, setPasswordLoading] = useState(false)
  const [stats, setStats] = useState<{
    porEscola: { seidmann: number; youbecome: number; highway: number; outros: number }
    porStatus: { ativos: number; inativos: number; pausados: number }
    semProfessor: number
  } | null>(null)
  const [statsLoading, setStatsLoading] = useState(true)
  const [listModal, setListModal] = useState<{ title: string; type: string } | null>(null)
  const [listData, setListData] = useState<
    | { id: string; nome: string; escola?: string }[]
    | {
        id: string
        nome: string
        suggestions: { lessonId: string; startAt: string; teachers: { id: string; nome: string }[] }[]
        lessonTimes?: { startAt: string }[]
      }[]
  >([])
  const [listLoading, setListLoading] = useState(false)
  const [wrongFrequencyStats, setWrongFrequencyStats] = useState<{
    count: number
    list: { enrollmentId: string; studentName: string; expected: number; actual: number }[]
  }>({ count: 0, list: [] })
  const defaultVisibleColumnKeys = ['select', 'nome', 'idade', 'email', 'whatsapp', 'cpf', 'endereco', 'valorMensalidade', 'tipoAula', 'teacherNameForWeek', 'status', 'trackingCode', 'criadoEm', 'actions']
  const [visibleColumnKeys, setVisibleColumnKeys] = useState<string[]>(() => defaultVisibleColumnKeys)
  const [selectedStudentIds, setSelectedStudentIds] = useState<Set<string>>(new Set())
  const [bulkActionLoading, setBulkActionLoading] = useState(false)
  const [bulkEscola, setBulkEscola] = useState<string>('')
  const [reportModalOpen, setReportModalOpen] = useState(false)
  const [reportColumnKeys, setReportColumnKeys] = useState<string[]>(() => REPORT_COLUMNS.map((c) => c.key))
  const [reportFilters, setReportFilters] = useState({ escola: '', status: '', tipo: '', mes: '', ano: '' })
  const isMinor = isMenorDeIdade(formData.dataNascimento || null)

  useEffect(() => {
    fetchStudents()
    fetchStats()
    fetchWrongFrequencyStats()
  }, [filters])

  const fetchStats = useCallback(async () => {
    setStatsLoading(true)
    try {
      const monday = getMonday(new Date())
      const res = await fetch(`/api/admin/enrollments/stats?weekStart=${monday.toISOString()}`, {
        credentials: 'include',
      })
      if (res.ok) {
        const json = await res.json()
        if (json.ok && json.data) setStats(json.data)
      }
    } catch (e) {
      console.error(e)
    } finally {
      setStatsLoading(false)
    }
  }, [])

  const fetchWrongFrequencyStats = useCallback(async () => {
    try {
      const monday = getMonday(new Date())
      const res = await fetch(`/api/admin/lessons/stats?weekStart=${monday.toISOString()}`, {
        credentials: 'include',
      })
      if (res.ok) {
        const json = await res.json()
        if (json.ok && json.data?.wrongFrequencyList) {
          setWrongFrequencyStats({
            count: json.data.wrongFrequencyCount ?? 0,
            list: json.data.wrongFrequencyList,
          })
        } else {
          setWrongFrequencyStats({ count: 0, list: [] })
        }
      }
    } catch (e) {
      console.error(e)
      setWrongFrequencyStats({ count: 0, list: [] })
    }
  }, [])

  const openListModal = useCallback(
    async (type: string, title: string) => {
      setListModal({ title, type })
      setListData([])
      setListLoading(true)
      try {
        const monday = getMonday(new Date())
        const url = type === 'studentsWithoutTeacherWeek'
          ? `/api/admin/dashboard-lists?type=${type}&weekStart=${monday.toISOString()}`
          : `/api/admin/dashboard-lists?type=${type}`
        const res = await fetch(url, { credentials: 'include' })
        const json = await res.json()
        if (res.ok && json.ok && Array.isArray(json.data)) {
          setListData(json.data)
        } else {
          setListData([])
        }
      } catch {
        setListData([])
      } finally {
        setListLoading(false)
      }
    },
    []
  )

  const fetchStudents = async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (filters.status) params.append('status', filters.status)
      if (filters.search) params.append('search', filters.search)
      params.append('weekStart', getMonday(new Date()).toISOString())
      const response = await fetch(`/api/admin/enrollments?${params.toString()}`, {
        credentials: 'include',
      })
      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          router.push('/login?tab=admin')
          return
        }
        throw new Error('Erro ao carregar alunos')
      }
      const json = await response.json()
      if (json.ok) {
        setStudents(json.data.enrollments || [])
      } else {
        throw new Error(json.message || 'Erro ao carregar alunos')
      }
    } catch (err) {
      console.error('Erro ao buscar alunos:', err)
      setError(err instanceof Error ? err.message : 'Erro ao carregar dados')
    } finally {
      setLoading(false)
    }
  }

  const handleOpenModal = useCallback(() => {
    setEditingStudent(null)
    setFormData(initialForm)
    setIsModalOpen(true)
  }, [])

  const handleEdit = useCallback((s: Student) => {
    const dataNascimento = s.dataNascimento
      ? new Date(s.dataNascimento).toISOString().slice(0, 10)
      : ''
    setEditingStudent(s)
    setFormData({
      nome: s.nome || '',
      email: s.email || '',
      whatsapp: s.whatsapp || '',
      dataNascimento,
      nomeResponsavel: s.nomeResponsavel ?? '',
      cpf: s.cpf ?? '',
      cpfResponsavel: s.cpfResponsavel ?? '',
      curso: s.curso ?? '',
      frequenciaSemanal: s.frequenciaSemanal != null ? String(s.frequenciaSemanal) : '',
      tempoAulaMinutos: s.tempoAulaMinutos != null ? String(s.tempoAulaMinutos) : '',
      tipoAula: s.tipoAula ?? '',
      nomeGrupo: s.nomeGrupo ?? '',
      cep: s.cep ?? '',
      rua: s.rua ?? '',
      cidade: s.cidade ?? '',
      estado: s.estado ?? '',
      numero: s.numero ?? '',
      complemento: s.complemento ?? '',
      moraNoExterior: Boolean(s.moraNoExterior),
      enderecoExterior: s.enderecoExterior ?? '',
      valorMensalidade: s.valorMensalidade != null ? String(s.valorMensalidade) : '',
      metodoPagamento: s.metodoPagamento ?? '',
      diaPagamento: s.diaPagamento != null ? String(s.diaPagamento) : '',
      melhoresHorarios: s.melhoresHorarios ?? '',
      melhoresDiasSemana: s.melhoresDiasSemana ?? '',
      nomeVendedor: s.nomeVendedor ?? '',
      nomeEmpresaOuIndicador: s.nomeEmpresaOuIndicador ?? '',
      escolaMatricula: s.escolaMatricula ?? '',
      escolaMatriculaOutro: s.escolaMatriculaOutro ?? '',
      observacoes: s.observacoes ?? '',
      status: s.status || 'ACTIVE',
      activationDate: s.activationDate ? new Date(s.activationDate).toISOString().slice(0, 10) : '',
    })
    setIsModalOpen(true)
  }, [])

  const handleStatusChange = useCallback(
    async (s: Student, newStatus: string) => {
      try {
        const res = await fetch(`/api/admin/enrollments/${s.id}/status`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ status: newStatus }),
        })
        const json = await res.json()
        if (!res.ok || !json.ok) {
          throw new Error(json.message || 'Erro ao alterar status')
        }
        fetchStudents()
        setToast({ message: 'Status atualizado!', type: 'success' })
      } catch (err) {
        setToast({
          message: err instanceof Error ? err.message : 'Erro ao alterar status',
          type: 'error',
        })
      }
    },
    []
  )

  const openCreateAlertModal = (s: Student) => {
    setCreateAlertModalStudent(s)
    setNewAlertForm({ message: '', level: 'INFO' })
  }

  const handleCreateAlertSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!createAlertModalStudent || !newAlertForm.message.trim()) return
    try {
      const res = await fetch('/api/admin/student-alerts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          enrollmentId: createAlertModalStudent.id,
          message: newAlertForm.message.trim(),
          level: newAlertForm.level,
        }),
      })
      const json = await res.json()
      if (json.ok) {
        setCreateAlertModalStudent(null)
        setNewAlertForm({ message: '', level: 'INFO' })
        setToast({ message: 'Alerta criado com sucesso!', type: 'success' })
        fetchStudents().then(() => {
          if (alertsModalStudent) {
            const updated = students.find((x) => x.id === alertsModalStudent.id)
            if (updated) setAlertsModalStudent(updated)
          }
        })
      } else {
        setToast({ message: json.message || 'Erro ao criar alerta', type: 'error' })
      }
    } catch (err) {
      setToast({ message: 'Erro ao criar alerta', type: 'error' })
    }
  }

  const handleDeleteStudentAlert = (alertId: string) => {
    setConfirmModal({
      title: 'Excluir alerta',
      message: 'Deseja excluir este alerta?',
      variant: 'danger',
      confirmLabel: 'Excluir',
      onConfirm: async () => {
        try {
          const res = await fetch(`/api/admin/student-alerts/${alertId}`, {
            method: 'DELETE',
            credentials: 'include',
          })
          const json = await res.json()
          if (json.ok) {
            fetchStudents()
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

  const getAlertLevelStyles = (level: string | null) => {
    switch (level?.toUpperCase()) {
      case 'ERROR':
        return 'bg-red-100 text-red-800 border-red-200'
      case 'WARN':
        return 'bg-amber-100 text-amber-800 border-amber-200'
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

  const handleCriarAcesso = (s: Student) => {
    setConfirmModal({
      title: 'Criar acesso',
      message: `Criar acesso para ${s.nome}? O aluno poderá entrar com o e-mail cadastrado e a senha padrão 123456. Será obrigado a alterar a senha no primeiro login.`,
      variant: 'danger',
      confirmLabel: 'Criar acesso',
      onConfirm: async () => {
        try {
          const res = await fetch(`/api/admin/enrollments/${s.id}/criar-acesso`, {
            method: 'POST',
            credentials: 'include',
          })
          const json = await res.json()
          if (res.ok && json.ok) {
            fetchStudents()
            setToast({ message: json.data?.message || 'Acesso criado.', type: 'success' })
          } else {
            setToast({ message: json.message || 'Erro ao criar acesso', type: 'error' })
          }
        } catch {
          setToast({ message: 'Erro ao criar acesso', type: 'error' })
        }
      },
    })
  }

  const handleRedefinirSenhaSubmit = async () => {
    if (!passwordModalStudent) return
    setPasswordLoading(true)
    try {
      const res = await fetch(`/api/admin/enrollments/${passwordModalStudent.id}/alterar-senha`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          novaSenha: passwordForm.novaSenha.trim() || undefined,
          obrigarAlteracaoProximoLogin: passwordForm.obrigarAlteracao,
        }),
      })
      const json = await res.json()
      if (res.ok && json.ok) {
        setToast({ message: json.data?.message || 'Senha redefinida.', type: 'success' })
        setPasswordModalStudent(null)
        setPasswordForm({ novaSenha: '123456', obrigarAlteracao: true })
      } else {
        setToast({ message: json.message || 'Erro ao redefinir senha', type: 'error' })
      }
    } catch {
      setToast({ message: 'Erro ao redefinir senha', type: 'error' })
    } finally {
      setPasswordLoading(false)
    }
  }

  const handleDownloadTemplate = async () => {
    try {
      const res = await fetch('/api/admin/enrollments/template', { credentials: 'include' })
      if (!res.ok) {
        setToast({ message: 'Erro ao baixar modelo', type: 'error' })
        return
      }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'alunos-modelo.csv'
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
    setImportValidationErrors(null)
    try {
      const form = new FormData()
      form.append('file', importFile)
      const res = await fetch('/api/admin/enrollments/import', {
        method: 'POST',
        credentials: 'include',
        body: form,
      })
      const json = await res.json()
      if (!res.ok) {
        if (json.validationErrors && json.totalValidationErrors) {
          setImportValidationErrors({
            message: json.message || 'Arquivo com colunas incorretas.',
            validationErrors: json.validationErrors || [],
            totalValidationErrors: json.totalValidationErrors || 0,
          })
        } else {
          setToast({ message: json.message || 'Erro ao importar', type: 'error' })
        }
        return
      }
      if (json.ok && json.data) {
        setImportResult(json.data)
        if (json.data.created > 0 && json.data.enrollments?.length) {
          const ids = json.data.enrollments.map((e: { id: string }) => e.id)
          setLastImportedIds(ids)
          try {
            localStorage.setItem(LAST_IMPORTED_IDS_KEY, JSON.stringify(ids))
          } catch {}
          fetchStudents()
          setToast({
            message: `${json.data.created} aluno(s) adicionado(s) com sucesso!`,
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
    setImportValidationErrors(null)
  }

  const handleUndoLastImport = () => {
    if (lastImportedIds.length === 0) return
    setConfirmModal({
      title: 'Excluir última lista adicionada',
      message: `Deseja excluir os ${lastImportedIds.length} aluno(s) da última importação? Esta ação não pode ser desfeita.`,
      variant: 'danger',
      confirmLabel: 'Excluir',
      onConfirm: async () => {
        try {
          const res = await fetch('/api/admin/enrollments/undo-import', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ enrollmentIds: lastImportedIds }),
          })
          const json = await res.json()
          if (res.ok && json.ok) {
            setLastImportedIds([])
            try {
              localStorage.removeItem(LAST_IMPORTED_IDS_KEY)
            } catch {}
            fetchStudents()
            setToast({ message: 'Última lista adicionada foi excluída.', type: 'success' })
          } else {
            setToast({ message: json.message || 'Erro ao excluir', type: 'error' })
          }
        } catch (err) {
          setToast({ message: 'Erro ao excluir última lista', type: 'error' })
        }
      },
    })
  }

  const handleDeleteLast10Min = () => {
    setConfirmModal({
      title: 'Excluir alunos dos últimos 10 minutos',
      message:
        'Serão excluídos todos os alunos (matrículas) criados nos últimos 10 minutos. Esta ação não pode ser desfeita. Deseja continuar?',
      variant: 'danger',
      confirmLabel: 'Excluir',
      onConfirm: async () => {
        try {
          const res = await fetch('/api/admin/enrollments/delete-recent', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ minutes: 10 }),
          })
          const json = await res.json()
          if (res.ok && json.ok) {
            setLastImportedIds([])
            try {
              localStorage.removeItem(LAST_IMPORTED_IDS_KEY)
            } catch {}
            fetchStudents()
            setToast({
              message: `${json.data?.deleted ?? 0} aluno(s) criado(s) nos últimos 10 min foram excluídos.`,
              type: 'success',
            })
          } else {
            setToast({ message: json.message || 'Erro ao excluir', type: 'error' })
          }
        } catch (err) {
          setToast({ message: 'Erro ao excluir alunos recentes', type: 'error' })
        }
      },
    })
  }

  const handleCepBlur = useCallback(async () => {
    const cep = formData.cep?.trim().replace(/\D/g, '')
    if (cep?.length !== 8 || formData.moraNoExterior) return
    setCepLoading(true)
    try {
      const end = await buscarCep(cep)
      if (end) {
        setFormData((prev) => ({
          ...prev,
          rua: end.logradouro || prev.rua,
          cidade: end.localidade || prev.cidade,
          estado: end.uf || prev.estado,
        }))
      }
    } finally {
      setCepLoading(false)
    }
  }, [formData.cep, formData.moraNoExterior])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitLoading(true)
    try {
      // Validar se status PAUSED tem activationDate
      if (formData.status === 'PAUSED' && !formData.activationDate) {
        setToast({
          message: 'Data de ativação é obrigatória para alunos pausados',
          type: 'error',
        })
        return
      }

      // Validar se escolaMatricula OUTRO tem escolaMatriculaOutro
      if (formData.escolaMatricula === 'OUTRO' && !formData.escolaMatriculaOutro.trim()) {
        setToast({
          message: 'É necessário especificar o nome da escola quando selecionar "Outro"',
          type: 'error',
        })
        return
      }

      const payload = {
        nome: formData.nome.trim(),
        email: formData.email.trim(),
        whatsapp: formData.whatsapp.trim(),
        dataNascimento: formData.dataNascimento || null,
        nomeResponsavel: formData.nomeResponsavel.trim() || null,
        cpf: formData.cpf.trim() || null,
        cpfResponsavel: isMinor ? (formData.cpfResponsavel.trim() || null) : null,
        curso: formData.curso || null,
        frequenciaSemanal: formData.frequenciaSemanal ? Number(formData.frequenciaSemanal) : null,
        tempoAulaMinutos: formData.tempoAulaMinutos ? Number(formData.tempoAulaMinutos) : null,
        tipoAula: formData.tipoAula === 'PARTICULAR' || formData.tipoAula === 'GRUPO' ? formData.tipoAula : null,
        nomeGrupo: formData.tipoAula === 'GRUPO' ? (formData.nomeGrupo.trim() || null) : null,
        cep: formData.moraNoExterior ? null : (formData.cep.trim() || null),
        rua: formData.moraNoExterior ? null : (formData.rua.trim() || null),
        cidade: formData.moraNoExterior ? null : (formData.cidade.trim() || null),
        estado: formData.moraNoExterior ? null : (formData.estado.trim() || null),
        numero: formData.moraNoExterior ? null : (formData.numero.trim() || null),
        complemento: formData.moraNoExterior ? null : (formData.complemento.trim() || null),
        moraNoExterior: formData.moraNoExterior,
        enderecoExterior: formData.moraNoExterior ? (formData.enderecoExterior.trim() || null) : null,
        valorMensalidade: formData.valorMensalidade ? String(formData.valorMensalidade).replace(',', '.') : null,
        metodoPagamento: formData.metodoPagamento.trim() || null,
        diaPagamento: formData.diaPagamento ? Number(formData.diaPagamento) : null,
        melhoresHorarios: formData.melhoresHorarios.trim() || null,
        melhoresDiasSemana: formData.melhoresDiasSemana.trim() || null,
        nomeVendedor: formData.nomeVendedor.trim() || null,
        nomeEmpresaOuIndicador: formData.nomeEmpresaOuIndicador.trim() || null,
        escolaMatricula: formData.escolaMatricula || null,
        escolaMatriculaOutro: formData.escolaMatricula === 'OUTRO' ? (formData.escolaMatriculaOutro.trim() || null) : null,
        observacoes: formData.observacoes.trim() || null,
        status: formData.status || 'ACTIVE',
        activationDate: formData.status === 'PAUSED' && formData.activationDate ? formData.activationDate : null,
      }
      if (editingStudent) {
        const res = await fetch(`/api/admin/enrollments/${editingStudent.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ action: 'update', ...payload }),
        })
        const json = await res.json()
        if (!res.ok || !json.ok) {
          if (res.status === 401 || res.status === 403) {
            router.push('/login?tab=admin')
            return
          }
          throw new Error(json.message || 'Erro ao atualizar aluno')
        }
        setIsModalOpen(false)
        setEditingStudent(null)
        fetchStudents()
        setToast({ message: 'Aluno atualizado com sucesso!', type: 'success' })
      } else {
        const res = await fetch('/api/admin/enrollments', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify(payload),
        })
        const json = await res.json()
        if (!res.ok || !json.ok) {
          if (res.status === 401 || res.status === 403) {
            router.push('/login?tab=admin')
            return
          }
          throw new Error(json.message || 'Erro ao adicionar aluno')
        }
        setIsModalOpen(false)
        fetchStudents()
        setToast({ message: 'Aluno adicionado com sucesso!', type: 'success' })
      }
    } catch (err) {
      setToast({
        message: err instanceof Error ? err.message : 'Erro ao salvar aluno',
        type: 'error',
      })
    } finally {
      setSubmitLoading(false)
    }
  }

  const statusColors: Record<string, string> = {
    ACTIVE: 'bg-green-100 text-green-800',
    INACTIVE: 'bg-red-100 text-red-800',
    PAUSED: 'bg-amber-100 text-amber-800',
    LEAD: 'bg-amber-100 text-amber-800',
    PAYMENT_PENDING: 'bg-orange-100 text-orange-800',
    BLOCKED: 'bg-red-100 text-red-800',
    COMPLETED: 'bg-gray-100 text-gray-800',
    REGISTERED: 'bg-blue-100 text-blue-800',
    CONTRACT_ACCEPTED: 'bg-blue-100 text-blue-800',
  }

  const getSortValue = (s: Student, key: string): string | number => {
    switch (key) {
      case 'nome':
        return (s.nome ?? '').toLowerCase()
      case 'idade':
        return calcularIdade(s.dataNascimento) ?? -1
      case 'email':
        return (s.email ?? '').toLowerCase()
      case 'whatsapp':
        return s.whatsapp ?? ''
      case 'cpf':
        return (s.cpf ?? '').toLowerCase()
      case 'endereco':
        return formatEndereco(s).toLowerCase()
      case 'valorMensalidade':
        return typeof s.valorMensalidade === 'number' ? s.valorMensalidade : parseFloat(String(s.valorMensalidade ?? '')) || -1
      case 'tipoAula':
        return ((s.tipoAula ?? '') + (s.nomeGrupo ?? '')).toLowerCase()
      case 'teacherNameForWeek':
        return (s.teacherNameForWeek ?? '').toLowerCase()
      case 'status':
        return s.status ?? ''
      case 'trackingCode':
        return s.trackingCode ?? ''
      case 'criadoEm':
        return s.criadoEm ?? ''
      default:
        return (s as Record<string, unknown>)[key] as string | number ?? ''
    }
  }

  const filteredAndSortedStudents = useMemo(() => {
    let list = [...students]
    if (filters.escola) {
      if (filters.escola === 'OUTROS') {
        list = list.filter((s) => !s.escolaMatricula || s.escolaMatricula === 'OUTRO')
      } else {
        list = list.filter((s) => s.escolaMatricula === filters.escola)
      }
    }
    if (filters.tipo) {
      if (filters.tipo === 'GRUPO') {
        list = list.filter((s) => s.tipoAula === 'GRUPO')
      } else {
        list = list.filter((s) => s.tipoAula === filters.tipo)
      }
    }
    if (filters.professor === 'com') {
      list = list.filter((s) => !!s.teacherNameForWeek?.trim())
    } else if (filters.professor === 'sem') {
      list = list.filter((s) => !s.teacherNameForWeek?.trim())
    }
    list.sort((a, b) => {
      const va = getSortValue(a, sortKey)
      const vb = getSortValue(b, sortKey)
      const cmp = typeof va === 'number' && typeof vb === 'number' ? va - vb : String(va).localeCompare(String(vb))
      return sortDir === 'asc' ? cmp : -cmp
    })
    return list
  }, [students, filters.escola, filters.tipo, filters.professor, sortKey, sortDir])

  const handleSort = useCallback((key: string) => {
    setSortKey((prev) => {
      if (prev === key) {
        setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
        return prev
      }
      setSortDir('asc')
      return key
    })
  }, [])

  const toggleSelectStudent = (id: string) => {
    setSelectedStudentIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }
  const selectAllStudents = () => {
    if (selectedStudentIds.size === filteredAndSortedStudents.length) {
      setSelectedStudentIds(new Set())
    } else {
      setSelectedStudentIds(new Set(filteredAndSortedStudents.map((s) => s.id)))
    }
  }
  const handleBulkActivateStudents = async () => {
    const ids = filteredAndSortedStudents
      .filter((s) => selectedStudentIds.has(s.id) && s.status !== 'ACTIVE')
      .map((s) => s.id)
    if (ids.length === 0) {
      setToast({ message: 'Nenhum aluno inativo nos selecionados.', type: 'error' })
      return
    }
    setBulkActionLoading(true)
    try {
      let ok = 0
      for (const id of ids) {
        const res = await fetch(`/api/admin/enrollments/${id}/status`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ status: 'ACTIVE' }),
        })
        const json = await res.json()
        if (res.ok && json.ok) ok++
      }
      fetchStudents()
      setSelectedStudentIds(new Set())
      setToast({ message: `${ok} aluno(s) ativado(s).`, type: 'success' })
    } catch {
      setToast({ message: 'Erro ao ativar selecionados', type: 'error' })
    } finally {
      setBulkActionLoading(false)
    }
  }
  const handleBulkExcludeStudents = () => {
    const ids = [...selectedStudentIds]
    if (ids.length === 0) return
    const hoje = new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
    setConfirmModal({
      title: 'Marcar alunos como Inativos',
      message: `Deseja marcar ${ids.length} aluno(s) selecionado(s) como Inativo? Essa ação vai cancelar todas as aulas para frente a partir de ${hoje}.`,
      variant: 'danger',
      confirmLabel: 'Sim, marcar como Inativo',
      onConfirm: async () => {
        setBulkActionLoading(true)
        try {
          let ok = 0
          for (const id of ids) {
            const res = await fetch(`/api/admin/enrollments/${id}/status`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              credentials: 'include',
              body: JSON.stringify({ status: 'INACTIVE' }),
            })
            const json = await res.json()
            if (res.ok && json.ok) ok++
          }
          fetchStudents()
          setSelectedStudentIds(new Set())
          setToast({ message: `${ok} aluno(s) marcado(s) como Inativo.`, type: 'success' })
        } catch {
          setToast({ message: 'Erro ao alterar status', type: 'error' })
        } finally {
          setBulkActionLoading(false)
          setConfirmModal(null)
        }
      },
    })
  }

  const ESCOLAS_OPCOES = [
    { value: '', label: 'Selecione a escola' },
    { value: 'SEIDMANN', label: 'Seidmann' },
    { value: 'YOUBECOME', label: 'Youbecome' },
    { value: 'HIGHWAY', label: 'Highway' },
    { value: 'OUTRO', label: 'Outros' },
  ]

  const handleBulkSetEscola = async () => {
    const ids = [...selectedStudentIds]
    if (ids.length === 0 || !bulkEscola || !['SEIDMANN', 'YOUBECOME', 'HIGHWAY', 'OUTRO'].includes(bulkEscola)) {
      setToast({ message: 'Selecione pelo menos um aluno e uma escola.', type: 'error' })
      return
    }
    setBulkActionLoading(true)
    try {
      let ok = 0
      for (const id of ids) {
        const s = students.find((x) => x.id === id)
        if (!s) continue
        const res = await fetch(`/api/admin/enrollments/${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            action: 'update',
            nome: s.nome ?? '',
            email: s.email ?? '',
            whatsapp: s.whatsapp ?? '',
            escolaMatricula: bulkEscola,
            ...(bulkEscola === 'OUTRO' ? { escolaMatriculaOutro: null } : {}),
          }),
        })
        const json = await res.json()
        if (res.ok && json.ok) ok++
      }
      fetchStudents()
      setSelectedStudentIds(new Set())
      setToast({ message: `Escola definida para ${ok} aluno(s).`, type: 'success' })
    } catch {
      setToast({ message: 'Erro ao definir escola', type: 'error' })
    } finally {
      setBulkActionLoading(false)
    }
  }

  const columns = [
    {
      key: 'select',
      label: ' ',
      fixed: true,
      render: (s: Student) => (
        <input
          type="checkbox"
          checked={selectedStudentIds.has(s.id)}
          onChange={() => toggleSelectStudent(s.id)}
          onClick={(e) => e.stopPropagation()}
          className="rounded border-gray-300 text-brand-orange focus:ring-brand-orange"
        />
      ),
    },
    {
      key: 'nome',
      label: 'Nome',
      fixed: true,
      sortable: true,
      sortValue: (s: Student) => (s.nome ?? '').toLowerCase(),
      render: (s: Student) => (
        <div className="flex items-center gap-2">
          {s.alerts && s.alerts.length > 0 ? (
            <button
              type="button"
              onClick={() => setAlertsModalStudent(s)}
              className={`shrink-0 ${getAlertSymbolColor(s.alerts)}`}
              title="Ver notificações"
            >
              <Bell className="w-4 h-4 fill-current" />
            </button>
          ) : null}
          <span>{s.nome}</span>
        </div>
      ),
    },
    {
      key: 'idade',
      label: 'Idade',
      sortable: true,
      sortValue: (s: Student) => calcularIdade(s.dataNascimento) ?? -1,
      render: (s: Student) => {
        const idade = calcularIdade(s.dataNascimento)
        return idade != null ? `${idade} anos` : '—'
      },
    },
    { key: 'email', label: 'Email', sortable: true, sortValue: (s: Student) => (s.email ?? '').toLowerCase() },
    { key: 'whatsapp', label: 'WhatsApp', sortable: true, sortValue: (s: Student) => s.whatsapp ?? '', render: (s: Student) => s.whatsapp || '—' },
    { key: 'cpf', label: 'CPF', sortable: true, sortValue: (s: Student) => (s.cpf ?? '').toLowerCase(), render: (s: Student) => s.cpf || '—' },
    {
      key: 'endereco',
      label: 'Endereço',
      sortable: true,
      sortValue: (s: Student) => formatEndereco(s).toLowerCase(),
      render: (s: Student) => {
        const end = formatEndereco(s)
        return <span title={end} className="max-w-[180px] truncate block">{end}</span>
      },
    },
    {
      key: 'valorMensalidade',
      label: 'Valor',
      sortable: true,
      sortValue: (s: Student) => (typeof s.valorMensalidade === 'number' ? s.valorMensalidade : parseFloat(String(s.valorMensalidade ?? '')) || -1),
      render: (s: Student) =>
        s.valorMensalidade != null
          ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(s.valorMensalidade))
          : '—',
    },
    {
      key: 'tipoAula',
      label: 'Tipo',
      sortable: true,
      sortValue: (s: Student) => ((s.tipoAula ?? '') + (s.nomeGrupo ?? '')).toLowerCase(),
      render: (s: Student) => {
        if (!s.tipoAula) return '—'
        if (s.tipoAula === 'PARTICULAR') return 'Particular'
        return s.nomeGrupo ? `Grupo/${s.nomeGrupo}` : 'Grupo'
      },
    },
    {
      key: 'teacherNameForWeek',
      label: 'Professor',
      sortable: true,
      sortValue: (s: Student) => (s.teacherNameForWeek ?? '').toLowerCase(),
      render: (s: Student) =>
        s.teacherNameForWeek ? (
          <span>{s.teacherNameForWeek}</span>
        ) : (
          <span className="text-red-600 font-medium">s/ professor</span>
        ),
    },
    {
      key: 'status',
      label: 'Status',
      sortable: true,
      sortValue: (s: Student) => s.status ?? '',
      render: (s: Student) => (
        <select
          value={s.status}
          onChange={(e) => {
            const newStatus = e.target.value
            if (newStatus === 'PAUSED') {
              // PAUSED só pode ser definido pelo formulário de edição (onde tem campo de data de ativação)
              setToast({
                message: 'Para pausar um aluno, use o botão "Editar" e defina uma data de ativação.',
                type: 'error',
              })
              // Reverter para o status anterior
              e.target.value = s.status
              return
            }
            if (newStatus === 'INACTIVE' && s.status !== 'INACTIVE') {
              const hoje = new Date()
              const dataFormatada = hoje.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
              setConfirmModal({
                title: 'Confirmar status Inativo',
                message: `Tem certeza que quer selecionar "Inativo" para ${s.nome}? Essa ação vai cancelar todas as aulas para frente do dia ${dataFormatada}.`,
                onConfirm: () => {
                  handleStatusChange(s, newStatus)
                  setConfirmModal(null)
                },
                variant: 'danger',
                confirmLabel: 'Sim, marcar como Inativo',
              })
            } else {
              handleStatusChange(s, newStatus)
            }
          }}
          className={`text-xs font-semibold rounded-full px-2 py-1 border-0 cursor-pointer ${statusColors[s.status] ?? 'bg-gray-100 text-gray-800'}`}
          title="Alterar status"
        >
          <option value="ACTIVE">Ativo</option>
          <option value="INACTIVE">Inativo</option>
          <option value="PAUSED">Pausado</option>
        </select>
      ),
    },
    {
      key: 'trackingCode',
      label: 'Código',
      sortable: true,
      sortValue: (s: Student) => s.trackingCode ?? '',
      render: (s: Student) => s.trackingCode || '—',
    },
    {
      key: 'criadoEm',
      label: 'Criado em',
      sortable: true,
      sortValue: (s: Student) => s.criadoEm ?? '',
      render: (s: Student) =>
        s.criadoEm
          ? new Date(s.criadoEm).toLocaleDateString('pt-BR', {
              day: '2-digit',
              month: '2-digit',
              year: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
            })
          : '—',
    },
    {
      key: 'actions',
      label: 'Ações',
      fixed: true,
      render: (s: Student) => (
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => handleEdit(s)}
            className="text-brand-orange hover:text-orange-700 text-sm font-medium"
            title="Editar"
          >
            <Edit className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => s.alerts?.length ? setAlertsModalStudent(s) : openCreateAlertModal(s)}
            className={`text-sm font-medium ${s.alerts?.length ? getAlertSymbolColor(s.alerts) : 'text-gray-600 hover:text-gray-800'}`}
            title={s.alerts?.length ? 'Ver alertas / Criar novo' : 'Criar alerta'}
          >
            <Bell className={`w-4 h-4 ${s.alerts?.length ? 'fill-current' : ''}`} />
          </button>
          {s.user ? (
            <button
              type="button"
              onClick={() => {
                setPasswordModalStudent(s)
                setPasswordForm({ novaSenha: '123456', obrigarAlteracao: true })
              }}
              className="text-gray-600 hover:text-gray-900 text-sm font-medium"
              title="Redefinir senha"
            >
              <Key className="w-4 h-4" />
            </button>
          ) : (
            <button
              type="button"
              onClick={() => handleCriarAcesso(s)}
              className="text-green-600 hover:text-green-800 text-sm font-medium"
              title="Criar acesso (senha padrão 123456)"
            >
              <UserPlus className="w-4 h-4" />
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
            <h1 className="text-3xl font-bold text-gray-900 mb-2">Alunos</h1>
            <p className="text-sm text-gray-600">Lista de alunos e matrículas do instituto</p>
          </div>
          <div className="flex gap-2">
            <Button
              onClick={handleDeleteLast10Min}
              variant="outline"
              size="md"
              className="flex items-center gap-2 border-red-300 text-red-700 hover:bg-red-50"
              title="Excluir todos os alunos criados nos últimos 10 minutos (somente admin)"
            >
              <Trash2 className="w-4 h-4" />
              Excluir alunos dos últimos 10 min
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
            <Button variant="primary" size="md" onClick={handleOpenModal} className="flex items-center gap-2">
              <Plus className="w-4 h-4" />
              Adicionar aluno
            </Button>
          </div>
        </div>

        {/* Cubos de Estatísticas */}
        <div className="mb-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {/* Por Status - Mais importantes */}
          <div
            role="button"
            tabIndex={0}
            onClick={() => openListModal('enrollmentsActive', 'Alunos Ativos')}
            onKeyDown={(e) => e.key === 'Enter' && openListModal('enrollmentsActive', 'Alunos Ativos')}
            className="cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-brand-orange rounded-lg"
          >
            <StatCard
              title="Alunos Ativos"
              value={statsLoading ? '...' : (stats?.porStatus.ativos ?? 0)}
              icon={<UserCheck className="w-6 h-6" />}
              color="green"
            />
          </div>
          <div
            role="button"
            tabIndex={0}
            onClick={() => openListModal('enrollmentsInactive', 'Alunos Inativos')}
            onKeyDown={(e) => e.key === 'Enter' && openListModal('enrollmentsInactive', 'Alunos Inativos')}
            className="cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-brand-orange rounded-lg"
          >
            <StatCard
              title="Alunos Inativos"
              value={statsLoading ? '...' : (stats?.porStatus.inativos ?? 0)}
              icon={<UserX className="w-6 h-6" />}
              color="red"
            />
          </div>
          <div
            role="button"
            tabIndex={0}
            onClick={() => openListModal('enrollmentsPaused', 'Alunos Pausados')}
            onKeyDown={(e) => e.key === 'Enter' && openListModal('enrollmentsPaused', 'Alunos Pausados')}
            className="cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-brand-orange rounded-lg"
          >
            <StatCard
              title="Alunos Pausados"
              value={statsLoading ? '...' : (stats?.porStatus.pausados ?? 0)}
              icon={<Users className="w-6 h-6" />}
              color="orange"
            />
          </div>
          <div
            role="button"
            tabIndex={0}
            onClick={() => openListModal('studentsWithoutTeacherWeek', 'Alunos sem Professor')}
            onKeyDown={(e) => e.key === 'Enter' && openListModal('studentsWithoutTeacherWeek', 'Alunos sem Professor')}
            className="cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-brand-orange rounded-lg"
          >
            <StatCard
              title="Sem Professor (semana)"
              value={statsLoading ? '...' : (stats?.semProfessor ?? 0)}
              icon={<AlertTriangle className="w-6 h-6" />}
              color="orange"
              subtitle="Ativos/Pausados sem aula esta semana"
            />
          </div>
          <div
            role="button"
            tabIndex={0}
            onClick={() => {
              setListModal({ title: 'Frequência incorreta', type: 'wrongFrequency' })
              setListData([])
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                setListModal({ title: 'Frequência incorreta', type: 'wrongFrequency' })
                setListData([])
              }
            }}
            className="cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-brand-orange rounded-lg"
          >
            <StatCard
              title="Frequência incorreta"
              value={wrongFrequencyStats.count}
              icon={<AlertTriangle className="w-6 h-6" />}
              color="orange"
              subtitle="Ação necessária esta semana"
            />
          </div>
          {/* Total por escola */}
          <div
            role="button"
            tabIndex={0}
            onClick={() => {
              // Criar modal customizado com todas as escolas
              const totalEscolas = (stats?.porEscola.seidmann ?? 0) + (stats?.porEscola.youbecome ?? 0) + (stats?.porEscola.highway ?? 0) + (stats?.porEscola.outros ?? 0)
              setListModal({ title: 'Alunos por Escola', type: 'studentsBySchool' })
              setListData([
                { id: 'seidmann', nome: 'Seidmann', count: stats?.porEscola.seidmann ?? 0 },
                { id: 'youbecome', nome: 'Youbecome', count: stats?.porEscola.youbecome ?? 0 },
                { id: 'highway', nome: 'Highway', count: stats?.porEscola.highway ?? 0 },
                { id: 'outros', nome: 'Outros', count: stats?.porEscola.outros ?? 0 },
              ] as any)
            }}
            onKeyDown={(e) => e.key === 'Enter' && {}}
            className="cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-brand-orange rounded-lg"
          >
            <StatCard
              title="Total por Escola"
              value={statsLoading ? '...' : ((stats?.porEscola.seidmann ?? 0) + (stats?.porEscola.youbecome ?? 0) + (stats?.porEscola.highway ?? 0) + (stats?.porEscola.outros ?? 0))}
              icon={<GraduationCap className="w-6 h-6" />}
              color="blue"
            />
          </div>
        </div>

        <div className="mb-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-4">
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">Status</label>
            <select
              value={filters.status}
              onChange={(e) => setFilters({ ...filters, status: e.target.value })}
              className="input w-full"
            >
              <option value="">Todos</option>
              <option value="ACTIVE">Ativo</option>
              <option value="INACTIVE">Inativo</option>
              <option value="PAUSED">Pausado</option>
              <option value="LEAD">Lead</option>
              <option value="REGISTERED">Matriculado</option>
              <option value="CONTRACT_ACCEPTED">Contrato aceito</option>
              <option value="PAYMENT_PENDING">Pagamento pendente</option>
              <option value="BLOCKED">Bloqueado</option>
              <option value="COMPLETED">Concluído</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">Escola de matrícula</label>
            <select
              value={filters.escola}
              onChange={(e) => setFilters({ ...filters, escola: e.target.value })}
              className="input w-full"
            >
              <option value="">Todas</option>
              <option value="SEIDMANN">Seidmann</option>
              <option value="YOUBECOME">Youbecome</option>
              <option value="HIGHWAY">Highway</option>
              <option value="OUTROS">Outros</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">Tipo</label>
            <select
              value={filters.tipo}
              onChange={(e) => setFilters({ ...filters, tipo: e.target.value })}
              className="input w-full"
            >
              <option value="">Todos</option>
              <option value="PARTICULAR">Particular</option>
              <option value="GRUPO">Grupo</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">Professor (semana)</label>
            <select
              value={filters.professor}
              onChange={(e) => setFilters({ ...filters, professor: e.target.value })}
              className="input w-full"
            >
              <option value="">Todos</option>
              <option value="com">Com professor</option>
              <option value="sem">Sem professor</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">Buscar</label>
            <input
              type="text"
              value={filters.search}
              onChange={(e) => setFilters({ ...filters, search: e.target.value })}
              className="input w-full"
              placeholder="Nome, email, WhatsApp..."
            />
          </div>
          <div className="flex items-end">
            <Button
              type="button"
              variant="outline"
              size="md"
              onClick={() => setReportModalOpen(true)}
              className="flex items-center gap-2 w-full justify-center"
            >
              <FileDown className="w-4 h-4" />
              Relatório personalizado
            </Button>
          </div>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg text-red-800">
            {error}
          </div>
        )}

        {filteredAndSortedStudents.length > 0 && (
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={
                  filteredAndSortedStudents.length > 0 &&
                  selectedStudentIds.size === filteredAndSortedStudents.length
                }
                ref={(el) => {
                  if (el)
                    el.indeterminate =
                      selectedStudentIds.size > 0 &&
                      selectedStudentIds.size < filteredAndSortedStudents.length
                }}
                onChange={selectAllStudents}
                className="rounded border-gray-300 text-brand-orange focus:ring-brand-orange"
              />
              <span className="text-sm font-medium text-gray-700">Selecionar todos</span>
            </label>
            {selectedStudentIds.size > 0 && (
              <>
                <span className="text-sm text-gray-500">
                  ({selectedStudentIds.size} selecionado(s))
                </span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleBulkActivateStudents}
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
                  onClick={handleBulkExcludeStudents}
                  disabled={bulkActionLoading}
                >
                  Excluir selecionados
                </Button>
                <span className="inline-flex items-center gap-2">
                  <label className="text-sm text-gray-600">Definir escola:</label>
                  <select
                    value={bulkEscola}
                    onChange={(e) => setBulkEscola(e.target.value)}
                    className="input py-1.5 text-sm min-w-[140px]"
                  >
                    {ESCOLAS_OPCOES.map((opt) => (
                      <option key={opt.value || 'empty'} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleBulkSetEscola}
                    disabled={bulkActionLoading || !bulkEscola}
                  >
                    Aplicar
                  </Button>
                </span>
              </>
            )}
          </div>
        )}

        <Table
          columns={columns}
          data={filteredAndSortedStudents}
          loading={loading}
          emptyMessage="Nenhum aluno encontrado"
          sortKey={sortKey}
          sortDir={sortDir}
          onSort={handleSort}
          visibleColumnKeys={visibleColumnKeys}
          onVisibleColumnsChange={setVisibleColumnKeys}
        />

        {/* Modal Redefinir senha do aluno */}
        <Modal
          isOpen={!!passwordModalStudent}
          onClose={() => {
            setPasswordModalStudent(null)
            setPasswordForm({ novaSenha: '123456', obrigarAlteracao: true })
          }}
          title="Redefinir senha do aluno"
          footer={
            <>
              <Button
                variant="outline"
                onClick={() => {
                  setPasswordModalStudent(null)
                  setPasswordForm({ novaSenha: '123456', obrigarAlteracao: true })
                }}
              >
                Cancelar
              </Button>
              <Button variant="primary" onClick={handleRedefinirSenhaSubmit} disabled={passwordLoading}>
                {passwordLoading ? 'Salvando...' : 'Redefinir senha'}
              </Button>
            </>
          }
        >
          {passwordModalStudent && (
            <div className="space-y-4">
              <p className="text-sm text-gray-600">
                Aluno: <strong>{passwordModalStudent.nome}</strong> ({passwordModalStudent.email})
              </p>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Nova senha</label>
                <input
                  type="password"
                  value={passwordForm.novaSenha}
                  onChange={(e) => setPasswordForm({ ...passwordForm, novaSenha: e.target.value })}
                  className="input w-full"
                  placeholder="Deixe em branco para usar 123456"
                  autoComplete="new-password"
                />
                <p className="text-xs text-gray-500 mt-1">Mínimo 6 caracteres. Se vazio, será usada a senha padrão 123456.</p>
              </div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={passwordForm.obrigarAlteracao}
                  onChange={(e) => setPasswordForm({ ...passwordForm, obrigarAlteracao: e.target.checked })}
                  className="rounded border-gray-300"
                />
                <span className="text-sm font-medium text-gray-700">Obrigar alteração da senha no próximo login</span>
              </label>
            </div>
          )}
        </Modal>

        {/* Modal Adicionar/Editar aluno */}
        <Modal
          isOpen={isModalOpen}
          onClose={() => {
            setIsModalOpen(false)
            setEditingStudent(null)
          }}
          title={editingStudent ? 'Editar aluno' : 'Adicionar aluno'}
          size="xl"
          footer={
            <>
              <Button variant="outline" onClick={() => { setIsModalOpen(false); setEditingStudent(null) }}>
                Cancelar
              </Button>
              <Button variant="primary" onClick={handleSubmit} disabled={submitLoading}>
                {submitLoading ? 'Salvando...' : editingStudent ? 'Salvar' : 'Adicionar'}
              </Button>
            </>
          }
        >
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Dados básicos */}
            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-gray-800 border-b pb-2">Dados básicos</h3>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Nome completo <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={formData.nome}
                  onChange={(e) => setFormData({ ...formData, nome: e.target.value })}
                  className="input w-full"
                  required
                />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
                    WhatsApp <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={formData.whatsapp}
                    onChange={(e) => setFormData({ ...formData, whatsapp: e.target.value })}
                    className="input w-full"
                    placeholder="11999999999"
                    required
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Data de nascimento
                  </label>
                  <input
                    type="date"
                    value={formData.dataNascimento}
                    onChange={(e) => setFormData({ ...formData, dataNascimento: e.target.value })}
                    className="input w-full"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">CPF</label>
                  <input
                    type="text"
                    value={formData.cpf}
                    onChange={(e) => setFormData({ ...formData, cpf: e.target.value })}
                    className="input w-full"
                    placeholder="000.000.000-00"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Status do aluno</label>
                  <select
                    value={formData.status}
                    onChange={(e) => {
                      const newStatus = e.target.value
                      if ((newStatus === 'INACTIVE' || newStatus === 'PAUSED') && formData.status !== newStatus) {
                        const hoje = new Date()
                        const dataFormatada = hoje.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
                        const statusLabel = newStatus === 'INACTIVE' ? 'Inativo' : 'Pausado'
                        const mensagem = newStatus === 'INACTIVE'
                          ? `Tem certeza que quer selecionar "Inativo"? Essa ação vai cancelar todas as aulas para frente do dia ${dataFormatada}.`
                          : `Tem certeza que quer selecionar "Pausado"? As aulas permanecerão no calendário, mas não será possível selecionar professor ou fazer registro até a data de ativação. Aulas não contarão para pagamento a partir do dia ${dataFormatada}.`
                        setConfirmModal({
                          title: `Confirmar status ${statusLabel}`,
                          message: mensagem,
                          onConfirm: () => {
                            setFormData({ ...formData, status: newStatus })
                            setConfirmModal(null)
                          },
                          variant: 'danger',
                          confirmLabel: `Sim, marcar como ${statusLabel}`,
                        })
                      } else {
                        setFormData({ ...formData, status: newStatus })
                      }
                    }}
                    className="input w-full"
                  >
                    <option value="ACTIVE">Ativo</option>
                    <option value="INACTIVE">Inativo</option>
                    <option value="PAUSED">Pausado</option>
                  </select>
                </div>
                {formData.status === 'PAUSED' && (
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">
                      Data de ativação <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="date"
                      value={formData.activationDate}
                      onChange={(e) => setFormData({ ...formData, activationDate: e.target.value })}
                      className="input w-full"
                      min={new Date().toISOString().slice(0, 10)}
                      required
                    />
                    <p className="text-xs text-gray-500 mt-1">A partir desta data, o aluno voltará automaticamente para "Ativo"</p>
                  </div>
                )}
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Escola de matrícula</label>
                  <select
                    value={formData.escolaMatricula}
                    onChange={(e) => {
                      setFormData({
                        ...formData,
                        escolaMatricula: e.target.value,
                        escolaMatriculaOutro: e.target.value !== 'OUTRO' ? '' : formData.escolaMatriculaOutro,
                      })
                    }}
                    className="input w-full"
                  >
                    <option value="">Selecione</option>
                    <option value="SEIDMANN">Seidmann</option>
                    <option value="YOUBECOME">Youbecome</option>
                    <option value="HIGHWAY">Highway</option>
                    <option value="OUTRO">Outro</option>
                  </select>
                </div>
                {formData.escolaMatricula === 'OUTRO' && (
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">
                      Especifique a escola <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={formData.escolaMatriculaOutro}
                      onChange={(e) => setFormData({ ...formData, escolaMatriculaOutro: e.target.value })}
                      className="input w-full"
                      placeholder="Digite o nome da escola"
                      required
                    />
                  </div>
                )}
              </div>
              {isMinor && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-3 bg-amber-50 rounded-lg border border-amber-200">
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">
                      Nome do responsável
                    </label>
                    <input
                      type="text"
                      value={formData.nomeResponsavel}
                      onChange={(e) => setFormData({ ...formData, nomeResponsavel: e.target.value })}
                      className="input w-full"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">
                      CPF do responsável
                    </label>
                    <input
                      type="text"
                      value={formData.cpfResponsavel}
                      onChange={(e) => setFormData({ ...formData, cpfResponsavel: e.target.value })}
                      className="input w-full"
                      placeholder="000.000.000-00"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Curso e aula */}
            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-gray-800 border-b pb-2">Curso e aula</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Curso</label>
                  <select
                    value={formData.curso}
                    onChange={(e) => setFormData({ ...formData, curso: e.target.value })}
                    className="input w-full"
                  >
                    <option value="">Selecione</option>
                    <option value="INGLES">Inglês</option>
                    <option value="ESPANHOL">Espanhol</option>
                    <option value="INGLES_E_ESPANHOL">Inglês e Espanhol</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Frequência semanal (vezes)
                  </label>
                  <select
                    value={formData.frequenciaSemanal}
                    onChange={(e) => setFormData({ ...formData, frequenciaSemanal: e.target.value })}
                    className="input w-full"
                  >
                    <option value="">Selecione</option>
                    {[1, 2, 3, 4, 5, 6, 7].map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Tempo de aula</label>
                <select
                  value={formData.tempoAulaMinutos}
                  onChange={(e) => setFormData({ ...formData, tempoAulaMinutos: e.target.value })}
                  className="input w-full"
                >
                  <option value="">Selecione</option>
                  {TEMPO_AULA_OPCOES.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Tipo de aula</label>
                <select
                  value={formData.tipoAula}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      tipoAula: e.target.value,
                      nomeGrupo: e.target.value === 'GRUPO' ? formData.nomeGrupo : '',
                    })
                  }
                  className="input w-full"
                >
                  <option value="">Selecione</option>
                  <option value="PARTICULAR">Particular</option>
                  <option value="GRUPO">Grupo</option>
                </select>
              </div>
              {formData.tipoAula === 'GRUPO' && (
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Nome do grupo</label>
                  <input
                    type="text"
                    value={formData.nomeGrupo}
                    onChange={(e) => setFormData({ ...formData, nomeGrupo: e.target.value })}
                    className="input w-full"
                    placeholder="Ex.: Turma Inglês A1"
                  />
                </div>
              )}
            </div>

            {/* Endereço */}
            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-gray-800 border-b pb-2">Endereço</h3>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={formData.moraNoExterior}
                  onChange={(e) =>
                    setFormData({ ...formData, moraNoExterior: e.target.checked })
                  }
                  className="rounded border-gray-300"
                />
                <span className="text-sm font-medium text-gray-700">Mora no exterior</span>
              </label>
              {formData.moraNoExterior ? (
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Endereço completo (cole as informações em uma única caixa)
                  </label>
                  <textarea
                    value={formData.enderecoExterior}
                    onChange={(e) =>
                      setFormData({ ...formData, enderecoExterior: e.target.value })
                    }
                    className="input w-full min-h-[100px]"
                    placeholder="Cole ou digite o endereço completo..."
                    rows={4}
                  />
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">CEP</label>
                    <input
                      type="text"
                      value={formData.cep}
                      onChange={(e) => setFormData({ ...formData, cep: e.target.value })}
                      onBlur={handleCepBlur}
                      className="input w-full"
                      placeholder="00000-000"
                    />
                    {cepLoading && (
                      <p className="text-xs text-gray-500 mt-1">Buscando...</p>
                    )}
                  </div>
                  <div className="md:col-span-2">
                    <label className="block text-sm font-semibold text-gray-700 mb-2">Rua</label>
                    <input
                      type="text"
                      value={formData.rua}
                      onChange={(e) => setFormData({ ...formData, rua: e.target.value })}
                      className="input w-full"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">Cidade</label>
                    <input
                      type="text"
                      value={formData.cidade}
                      onChange={(e) => setFormData({ ...formData, cidade: e.target.value })}
                      className="input w-full"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">Estado</label>
                    <input
                      type="text"
                      value={formData.estado}
                      onChange={(e) =>
                        setFormData({ ...formData, estado: e.target.value.slice(0, 2) })
                      }
                      className="input w-full"
                      placeholder="UF"
                      maxLength={2}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">Número</label>
                    <input
                      type="text"
                      value={formData.numero}
                      onChange={(e) => setFormData({ ...formData, numero: e.target.value })}
                      className="input w-full"
                    />
                  </div>
                  <div className="md:col-span-2">
                    <label className="block text-sm font-semibold text-gray-700 mb-2">
                      Complemento
                    </label>
                    <input
                      type="text"
                      value={formData.complemento}
                      onChange={(e) =>
                        setFormData({ ...formData, complemento: e.target.value })
                      }
                      className="input w-full"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Pagamento e comercial */}
            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-gray-800 border-b pb-2">
                Pagamento e comercial
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Valor mensalidade (R$)
                  </label>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={formData.valorMensalidade}
                    onChange={(e) =>
                      setFormData({ ...formData, valorMensalidade: e.target.value })
                    }
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
                    onChange={(e) =>
                      setFormData({ ...formData, metodoPagamento: e.target.value })
                    }
                    className="input w-full"
                  >
                    <option value="">Selecione</option>
                    <option value="PIX">PIX</option>
                    <option value="CARTAO">Cartão</option>
                    <option value="BOLETO">Boleto</option>
                    <option value="OUTRO">Outro</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Dia de pagamento (1-31)
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={31}
                    value={formData.diaPagamento}
                    onChange={(e) =>
                      setFormData({ ...formData, diaPagamento: e.target.value })
                    }
                    className="input w-full"
                    placeholder="Ex: 10"
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Melhores horários
                  </label>
                  <input
                    type="text"
                    value={formData.melhoresHorarios}
                    onChange={(e) =>
                      setFormData({ ...formData, melhoresHorarios: e.target.value })
                    }
                    className="input w-full"
                    placeholder="Ex: manhã, tarde"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Melhores dias da semana
                  </label>
                  <input
                    type="text"
                    value={formData.melhoresDiasSemana}
                    onChange={(e) =>
                      setFormData({ ...formData, melhoresDiasSemana: e.target.value })
                    }
                    className="input w-full"
                    placeholder="Ex: seg, qua, sex"
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Nome do vendedor
                  </label>
                  <input
                    type="text"
                    value={formData.nomeVendedor}
                    onChange={(e) =>
                      setFormData({ ...formData, nomeVendedor: e.target.value })
                    }
                    className="input w-full"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Nome da empresa ou indicador
                  </label>
                  <input
                    type="text"
                    value={formData.nomeEmpresaOuIndicador}
                    onChange={(e) =>
                      setFormData({ ...formData, nomeEmpresaOuIndicador: e.target.value })
                    }
                    className="input w-full"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Observações</label>
                <textarea
                  value={formData.observacoes}
                  onChange={(e) =>
                    setFormData({ ...formData, observacoes: e.target.value })
                  }
                  className="input w-full min-h-[80px]"
                  placeholder="Observações gerais..."
                  rows={3}
                />
              </div>
            </div>
          </form>
        </Modal>

        {/* Modal Notificações do Aluno (lista de alertas) */}
        <Modal
          isOpen={!!alertsModalStudent}
          onClose={() => setAlertsModalStudent(null)}
          title={alertsModalStudent ? `Notificações – ${alertsModalStudent.nome}` : 'Notificações'}
          size="md"
          footer={
            <>
              {alertsModalStudent && (
                <Button
                  variant="outline"
                  onClick={() => {
                    setAlertsModalStudent(null)
                    openCreateAlertModal(alertsModalStudent)
                  }}
                >
                  Novo Alerta
                </Button>
              )}
              <Button variant="primary" onClick={() => setAlertsModalStudent(null)}>
                Fechar
              </Button>
            </>
          }
        >
          {alertsModalStudent && (
            <div className="space-y-3">
              {alertsModalStudent.alerts && alertsModalStudent.alerts.length > 0 ? (
                alertsModalStudent.alerts.map((a) => (
                  <div
                    key={a.id}
                    className={`flex items-start justify-between gap-3 p-4 rounded-lg border ${getAlertLevelStyles(a.level)}`}
                  >
                    <p className="flex-1 text-sm">{a.message}</p>
                    <button
                      type="button"
                      onClick={() => handleDeleteStudentAlert(a.id)}
                      className="shrink-0 text-gray-500 hover:text-red-600 p-1"
                      title="Excluir"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))
              ) : (
                <p className="text-gray-500 text-sm">Nenhuma notificação. Clique em &quot;Novo Alerta&quot; para adicionar.</p>
              )}
            </div>
          )}
        </Modal>

        {/* Modal Novo Alerta (aluno) */}
        <Modal
          isOpen={!!createAlertModalStudent}
          onClose={() => {
            setCreateAlertModalStudent(null)
            setNewAlertForm({ message: '', level: 'INFO' })
          }}
          title={createAlertModalStudent ? `Novo Alerta – ${createAlertModalStudent.nome}` : 'Novo Alerta'}
          size="md"
          footer={
            createAlertModalStudent ? (
              <>
                <Button
                  variant="outline"
                  onClick={() => {
                    setCreateAlertModalStudent(null)
                    setNewAlertForm({ message: '', level: 'INFO' })
                  }}
                >
                  Cancelar
                </Button>
                <Button
                  variant="primary"
                  onClick={(e) => handleCreateAlertSubmit(e as unknown as React.FormEvent)}
                >
                  Criar
                </Button>
              </>
            ) : undefined
          }
        >
          {createAlertModalStudent && (
            <form onSubmit={handleCreateAlertSubmit} className="space-y-4">
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
                <label className="block text-sm font-semibold text-gray-700 mb-2">Nível</label>
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

        {/* Modal Importar por lista */}
        <Modal
          isOpen={importModalOpen}
          onClose={closeImportModal}
          title="Adicionar alunos por lista"
          size="md"
          footer={
            <>
              <Button variant="outline" onClick={closeImportModal}>
                Fechar
              </Button>
              {importFile && (
                <Button
                  variant="primary"
                  onClick={(e) => handleImportSubmit(e)}
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
              Baixe o modelo CSV com as colunas necessárias, preencha com os dados dos alunos e faça o upload.
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
                  setImportValidationErrors(null)
                }}
                className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:text-sm file:font-medium file:bg-brand-orange file:text-white hover:file:bg-orange-600"
              />
            </div>
            {importValidationErrors && (
              <div className="space-y-2 pt-2 border-t border-amber-200 bg-amber-50 rounded-lg p-4">
                <p className="text-sm font-medium text-amber-800">
                  {importValidationErrors.message}
                </p>
                {importValidationErrors.totalValidationErrors > 0 && (
                  <>
                    <p className="text-xs text-amber-700">
                      {importValidationErrors.totalValidationErrors} problema(s) encontrado(s). Use a planilha modelo e mantenha a mesma ordem das colunas.
                    </p>
                    <ul className="text-xs text-gray-700 max-h-32 overflow-y-auto space-y-0.5 list-disc list-inside">
                      {importValidationErrors.validationErrors.map((err, i) => (
                        <li key={i}>
                          Linha {err.row}: {err.message}
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </div>
            )}
            {importResult && (
              <div className="space-y-2 pt-2 border-t">
                <p className="text-sm font-medium text-green-700">
                  {importResult.created} aluno(s) adicionado(s).
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

        {confirmModal && (
          <ConfirmModal
            isOpen={!!confirmModal}
            onClose={() => setConfirmModal(null)}
            onConfirm={() => {
              confirmModal?.onConfirm()
              setConfirmModal(null)
            }}
            title={confirmModal.title}
            message={confirmModal.message}
            confirmLabel={confirmModal.confirmLabel ?? 'Confirmar'}
            cancelLabel="Cancelar"
            variant={confirmModal.variant ?? 'default'}
          />
        )}

        {/* Modal de lista ao clicar no cubo */}
        <Modal
          isOpen={listModal !== null}
          onClose={() => setListModal(null)}
          title={listModal?.title || ''}
          size="xl"
        >
          {listLoading ? (
            <p className="text-gray-500">Carregando...</p>
          ) : listModal?.type === 'wrongFrequency' ? (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="py-2 pr-4 font-semibold text-gray-700">Aluno</th>
                    <th className="py-2 font-semibold text-gray-700">Ação Necessária</th>
                  </tr>
                </thead>
                <tbody>
                  {wrongFrequencyStats.list.length === 0 ? (
                    <tr>
                      <td colSpan={2} className="py-4 text-center text-gray-500">Nenhum aluno com frequência incorreta esta semana.</td>
                    </tr>
                  ) : (
                    wrongFrequencyStats.list.map((item) => {
                      const diff = item.expected - item.actual
                      const acaoNecessaria = diff > 0
                        ? `Adicionar ${diff} aula${diff > 1 ? 's' : ''}`
                        : diff < 0
                          ? `Remover ${Math.abs(diff)} aula${Math.abs(diff) > 1 ? 's' : ''}`
                          : '—'
                      return (
                        <tr key={item.enrollmentId} className="border-b border-gray-100">
                          <td className="py-3 pr-4 font-medium text-gray-900">{item.studentName}</td>
                          <td className="py-3">
                            <span className="inline-flex items-center px-2 py-1 rounded-md bg-orange-100 text-orange-800 text-xs font-medium">
                              {acaoNecessaria}
                            </span>
                          </td>
                        </tr>
                      )
                    })
                  )}
                </tbody>
              </table>
            </div>
          ) : listData.length === 0 ? (
            <p className="text-gray-500">Nenhum registro.</p>
          ) : listModal?.type === 'studentsOutros' ? (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="py-2 pr-4 font-semibold text-gray-700">Nome</th>
                    <th className="py-2 font-semibold text-gray-700">Escola</th>
                  </tr>
                </thead>
                <tbody>
                  {listData.map((item) => (
                    <tr key={item.id} className="border-b border-gray-100">
                      <td className="py-2 pr-4">{item.nome}</td>
                      <td className="py-2">{(item as { escola?: string }).escola || 'Não especificado'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : listModal?.type === 'studentsBySchool' ? (
            <div className="space-y-3">
              {(listData as { id: string; nome: string; count: number }[]).map((item) => (
                <div
                  key={item.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => {
                    const typeMap: Record<string, string> = {
                      seidmann: 'studentsSeidmann',
                      youbecome: 'studentsYoubecome',
                      highway: 'studentsHighway',
                      outros: 'studentsOutros',
                    }
                    openListModal(typeMap[item.id] || 'studentsOutros', `Alunos ${item.nome}`)
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      const typeMap: Record<string, string> = {
                        seidmann: 'studentsSeidmann',
                        youbecome: 'studentsYoubecome',
                        highway: 'studentsHighway',
                        outros: 'studentsOutros',
                      }
                      openListModal(typeMap[item.id] || 'studentsOutros', `Alunos ${item.nome}`)
                    }
                  }}
                  className="flex items-center justify-between p-4 border border-gray-200 rounded-lg hover:bg-gray-50 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-orange"
                >
                  <span className="font-medium text-gray-900">{item.nome}</span>
                  <span className="text-lg font-bold text-gray-700">{item.count}</span>
                </div>
              ))}
            </div>
          ) : listModal?.type === 'studentsWithoutTeacherWeek' ? (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="py-2 pr-4 font-semibold text-gray-700">Aluno</th>
                    <th className="py-2 pr-4 font-semibold text-gray-700">Sugestões de Professores</th>
                    <th className="py-2 font-semibold text-gray-700">Dias e horários de aulas</th>
                  </tr>
                </thead>
                <tbody>
                  {listData.map((item) => {
                    const student = item as {
                      id: string
                      nome: string
                      suggestions: { lessonId: string; startAt: string; teachers: { id: string; nome: string }[] }[]
                      lessonTimes?: { startAt: string }[]
                    }
                    const hasSuggestions = student.suggestions && student.suggestions.length > 0
                    const allTeachers: { id: string; nome: string }[] = []
                    if (hasSuggestions) {
                      student.suggestions.forEach((s) => {
                        s.teachers.forEach((t) => {
                          if (!allTeachers.find((at) => at.id === t.id)) {
                            allTeachers.push(t)
                          }
                        })
                      })
                    }
                    const times = student.lessonTimes ?? []
                    const diasHorarios = times.map((t) => {
                      const d = new Date(t.startAt)
                      return d.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' }) + ' às ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
                    }).join(' · ')
                    return (
                      <tr key={student.id} className="border-b border-gray-100">
                        <td className="py-3 pr-4 font-medium text-gray-900">{student.nome}</td>
                        <td className="py-3 pr-4">
                          {hasSuggestions && allTeachers.length > 0 ? (
                            <div className="flex flex-wrap gap-2">
                              {allTeachers.map((teacher) => (
                                <span
                                  key={teacher.id}
                                  className="inline-flex items-center px-2 py-1 rounded-md bg-blue-100 text-blue-800 text-xs font-medium"
                                >
                                  {teacher.nome}
                                </span>
                              ))}
                            </div>
                          ) : (
                            <span className="text-sm text-gray-500 italic">Sem professor disponível</span>
                          )}
                        </td>
                        <td className="py-3 text-sm text-gray-700">
                          {diasHorarios || '—'}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <ul className="space-y-1 max-h-96 overflow-y-auto">
              {listData.map((item) => (
                <li key={item.id} className="py-1">
                  {item.nome}
                </li>
              ))}
            </ul>
          )}
        </Modal>

        {/* Modal Relatório personalizado */}
        <Modal
          isOpen={reportModalOpen}
          onClose={() => setReportModalOpen(false)}
          title="Relatório personalizado"
          footer={
            <>
              <Button variant="outline" onClick={() => setReportModalOpen(false)}>
                Cancelar
              </Button>
              <Button
                variant="primary"
                onClick={() => {
                  let list = [...students]
                  if (reportFilters.escola) {
                    if (reportFilters.escola === 'OUTROS') {
                      list = list.filter((s) => !s.escolaMatricula || s.escolaMatricula === 'OUTRO')
                    } else {
                      list = list.filter((s) => s.escolaMatricula === reportFilters.escola)
                    }
                  }
                  if (reportFilters.status) {
                    list = list.filter((s) => s.status === reportFilters.status)
                  }
                  if (reportFilters.tipo) {
                    list = list.filter((s) => s.tipoAula === reportFilters.tipo)
                  }
                  if (reportFilters.mes) {
                    const mes = parseInt(reportFilters.mes, 10)
                    list = list.filter((s) => {
                      if (!s.criadoEm) return false
                      return new Date(s.criadoEm).getMonth() + 1 === mes
                    })
                  }
                  if (reportFilters.ano) {
                    const ano = parseInt(reportFilters.ano, 10)
                    list = list.filter((s) => {
                      if (!s.criadoEm) return false
                      return new Date(s.criadoEm).getFullYear() === ano
                    })
                  }
                  const cols = REPORT_COLUMNS.filter((c) => reportColumnKeys.includes(c.key))
                  if (cols.length === 0) {
                    setToast({ message: 'Selecione pelo menos uma coluna.', type: 'error' })
                    return
                  }
                  const headers = cols.map((c) => c.label).join(';')
                  const rows = list.map((s) =>
                    cols
                      .map((c) => {
                        const v = c.getValue(s)
                        return v.includes(';') ? `"${v.replace(/"/g, '""')}"` : v
                      })
                      .join(';')
                  )
                  const csv = '\uFEFF' + [headers, ...rows].join('\r\n')
                  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
                  const url = URL.createObjectURL(blob)
                  const a = document.createElement('a')
                  a.href = url
                  const mesAno = reportFilters.mes && reportFilters.ano ? `-${reportFilters.ano}-${reportFilters.mes.padStart(2, '0')}` : reportFilters.mes ? `-mes-${reportFilters.mes}` : reportFilters.ano ? `-${reportFilters.ano}` : ''
                  a.download = `alunos-relatorio${mesAno}.csv`
                  a.click()
                  URL.revokeObjectURL(url)
                  setReportModalOpen(false)
                  setToast({ message: `Relatório exportado: ${list.length} aluno(s).`, type: 'success' })
                }}
              >
                <FileDown className="w-4 h-4 mr-2" />
                Baixar CSV
              </Button>
            </>
          }
        >
          <div className="space-y-6">
            <p className="text-sm text-gray-600">
              Escolha as colunas e os filtros. Os dados respeitam também os filtros atuais da tabela (Status e Busca).
            </p>
            <div>
              <p className="text-sm font-semibold text-gray-700 mb-2">Colunas do relatório</p>
              <div className="flex flex-wrap gap-x-4 gap-y-2">
                {REPORT_COLUMNS.map((col) => (
                  <label key={col.key} className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={reportColumnKeys.includes(col.key)}
                      onChange={() => {
                        setReportColumnKeys((prev) =>
                          prev.includes(col.key) ? prev.filter((k) => k !== col.key) : [...prev, col.key]
                        )
                      }}
                      className="rounded border-gray-300"
                    />
                    <span className="text-sm text-gray-800">{col.label}</span>
                  </label>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Escola de matrícula</label>
                <select
                  value={reportFilters.escola}
                  onChange={(e) => setReportFilters((f) => ({ ...f, escola: e.target.value }))}
                  className="input w-full"
                >
                  <option value="">Todas</option>
                  <option value="SEIDMANN">Seidmann</option>
                  <option value="YOUBECOME">Youbecome</option>
                  <option value="HIGHWAY">Highway</option>
                  <option value="OUTROS">Outros</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Status</label>
                <select
                  value={reportFilters.status}
                  onChange={(e) => setReportFilters((f) => ({ ...f, status: e.target.value }))}
                  className="input w-full"
                >
                  <option value="">Todos</option>
                  <option value="ACTIVE">Ativo</option>
                  <option value="INACTIVE">Inativo</option>
                  <option value="PAUSED">Pausado</option>
                  <option value="LEAD">Lead</option>
                  <option value="REGISTERED">Matriculado</option>
                  <option value="CONTRACT_ACCEPTED">Contrato aceito</option>
                  <option value="PAYMENT_PENDING">Pagamento pendente</option>
                  <option value="BLOCKED">Bloqueado</option>
                  <option value="COMPLETED">Concluído</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Tipo</label>
                <select
                  value={reportFilters.tipo}
                  onChange={(e) => setReportFilters((f) => ({ ...f, tipo: e.target.value }))}
                  className="input w-full"
                >
                  <option value="">Todos</option>
                  <option value="PARTICULAR">Particular</option>
                  <option value="GRUPO">Grupo</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Criado no mês</label>
                <select
                  value={reportFilters.mes}
                  onChange={(e) => setReportFilters((f) => ({ ...f, mes: e.target.value }))}
                  className="input w-full"
                >
                  {MESES.map((m) => (
                    <option key={m.value || 'all'} value={m.value}>
                      {m.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Criado no ano</label>
                <select
                  value={reportFilters.ano}
                  onChange={(e) => setReportFilters((f) => ({ ...f, ano: e.target.value }))}
                  className="input w-full"
                >
                  <option value="">Todos</option>
                  {Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - i).map((y) => (
                    <option key={y} value={String(y)}>
                      {y}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        </Modal>

        {toast && (
          <Toast
            message={toast.message}
            type={toast.type}
            onClose={() => setToast(null)}
          />
        )}
      </div>
    </AdminLayout>
  )
}
