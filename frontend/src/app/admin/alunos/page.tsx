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
import { Plus, Edit, Bell, Trash2, FileSpreadsheet, Upload } from 'lucide-react'

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
  observacoes: '',
  status: 'LEAD',
}

export default function AdminAlunosPage() {
  const router = useRouter()
  const [students, setStudents] = useState<Student[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filters, setFilters] = useState({ status: '', search: '', tipo: '', professor: '' })
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
  const isMinor = isMenorDeIdade(formData.dataNascimento || null)

  useEffect(() => {
    fetchStudents()
  }, [filters])

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
      observacoes: s.observacoes ?? '',
      status: s.status || 'LEAD',
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
        setToast({ message: json.message || 'Erro ao importar', type: 'error' })
        return
      }
      if (json.ok && json.data) {
        setImportResult(json.data)
        if (json.data.created > 0) {
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
        observacoes: formData.observacoes.trim() || null,
        status: formData.status || 'LEAD',
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
  }, [students, filters.tipo, filters.professor, sortKey, sortDir])

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

  const columns = [
    {
      key: 'nome',
      label: 'Nome',
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
          onChange={(e) => handleStatusChange(s, e.target.value)}
          className={`text-xs font-semibold rounded-full px-2 py-1 border-0 cursor-pointer ${statusColors[s.status] ?? 'bg-gray-100 text-gray-800'}`}
          title="Alterar status"
        >
          <option value="ACTIVE">Ativo</option>
          <option value="INACTIVE">Inativo</option>
          <option value="PAUSED">Pausado</option>
          <option value="LEAD">Lead</option>
          <option value="REGISTERED">Matriculado</option>
          <option value="PAYMENT_PENDING">Pagamento pendente</option>
          <option value="BLOCKED">Bloqueado</option>
          <option value="COMPLETED">Concluído</option>
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

        <div className="mb-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
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
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg text-red-800">
            {error}
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
        />

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
                    onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                    className="input w-full"
                  >
                    <option value="LEAD">Lead</option>
                    <option value="ACTIVE">Ativo</option>
                    <option value="INACTIVE">Inativo</option>
                    <option value="PAUSED">Pausado</option>
                    <option value="REGISTERED">Matriculado</option>
                    <option value="PAYMENT_PENDING">Pagamento pendente</option>
                    <option value="BLOCKED">Bloqueado</option>
                    <option value="COMPLETED">Concluído</option>
                  </select>
                </div>
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
                }}
                className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:text-sm file:font-medium file:bg-brand-orange file:text-white hover:file:bg-orange-600"
              />
            </div>
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
