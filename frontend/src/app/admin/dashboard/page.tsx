/**
 * Dashboard Admin
 *
 * Página principal do painel administrativo com métricas e gráficos.
 * Cubos clicáveis abrem modal com lista de nomes (e dados extras quando aplicável).
 */

'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import AdminLayout from '@/components/admin/AdminLayout'
import StatCard from '@/components/admin/StatCard'
import Modal from '@/components/admin/Modal'
import TableScrollArea from '@/components/admin/TableScrollArea'
import DesignarAulaModal from '@/components/admin/DesignarAulaModal'
import { toDateKeyInTZ } from '@/lib/datetime'
import {
  UserCheck,
  CalendarX,
  AlertTriangle,
  UserPlus,
  FileClock,
  Link2,
  ArrowRightLeft,
  Download,
  Copy,
  ChevronDown,
  ChevronLeft,
  ListTodo,
  UserX,
} from 'lucide-react'

function LinkItem({ label, path }: { label: string; path: string }) {
  const [copied, setCopied] = useState(false)
  const url = typeof window !== 'undefined' ? `${window.location.origin}${path}` : path
  const copy = () => {
    navigator.clipboard.writeText(url)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }
  return (
    <div className="flex flex-wrap items-center gap-2 bg-white rounded-lg border border-slate-200 px-3 py-2">
      <span className="text-sm font-medium text-slate-700 w-48">{label}:</span>
      <code className="text-xs text-slate-600 flex-1 min-w-0 truncate">{url}</code>
      <button
        type="button"
        onClick={copy}
        className="text-xs px-2 py-1 rounded bg-brand-orange text-white hover:opacity-90 shrink-0"
      >
        {copied ? 'Copiado!' : 'Copiar'}
      </button>
    </div>
  )
}

function formatTime(iso: string): string {
  const d = new Date(iso)
  return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`
}

/** Formata data e hora para exibição (ex.: 03/02 14:00) */
function formatDateTime(iso: string): string {
  const d = new Date(iso)
  const day = d.getDate().toString().padStart(2, '0')
  const month = (d.getMonth() + 1).toString().padStart(2, '0')
  const h = d.getHours().toString().padStart(2, '0')
  const min = d.getMinutes().toString().padStart(2, '0')
  return `${day}/${month} ${h}:${min}`
}

/** Ação registrada na API de auditoria */
interface AuditActivityItem {
  id: string
  actorName: string
  action: string
  detail: string
  createdAt: string
}

interface Metrics {
  users: {
    ACTIVE: number
    PENDING: number
    INACTIVE: number
    total: number
  }
  /** Matrículas (Enrollment) — mesmos números do resumo em Admin › Alunos */
  enrollments?: {
    ACTIVE: number
    INACTIVE: number
  }
  teachers: {
    ACTIVE: number
    INACTIVE: number
    total: number
  }
  studentsWithoutLesson: number
  novosMatriculadosCount: number
  teachersWithProblems: number
  /** Professores com pelo menos uma aula já encerrada sem registro (últimos 60 dias) */
  teachersWithLateLessonRecords: number
  studentsWith3ConsecutiveAbsences: number
  /** To do list: tarefas abertas até hoje; urgentOpen = marcadas com fogo */
  todoOpenCount: number
  todoUrgentOpenCount: number
  /** Reportes de alunos sobre professor ausente/atrasado (abertos ou em verificação) */
  teacherAbsenceAlertCount: number
  absences: {
    studentsWeek: number
    studentsMonth: number
    teachersWeek: number
    teachersMonth: number
  }
}

type ListType =
  | 'activeStudents'
  | 'novosMatriculados'
  | 'studentsWithoutLesson'
  | 'inactiveStudents'
  | 'totalUsers'
  | 'activeTeachers'
  | 'inactiveTeachers'
  | 'teachersWithProblems'
  | 'teachersWithLateLessonRecords'
  | 'studentsWith3ConsecutiveAbsences'
  | 'teacherAbsenceReports'

interface ListItemBase {
  id: string
  nome: string
}
interface ListItemWithoutLesson extends ListItemBase {
  ultimaAulaData: string | null
  ultimoLivro: string | null
  ultimaPagina: string | null
}
interface ListItemNovosMatriculados extends ListItemBase {
  dataMatricula?: string
  linkPagamentoEnviadoAt?: string | null
  dataPagamentoAgendada?: string | null
  recebeuBoleto?: boolean
  jaPagou?: boolean
  boletoUrl?: string | null
  pixCopyPaste?: string | null
  frequenciaSemanal?: number | null
  tempoAulaMinutos?: number | null
  melhoresDiasSemana?: string | null
  melhoresHorarios?: string | null
  escolaMatriculaLabel?: string | null
  primeiraAulaStartAt?: string | null
  primeiraAulaTeacherName?: string | null
}
interface ListItemAlunosParaRedirecionar extends ListItemBase {
  professorNome?: string
  frequenciaSemanal?: number | null
  tempoAulaMinutos?: number | null
}
interface ListItemTotalUser extends ListItemBase {
  role?: string
}
interface ListItemInactiveStudent extends ListItemBase {
  inactiveAt?: string | null
  inativadoPorNome?: string | null
  motivoInativacao?: string | null
}
/** Lista: alunos com 3+ faltas no mesmo mês (registro de aula) */
interface ListItemAusenciasMes extends ListItemBase {
  faltasNoMes?: number
  mesReferencia?: string
  professoresNomes?: string[]
}
/** Professores com aulas confirmadas já encerradas e sem LessonRecord */
interface ListItemTeachersLateRecords extends ListItemBase {
  aulasSemRegistro?: number
  aulaMaisAntiga?: string | null
  janelaDias?: number
}
/** Linha da API ?teacherId= (aulas sem registro de um professor) */
interface LateRecordLessonDetail {
  lessonId: string
  enrollmentId: string
  alunoNome: string
  startAt: string
  durationMinutes: number | null
  janelaDias?: number
}
/** Reporte de aluno: professor ausente ou atrasado */
interface ListItemTeacherAbsenceReport extends ListItemBase {
  lessonId?: string
  studentName?: string
  teacherName?: string
  reportType?: 'ABSENT' | 'LATE'
  reportTypeLabel?: string
  entitlesReplacement?: boolean
  status?: 'OPEN' | 'VERIFYING' | 'RESOLVED'
  lessonStartAt?: string
  verifyingByName?: string | null
  resolvedByName?: string | null
  message?: string
  replacementRule?: string
}

const LIST_TITLES: Record<ListType, string> = {
  activeStudents: 'Alunos Ativos',
  novosMatriculados: 'Novos alunos matriculados',
  studentsWithoutLesson: 'Alunos sem aula designada',
  inactiveStudents: 'Alunos Inativos',
  totalUsers: 'Total de Usuários',
  activeTeachers: 'Professores Ativos',
  inactiveTeachers: 'Professores Inativos',
  teachersWithProblems: 'Professores com problemas',
  teachersWithLateLessonRecords: 'Professores com registros atrasados',
  studentsWith3ConsecutiveAbsences: 'Alunos com 3 ausências consecutivas',
  teacherAbsenceReports: 'Alerta de professor ausente',
}

export default function AdminDashboardPage() {
  const router = useRouter()
  const [metrics, setMetrics] = useState<Metrics | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [modalType, setModalType] = useState<ListType | null>(null)
  const [listData, setListData] = useState<
    (
      | ListItemWithoutLesson
      | ListItemTotalUser
      | ListItemNovosMatriculados
      | ListItemAlunosParaRedirecionar
      | ListItemInactiveStudent
      | ListItemAusenciasMes
      | ListItemTeachersLateRecords
      | ListItemTeacherAbsenceReport
    )[]
  >([])
  const [listLoading, setListLoading] = useState(false)
  const [updatingAbsenceReportId, setUpdatingAbsenceReportId] = useState<string | null>(null)
  const [lateRecordsTeacherDetail, setLateRecordsTeacherDetail] = useState<{ id: string; nome: string } | null>(null)
  const [lateRecordsLessonRows, setLateRecordsLessonRows] = useState<LateRecordLessonDetail[]>([])
  const [lateRecordsDetailLoading, setLateRecordsDetailLoading] = useState(false)
  const [adminActivities, setAdminActivities] = useState<AuditActivityItem[]>([])
  const [adminActivitiesLoading, setAdminActivitiesLoading] = useState(true)
  const [expandedActivityDays, setExpandedActivityDays] = useState<Set<string>>(new Set())
  const [marcandoAulasId, setMarcandoAulasId] = useState<string | null>(null)
  const [marcandoLinkPagId, setMarcandoLinkPagId] = useState<string | null>(null)
  const [linksImportantesAberto, setLinksImportantesAberto] = useState(false)
  const [copiedPixId, setCopiedPixId] = useState<string | null>(null)
  const [designarAulaEnrollment, setDesignarAulaEnrollment] = useState<ListItemNovosMatriculados | ListItemAlunosParaRedirecionar | ListItemWithoutLesson | null>(null)
  const [designarAulaFromModalType, setDesignarAulaFromModalType] = useState<ListType | null>(null)

  useEffect(() => {
    fetchMetrics()
  }, [])

  const fetchAdminActivities = useCallback(async () => {
    setAdminActivitiesLoading(true)
    try {
      const res = await fetch('/api/admin/audit-activity?days=20', { credentials: 'include' })
      const json = await res.json()
      if (json.ok && Array.isArray(json.data?.activities)) {
        setAdminActivities(json.data.activities)
      } else {
        setAdminActivities([])
      }
    } catch {
      setAdminActivities([])
    } finally {
      setAdminActivitiesLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchAdminActivities()
  }, [fetchAdminActivities])

  const adminActivitiesByDay = useMemo(() => {
    const map = new Map<string, AuditActivityItem[]>()
    for (const item of adminActivities) {
      const key = toDateKeyInTZ(new Date(item.createdAt))
      const list = map.get(key) ?? []
      list.push(item)
      map.set(key, list)
    }
    return Array.from(map.entries())
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([dateKey, items]) => {
        const [y, m, d] = dateKey.split('-').map(Number)
        const label = new Date(Date.UTC(y, m - 1, d, 12, 0, 0)).toLocaleDateString('pt-BR', {
          weekday: 'long',
          day: '2-digit',
          month: '2-digit',
          year: 'numeric',
          timeZone: 'America/Sao_Paulo',
        })
        return { dateKey, label, items }
      })
  }, [adminActivities])

  const toggleActivityDay = (dateKey: string) => {
    setExpandedActivityDays((prev) => {
      const next = new Set(prev)
      if (next.has(dateKey)) next.delete(dateKey)
      else next.add(dateKey)
      return next
    })
  }

  const openListModal = useCallback(
    async (type: ListType) => {
      setModalType(type)
      setLateRecordsTeacherDetail(null)
      setLateRecordsLessonRows([])
      setListData([])
      setListLoading(true)
      try {
        const res = await fetch(`/api/admin/dashboard-lists?type=${type}`, {
          credentials: 'include',
        })
        const json = await res.json()
        if (json.ok && Array.isArray(json.data)) {
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

  const closeModal = useCallback(() => {
    setModalType(null)
    setLateRecordsTeacherDetail(null)
    setLateRecordsLessonRows([])
  }, [])

  const openTeachersLateDetail = useCallback(async (teacherId: string, teacherNome: string) => {
    setLateRecordsTeacherDetail({ id: teacherId, nome: teacherNome })
    setLateRecordsDetailLoading(true)
    setLateRecordsLessonRows([])
    try {
      const res = await fetch(
        `/api/admin/dashboard-lists?type=teachersWithLateLessonRecords&teacherId=${encodeURIComponent(teacherId)}`,
        { credentials: 'include' }
      )
      const json = await res.json()
      if (json.ok && Array.isArray(json.data)) {
        setLateRecordsLessonRows(json.data as LateRecordLessonDetail[])
      } else {
        setLateRecordsLessonRows([])
      }
    } catch {
      setLateRecordsLessonRows([])
    } finally {
      setLateRecordsDetailLoading(false)
    }
  }, [])

  const backToTeachersLateList = useCallback(() => {
    setLateRecordsTeacherDetail(null)
    setLateRecordsLessonRows([])
  }, [])

  const updateTeacherAbsenceReport = useCallback(
    async (reportId: string, action: 'VERIFYING' | 'RESOLVED' | 'CONFIRM_ABSENCE', lessonId?: string) => {
      setUpdatingAbsenceReportId(reportId)
      try {
        const res = await fetch(`/api/admin/teacher-absence-reports/${reportId}`, {
          method: 'PATCH',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action }),
        })
        const json = await res.json()
        if (json.ok) {
          if (action === 'CONFIRM_ABSENCE') {
            setListData((prev) => prev.filter((item) => item.id !== reportId))
            fetchMetrics()
            closeModal()
            const targetLessonId = json.data?.lessonId ?? lessonId
            if (targetLessonId) {
              router.push(`/admin/calendario?reagendar=${encodeURIComponent(targetLessonId)}`)
            } else {
              router.push('/admin/calendario')
            }
            return
          }
          if (action === 'RESOLVED') {
            setListData((prev) => prev.filter((item) => item.id !== reportId))
          } else if (json.data?.report) {
            const updated = json.data.report as ListItemTeacherAbsenceReport
            setListData((prev) =>
              prev.map((item) =>
                item.id === reportId
                  ? {
                      ...item,
                      status: updated.status,
                      verifyingByName: updated.verifyingByName,
                    }
                  : item
              )
            )
          }
          fetchMetrics()
        }
      } catch {
        /* ignore */
      } finally {
        setUpdatingAbsenceReportId(null)
      }
    },
    [router, closeModal]
  )

  const marcarAulasAdicionadas = useCallback(
    async (enrollmentId: string) => {
      setMarcandoAulasId(enrollmentId)
      try {
        const res = await fetch(`/api/admin/enrollments/${enrollmentId}/marcar-aulas-adicionadas`, {
          method: 'PATCH',
          credentials: 'include',
        })
        const json = await res.json()
        if (json.ok) {
          setListData((prev) => prev.filter((item) => item.id !== enrollmentId))
          fetchMetrics()
        }
      } catch (e) {
        console.error(e)
      } finally {
        setMarcandoAulasId(null)
      }
    },
    []
  )

  const marcarLinkPagEnviado = useCallback(
    async (enrollmentId: string) => {
      setMarcandoLinkPagId(enrollmentId)
      try {
        const res = await fetch(`/api/admin/enrollments/${enrollmentId}/marcar-link-pagamento-enviado`, {
          method: 'PATCH',
          credentials: 'include',
        })
        const json = await res.json()
        if (json.ok) {
          setListData((prev) =>
            prev.map((item) =>
              item.id === enrollmentId
                ? { ...item, linkPagamentoEnviadoAt: new Date().toISOString() }
                : item
            )
          )
        }
      } catch (e) {
        console.error(e)
      } finally {
        setMarcandoLinkPagId(null)
      }
    },
    []
  )

  const fetchMetrics = async () => {
    try {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 8000) // 8s timeout

      const response = await fetch('/api/admin/metrics', {
        credentials: 'include',
        signal: controller.signal,
      })
      clearTimeout(timeoutId)

      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          router.push('/login?tab=admin')
          return
        }
        const text = await response.text()
        let msg = 'Erro ao carregar métricas'
        try {
          const json = JSON.parse(text)
          if (json?.message) msg = json.message
        } catch {
          if (text?.startsWith('Internal')) msg = 'Servidor indisponível. Tente recarregar.'
        }
        throw new Error(msg)
      }

      const text = await response.text()
      let json: { ok?: boolean; data?: Metrics; message?: string }
      try {
        json = JSON.parse(text)
      } catch {
        setError('Resposta inválida do servidor. Tente recarregar.')
        setLoading(false)
        return
      }
      if (json.ok && json.data) {
        setMetrics(json.data)
      } else {
        throw new Error(json.message || 'Erro ao carregar métricas')
      }
    } catch (err) {
      console.error('Erro ao buscar métricas:', err)
      if (err instanceof Error) {
        if (err.name === 'AbortError') {
          setError('A requisição demorou demais. Verifique a conexão e tente recarregar.')
        } else {
          setError(err.message)
        }
      } else {
        setError('Erro ao carregar dados')
      }
    } finally {
      setLoading(false)
    }
  }


  if (loading) {
    return (
      <AdminLayout>
        <div className="text-center py-12 text-gray-600">Carregando...</div>
      </AdminLayout>
    )
  }

  if (error) {
    return (
      <AdminLayout>
        <div className="text-center py-12">
          <p className="text-red-600 mb-4">{error}</p>
          <button
            type="button"
            onClick={() => {
              setError(null)
              setLoading(true)
              fetchMetrics()
            }}
            className="px-4 py-2 bg-brand-orange text-white rounded-lg font-medium hover:opacity-90"
          >
            Tentar novamente
          </button>
        </div>
      </AdminLayout>
    )
  }

  return (
    <AdminLayout>
      <div className="min-h-screen bg-gradient-to-b from-slate-50 via-white to-slate-50/50">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-1">
            <div className="w-1 h-10 rounded-full bg-gradient-to-b from-brand-orange to-amber-500" aria-hidden />
            <h1 className="text-3xl md:text-4xl font-bold bg-gradient-to-r from-gray-900 to-gray-700 bg-clip-text text-transparent">
              Dashboard Admin
            </h1>
          </div>
          <p className="text-sm text-slate-500 ml-4">
            Visão geral do sistema e métricas de usuários
          </p>
        </div>

        {/* Links importantes: matrícula parceiros + cadastro professor (recolhível) */}
        <div className="mb-6 rounded-xl border border-slate-200 bg-slate-50/80 overflow-hidden">
          <button
            type="button"
            onClick={() => setLinksImportantesAberto((v) => !v)}
            aria-expanded={linksImportantesAberto}
            className="w-full flex items-center gap-3 p-4 text-left hover:bg-slate-100/80 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-orange focus-visible:ring-offset-2 rounded-xl"
          >
            <ChevronDown
              className={`w-5 h-5 text-slate-500 shrink-0 transition-transform duration-200 ${linksImportantesAberto ? 'rotate-0' : '-rotate-90'}`}
              aria-hidden
            />
            <Link2 className="w-5 h-5 text-slate-600 shrink-0" />
            <h3 className="text-sm font-semibold text-slate-700 flex-1">Links importantes</h3>
            <span className="text-xs text-slate-500 hidden sm:inline">
              {linksImportantesAberto ? 'Recolher' : 'Expandir'}
            </span>
          </button>
          {linksImportantesAberto && (
            <div className="px-4 pb-4 pt-0 border-t border-slate-200/80">
              <p className="text-xs text-slate-600 mb-3 pt-3">
                Links de matrícula para escolas parceiras (o formulário exibe o nome da escola automaticamente) e
                formulário público para candidatos a professor se cadastrarem — o cadastro fica pendente até a
                equipe aprovar e liberar o acesso.
              </p>
              <div className="space-y-2">
                <LinkItem label="Youbecome" path="/matricula?escola=YOUBECOME" />
                <LinkItem label="Highway" path="/matricula?escola=HIGHWAY" />
                <LinkItem label="Outra escola (troque NomeEscola)" path="/matricula?escola=OUTRO&nome=NomeEscola" />
                <LinkItem label="Cadastro de professor (candidatos)" path="/cadastro-professor" />
              </div>
            </div>
          )}
        </div>

        {/* Cubos de métricas (estilo financeiro, um único grid alinhado) */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-3 gap-3 mb-8 items-stretch">
          <div
            role="button"
            tabIndex={0}
            onClick={() => openListModal('activeStudents')}
            onKeyDown={(e) => e.key === 'Enter' && openListModal('activeStudents')}
            className="cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-brand-orange rounded-xl transition-transform hover:scale-[1.02] active:scale-[0.99] min-h-0"
          >
            <StatCard
              variant="finance"
              title="Alunos Ativos"
              value={metrics?.enrollments?.ACTIVE ?? metrics?.users.ACTIVE ?? 0}
              icon={<UserCheck className="w-5 h-5" />}
              color="green"
              subtitle="Matrículas ativas (mesmo critério da página Alunos)"
            />
          </div>
          <div
            role="button"
            tabIndex={0}
            onClick={() => openListModal('novosMatriculados')}
            onKeyDown={(e) => e.key === 'Enter' && openListModal('novosMatriculados')}
            className={`cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-brand-orange rounded-xl transition-transform hover:scale-[1.02] active:scale-[0.99] min-h-0 ${(metrics?.novosMatriculadosCount ?? 0) > 0 ? 'animate-blink-alert' : ''}`}
          >
            <StatCard
              variant="finance"
              title="Novos alunos matriculados"
              value={metrics?.novosMatriculadosCount ?? 0}
              icon={<UserPlus className="w-5 h-5" />}
              color="blue"
              subtitle="Clique para ver, marcar «enviei link pag» e «tudo feito»"
            />
          </div>
          <div
            role="button"
            tabIndex={0}
            onClick={() => openListModal('studentsWith3ConsecutiveAbsences')}
            onKeyDown={(e) => e.key === 'Enter' && openListModal('studentsWith3ConsecutiveAbsences')}
            className="cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-brand-orange rounded-xl transition-transform hover:scale-[1.02] active:scale-[0.99] min-h-0"
          >
            <StatCard
              variant="finance"
              title="Alunos marcados como ausentes 3 vezes consecutivas"
              value={metrics?.studentsWith3ConsecutiveAbsences ?? 0}
              icon={<CalendarX className="w-5 h-5" />}
              color="orange"
              subtitle="3x ou mais 'Não compareceu' no mesmo mês"
            />
          </div>
          <div
            role="button"
            tabIndex={0}
            onClick={() => openListModal('teachersWithProblems')}
            onKeyDown={(e) => e.key === 'Enter' && openListModal('teachersWithProblems')}
            className="cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-brand-orange rounded-xl transition-transform hover:scale-[1.02] active:scale-[0.99] min-h-0"
          >
            <StatCard
              variant="finance"
              title="Professores com problemas"
              value={metrics?.teachersWithProblems ?? 0}
              icon={<AlertTriangle className="w-5 h-5" />}
              color="red"
              subtitle="Avaliação 1 estrela"
            />
          </div>
          <div
            role="button"
            tabIndex={0}
            onClick={() => openListModal('teachersWithLateLessonRecords')}
            onKeyDown={(e) => e.key === 'Enter' && openListModal('teachersWithLateLessonRecords')}
            className={`cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-brand-orange rounded-xl transition-transform hover:scale-[1.02] active:scale-[0.99] min-h-0 ${(metrics?.teachersWithLateLessonRecords ?? 0) > 0 ? 'animate-blink-alert' : ''}`}
          >
            <StatCard
              variant="finance"
              title="Professores com registros atrasados"
              value={metrics?.teachersWithLateLessonRecords ?? 0}
              icon={<FileClock className="w-5 h-5" />}
              color="indigo"
              subtitle="Só períodos em aberto no financeiro; aulas encerradas sem registro (60 dias)"
            />
          </div>
          <div
            role="button"
            tabIndex={0}
            onClick={() => openListModal('teacherAbsenceReports')}
            onKeyDown={(e) => e.key === 'Enter' && openListModal('teacherAbsenceReports')}
            className={`cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-brand-orange rounded-xl transition-transform hover:scale-[1.02] active:scale-[0.99] min-h-0 ${(metrics?.teacherAbsenceAlertCount ?? 0) > 0 ? 'animate-blink-alert' : ''}`}
          >
            <StatCard
              variant="finance"
              title="Alerta de professor ausente"
              value={metrics?.teacherAbsenceAlertCount ?? 0}
              icon={<UserX className="w-5 h-5" />}
              color="red"
              subtitle="Reportes de alunos (ausente ou atraso) — clique para verificar"
            />
          </div>
          <div
            role="button"
            tabIndex={0}
            onClick={() => router.push('/admin/todos')}
            onKeyDown={(e) => e.key === 'Enter' && router.push('/admin/todos')}
            className={`cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-brand-orange rounded-xl transition-transform hover:scale-[1.02] active:scale-[0.99] min-h-0 ${(metrics?.todoOpenCount ?? 0) > 0 ? 'animate-blink-alert' : ''}`}
          >
            <StatCard
              variant="finance"
              title="To do — a fazer"
              value={metrics?.todoOpenCount ?? 0}
              icon={<ListTodo className="w-5 h-5" />}
              color="teal"
              subtitle={
                (metrics?.todoUrgentOpenCount ?? 0) > 0
                  ? `${metrics?.todoUrgentOpenCount} urgente(s) · clique para abrir a lista`
                  : 'Tarefas abertas até hoje · clique para abrir'
              }
            />
          </div>
        </div>

        {/* Ações dos admins — últimos 20 dias */}
        <div className="rounded-2xl border border-slate-200/80 bg-white p-6 md:p-8 shadow-lg mb-8">
          <h2 className="text-xl font-semibold text-slate-800 mb-1 pb-3 border-b border-slate-100">
            Ações da administração
          </h2>
          <p className="text-xs text-slate-500 mb-6">
            Agendamentos, cancelamentos, alterações de aulas, registros, alertas e solicitações dos últimos{' '}
            <strong>20 dias</strong>. Clique em um dia para ver todas as ações.
          </p>
          {adminActivitiesLoading ? (
            <p className="text-gray-500 py-8 text-center">Carregando ações...</p>
          ) : adminActivitiesByDay.length === 0 ? (
            <p className="text-gray-500 py-8 text-center">Nenhuma ação registrada nos últimos 20 dias.</p>
          ) : (
            <div className="space-y-2">
              {adminActivitiesByDay.map(({ dateKey, label, items }) => {
                const expanded = expandedActivityDays.has(dateKey)
                return (
                  <div key={dateKey} className="rounded-xl border border-slate-200 overflow-hidden">
                    <button
                      type="button"
                      onClick={() => toggleActivityDay(dateKey)}
                      className="w-full flex items-center gap-3 px-4 py-3 text-left bg-slate-50 hover:bg-slate-100 transition-colors"
                    >
                      <ChevronDown
                        className={`w-5 h-5 text-slate-500 shrink-0 transition-transform ${expanded ? 'rotate-0' : '-rotate-90'}`}
                      />
                      <span className="font-semibold text-slate-800 capitalize flex-1">{label}</span>
                      <span className="text-sm text-slate-500">
                        {items.length} {items.length === 1 ? 'ação' : 'ações'}
                      </span>
                    </button>
                    {expanded && (
                      <TableScrollArea scrollClassName="overflow-x-auto max-h-[420px] overflow-y-auto">
                        <table className="w-full text-left border-collapse">
                          <thead className="sticky top-0 bg-white border-b border-gray-200">
                            <tr>
                              <th className="py-2 px-4 font-semibold text-gray-700 text-sm">Hora</th>
                              <th className="py-2 px-4 font-semibold text-gray-700 text-sm">Quem</th>
                              <th className="py-2 px-4 font-semibold text-gray-700 text-sm">Ação</th>
                              <th className="py-2 px-4 font-semibold text-gray-700 text-sm">Detalhe</th>
                            </tr>
                          </thead>
                          <tbody>
                            {items.map((item) => (
                              <tr key={item.id} className="border-b border-gray-100 hover:bg-slate-50/80">
                                <td className="py-2 px-4 text-sm text-gray-600 whitespace-nowrap">
                                  {formatDateTime(item.createdAt)}
                                </td>
                                <td className="py-2 px-4 text-sm font-medium text-gray-900">{item.actorName}</td>
                                <td className="py-2 px-4 text-sm text-gray-800">{item.action}</td>
                                <td className="py-2 px-4 text-sm text-gray-600">{item.detail}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </TableScrollArea>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Modal de lista ao clicar no cubo */}
        <Modal
          isOpen={modalType !== null}
          onClose={closeModal}
          title={
            modalType
              ? modalType === 'teachersWithLateLessonRecords' && lateRecordsTeacherDetail
                ? `Aulas sem registro — ${lateRecordsTeacherDetail.nome}`
                : LIST_TITLES[modalType]
              : ''
          }
          size="xl"
        >
          {listLoading ? (
            <p className="text-gray-500">Carregando...</p>
          ) : listData.length === 0 ? (
            <p className="text-gray-500">Nenhum registro.</p>
          ) : modalType === 'novosMatriculados' ? (
            <div className="space-y-3">
              <p className="text-sm text-gray-600">
                Alunos que se matricularam pelo formulário e ainda não foram marcados como «tudo feito». Use «Enviei link pag» para registrar o envio do link de pagamento; «Selecionar aulas» para agendar as aulas. «Tudo feito» remove o aluno desta lista{' '}
                <strong>mesmo sem pagamento confirmado</strong> (quem começa e paga depois).
              </p>
              <TableScrollArea>
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-gray-200">
                      <th className="py-2 pr-4 font-semibold text-gray-700">Nome</th>
                      <th className="py-2 pr-4 font-semibold text-gray-700">Escola</th>
                      <th className="py-2 pr-4 font-semibold text-gray-700">Matrícula</th>
                      <th className="py-2 pr-4 font-semibold text-gray-700">Vencimento</th>
                      <th className="py-2 pr-4 font-semibold text-gray-700">Boleto</th>
                      <th className="py-2 pr-4 font-semibold text-gray-700">Pago</th>
                      <th className="py-2 font-semibold text-gray-700">Ação</th>
                    </tr>
                  </thead>
                  <tbody>
                    {listData.map((item) => {
                      const row = item as ListItemNovosMatriculados
                      const dataFormatada = row.dataMatricula
                        ? new Date(row.dataMatricula).toLocaleDateString('pt-BR', {
                            day: '2-digit',
                            month: '2-digit',
                            year: 'numeric',
                          })
                        : '—'
                      const vencFormatado = row.dataPagamentoAgendada
                        ? new Date(row.dataPagamentoAgendada).toLocaleDateString('pt-BR', {
                            day: '2-digit',
                            month: '2-digit',
                            year: 'numeric',
                          })
                        : '—'
                      const isLoadingAulas = marcandoAulasId === row.id
                      const isLoadingLink = marcandoLinkPagId === row.id
                      const linkEnviado = !!row.linkPagamentoEnviadoAt
                      const jaPagou = !!row.jaPagou
                      const temAula = !!row.primeiraAulaStartAt
                      const primeiraAulaDataHora = row.primeiraAulaStartAt
                        ? (() => {
                            const d = new Date(row.primeiraAulaStartAt)
                            const data = d.toLocaleDateString('pt-BR', {
                              day: '2-digit',
                              month: '2-digit',
                              year: 'numeric',
                            })
                            const hora = d.toLocaleTimeString('pt-BR', {
                              hour: '2-digit',
                              minute: '2-digit',
                            })
                            return { data, hora }
                          })()
                        : null
                      return (
                        <tr key={row.id} className="border-b border-gray-100">
                          <td className="py-2 pr-4">{row.nome}</td>
                          <td className="py-2 pr-4">{row.escolaMatriculaLabel ?? '—'}</td>
                          <td className="py-2 pr-4">{dataFormatada}</td>
                          <td className="py-2 pr-4">{vencFormatado}</td>
                          <td className="py-2 pr-4">
                            <div className="flex flex-wrap items-center gap-2">
                              {row.boletoUrl ? (
                                <a
                                  href={row.boletoUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1 px-2 py-1 text-sm text-emerald-700 hover:bg-emerald-50 rounded"
                                  title="Baixar/visualizar boleto"
                                >
                                  <Download className="w-4 h-4" />
                                  Boleto
                                </a>
                              ) : null}
                              {row.pixCopyPaste ? (
                                <button
                                  type="button"
                                  onClick={() => {
                                    navigator.clipboard.writeText(row.pixCopyPaste!)
                                    setCopiedPixId(row.id)
                                    setTimeout(() => setCopiedPixId(null), 2500)
                                  }}
                                  className="inline-flex items-center gap-1 px-2 py-1 text-sm text-sky-700 hover:bg-sky-50 rounded"
                                  title="Copiar link PIX para enviar ao aluno"
                                >
                                  <Copy className="w-4 h-4" />
                                  {copiedPixId === row.id ? 'Copiado!' : 'PIX'}
                                </button>
                              ) : null}
                              {!row.boletoUrl && !row.pixCopyPaste ? '—' : null}
                            </div>
                          </td>
                          <td className="py-2 pr-4">{jaPagou ? '✓ Sim' : '—'}</td>
                          <td className="py-2">
                            <div className="flex flex-col gap-1">
                              <div className="flex flex-col gap-2">
                                <button
                                  type="button"
                                  onClick={() => marcarLinkPagEnviado(row.id)}
                                  disabled={isLoadingLink || linkEnviado}
                                  className={`w-full text-left px-3 py-1.5 text-sm font-medium rounded-lg disabled:cursor-not-allowed disabled:opacity-50 ${
                                    linkEnviado
                                      ? 'bg-gray-200 text-gray-600 cursor-default'
                                      : 'bg-sky-600 text-white hover:opacity-90'
                                  }`}
                                >
                                  {isLoadingLink ? 'Salvando...' : linkEnviado ? 'Link enviado ✓' : 'Enviei link pag'}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setDesignarAulaEnrollment(row)}
                                  className="w-full text-left px-3 py-1.5 text-sm font-medium rounded-lg bg-emerald-600 text-white hover:opacity-90"
                                >
                                  {temAula ? 'Editar aulas' : 'Selecionar aulas'}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => marcarAulasAdicionadas(row.id)}
                                  disabled={isLoadingAulas}
                                  className="w-full text-left px-3 py-1.5 text-sm font-medium rounded-lg bg-brand-orange text-white hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                  {isLoadingAulas ? 'Salvando...' : 'Tudo feito'}
                                </button>
                              </div>
                              {temAula && primeiraAulaDataHora ? (
                                <p className="text-xs text-gray-600">
                                  Aulas já selecionadas: começa em {primeiraAulaDataHora.data} às {primeiraAulaDataHora.hora}{' '}
                                  com {row.primeiraAulaTeacherName || 'professor a definir'}.
                                </p>
                              ) : (
                                <p className="text-xs text-amber-700">
                                  {jaPagou ? 'Pagamento confirmado.' : 'Pagamento ainda não confirmado.'}
                                </p>
                              )}
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </TableScrollArea>
            </div>
          ) : modalType === 'studentsWithoutLesson' ? (
            <TableScrollArea>
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="py-2 pr-4 font-semibold text-gray-700">Nome</th>
                    <th className="py-2 pr-4 font-semibold text-gray-700">Data da última aula</th>
                    <th className="py-2 pr-4 font-semibold text-gray-700">Livro (última aula)</th>
                    <th className="py-2 font-semibold text-gray-700">Ação</th>
                  </tr>
                </thead>
                <tbody>
                  {listData.map((item) => {
                    const row = item as ListItemWithoutLesson
                    const dataFormatada = row.ultimaAulaData
                      ? new Date(row.ultimaAulaData).toLocaleDateString('pt-BR', {
                          day: '2-digit',
                          month: '2-digit',
                          year: 'numeric',
                        })
                      : '—'
                    return (
                      <tr key={row.id} className="border-b border-gray-100">
                        <td className="py-2 pr-4">{row.nome}</td>
                        <td className="py-2 pr-4">{dataFormatada}</td>
                        <td className="py-2 pr-4">{row.ultimoLivro ?? '—'}</td>
                        <td className="py-2">
                          <button
                            type="button"
                            onClick={() => {
                              setDesignarAulaFromModalType('studentsWithoutLesson')
                              setDesignarAulaEnrollment(row)
                            }}
                            className="px-3 py-1.5 text-sm font-medium rounded-lg bg-emerald-600 text-white hover:opacity-90"
                          >
                            Agendar aula
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </TableScrollArea>
          ) : modalType === 'studentsWith3ConsecutiveAbsences' ? (
            <div className="space-y-3">
              <p className="text-sm text-gray-600">
                Alunos que tiveram 3 ou mais registros de &quot;Não compareceu&quot; no mesmo mês. A coluna{' '}
                <strong>Faltas</strong> refere-se ao mês em que o aluno mais faltou (entre os meses com 3+ faltas).
              </p>
              <TableScrollArea>
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-gray-200">
                      <th className="py-2 pr-4 font-semibold text-gray-700">Nome</th>
                      <th className="py-2 pr-4 font-semibold text-gray-700">Mês</th>
                      <th className="py-2 pr-4 font-semibold text-gray-700">Faltas no mês</th>
                      <th className="py-2 font-semibold text-gray-700">Professores</th>
                    </tr>
                  </thead>
                  <tbody>
                    {listData.map((item) => {
                      const row = item as ListItemAusenciasMes
                      const mesFmt = row.mesReferencia
                        ? (() => {
                            const [y, m] = row.mesReferencia.split('-')
                            const d = new Date(Number(y), Number(m) - 1, 1)
                            return d.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
                          })()
                        : '—'
                      const profs =
                        row.professoresNomes && row.professoresNomes.length > 0
                          ? row.professoresNomes.join(', ')
                          : '—'
                      return (
                        <tr key={row.id} className="border-b border-gray-100">
                          <td className="py-2 pr-4">{row.nome}</td>
                          <td className="py-2 pr-4 text-gray-700">{mesFmt}</td>
                          <td className="py-2 pr-4 font-medium text-gray-900">{row.faltasNoMes ?? '—'}</td>
                          <td className="py-2 text-gray-700 text-sm">{profs}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </TableScrollArea>
            </div>
          ) : modalType === 'teachersWithLateLessonRecords' ? (
            lateRecordsTeacherDetail ? (
              <div className="space-y-3">
                <button
                  type="button"
                  onClick={backToTeachersLateList}
                  className="inline-flex items-center gap-1 text-sm font-medium text-brand-orange hover:underline"
                >
                  <ChevronLeft className="w-4 h-4" aria-hidden />
                  Voltar à lista de professores
                </button>
                <p className="text-sm text-gray-600">
                  Aulas já encerradas, sem registro de aula, dentro de período em aberto no financeiro (mesma regra da
                  lista geral).
                </p>
                {lateRecordsDetailLoading ? (
                  <p className="text-gray-500">Carregando aulas...</p>
                ) : lateRecordsLessonRows.length === 0 ? (
                  <p className="text-gray-500">Nenhuma aula pendente para este professor.</p>
                ) : (
                  <TableScrollArea
                    className="border border-gray-100 rounded-lg"
                    scrollClassName="overflow-x-auto max-h-[min(60vh,480px)] overflow-y-auto"
                  >
                    <table className="w-full text-left border-collapse">
                      <thead className="sticky top-0 bg-white border-b border-gray-200 z-10">
                        <tr>
                          <th className="py-2 pr-4 pl-3 font-semibold text-gray-700">Data e hora da aula</th>
                          <th className="py-2 pr-4 font-semibold text-gray-700">Aluno</th>
                          <th className="py-2 pr-3 font-semibold text-gray-700">Duração</th>
                        </tr>
                      </thead>
                      <tbody>
                        {lateRecordsLessonRows.map((row) => (
                          <tr key={row.lessonId} className="border-b border-gray-100">
                            <td className="py-2 pr-4 pl-3 text-gray-900">{formatDateTime(row.startAt)}</td>
                            <td className="py-2 pr-4">{row.alunoNome}</td>
                            <td className="py-2 pr-3 text-gray-600 text-sm">
                              {row.durationMinutes != null ? `${row.durationMinutes} min` : '—'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </TableScrollArea>
                )}
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-sm text-gray-600">
                  Professores com pelo menos uma aula <strong>confirmada ou reposição</strong> que já terminou (horário de
                  fim) e ainda <strong>não tem registro de aula</strong> (livro/páginas/presença). Considera apenas aulas
                  nos últimos{' '}
                  {(listData[0] as ListItemTeachersLateRecords | undefined)?.janelaDias ?? 60} dias e matrículas ativas
                  ou em curso. Só entram aulas cujo início cai em um período de pagamento do professor{' '}
                  <strong>em aberto</strong> (financeiro, com início e fim definidos; períodos já{' '}
                  <strong>PAGO</strong> não contam). <strong>Clique no nome do professor</strong> para ver cada aula
                  pendente.
                </p>
                <TableScrollArea>
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-gray-200">
                        <th className="py-2 pr-4 font-semibold text-gray-700">Professor</th>
                        <th className="py-2 pr-4 font-semibold text-gray-700">Aulas sem registro</th>
                        <th className="py-2 font-semibold text-gray-700">Início da aula mais antiga (pendente)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {listData.map((item) => {
                        const row = item as ListItemTeachersLateRecords
                        const maisAntiga =
                          row.aulaMaisAntiga != null
                            ? formatDateTime(row.aulaMaisAntiga)
                            : '—'
                        return (
                          <tr key={row.id} className="border-b border-gray-100">
                            <td className="py-2 pr-4">
                              <button
                                type="button"
                                onClick={() => openTeachersLateDetail(row.id, row.nome)}
                                className="font-medium text-left text-brand-orange hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-orange rounded"
                              >
                                {row.nome}
                              </button>
                            </td>
                            <td className="py-2 pr-4">{row.aulasSemRegistro ?? '—'}</td>
                            <td className="py-2 text-gray-700 text-sm">{maisAntiga}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </TableScrollArea>
              </div>
            )
          ) : modalType === 'inactiveStudents' ? (
            <TableScrollArea>
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="py-2 pr-4 font-semibold text-gray-700">Nome</th>
                    <th className="py-2 pr-4 font-semibold text-gray-700">Motivo</th>
                    <th className="py-2 pr-4 font-semibold text-gray-700">Inativado por</th>
                    <th className="py-2 font-semibold text-gray-700">Data</th>
                  </tr>
                </thead>
                <tbody>
                  {listData.map((item) => {
                    const row = item as ListItemInactiveStudent
                    const por = row.inativadoPorNome?.trim() ? row.inativadoPorNome : 'Não registrado'
                    const motivo = row.motivoInativacao?.trim() ? row.motivoInativacao : '—'
                    const dataFormatada = row.inactiveAt
                      ? new Date(row.inactiveAt).toLocaleDateString('pt-BR', {
                          day: '2-digit',
                          month: '2-digit',
                          year: 'numeric',
                        })
                      : '—'
                    return (
                      <tr key={row.id} className="border-b border-gray-100">
                        <td className="py-2 pr-4">{row.nome}</td>
                        <td className="py-2 pr-4 text-gray-700 text-sm">{motivo}</td>
                        <td className="py-2 pr-4 text-gray-700">{por}</td>
                        <td className="py-2 text-gray-600 text-sm">{dataFormatada}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </TableScrollArea>
          ) : modalType === 'teacherAbsenceReports' ? (
            <div className="space-y-3">
              <p className="text-sm text-gray-600">
                <strong>Regra:</strong> professor ausente confirmado → a aula é cancelada pelo professor
                e a gestão agenda uma <strong>reposição</strong> no calendário. Ausência na videochamada
                é detectada automaticamente após 5 min sem entrada do professor.
              </p>
              <TableScrollArea>
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-gray-200">
                      <th className="py-2 pr-4 font-semibold text-gray-700">Reporte</th>
                      <th className="py-2 pr-4 font-semibold text-gray-700">Aula</th>
                      <th className="py-2 pr-4 font-semibold text-gray-700">Status</th>
                      <th className="py-2 font-semibold text-gray-700">Ação</th>
                    </tr>
                  </thead>
                  <tbody>
                    {listData.map((item) => {
                      const row = item as ListItemTeacherAbsenceReport
                      const aulaData = row.lessonStartAt
                        ? formatDateTime(row.lessonStartAt)
                        : '—'
                      const isUpdating = updatingAbsenceReportId === row.id
                      return (
                        <tr key={row.id} className="border-b border-gray-100 align-top">
                          <td className="py-2 pr-4">
                            <p className="font-medium text-gray-900">{row.message ?? row.nome}</p>
                            <p className="text-xs text-gray-500 mt-0.5">
                              {row.reportTypeLabel ?? '—'} · Professor: {row.teacherName ?? '—'}
                            </p>
                          </td>
                          <td className="py-2 pr-4 text-sm text-gray-600">{aulaData}</td>
                          <td className="py-2 pr-4 text-sm">
                            {row.status === 'VERIFYING' ? (
                              <span className="text-amber-700">
                                Verificando
                                {row.verifyingByName ? ` — ${row.verifyingByName}` : ''}
                              </span>
                            ) : (
                              <span className="text-gray-600">Aguardando</span>
                            )}
                          </td>
                          <td className="py-2">
                            <div className="flex flex-wrap gap-2">
                              {row.status !== 'VERIFYING' && row.status !== 'RESOLVED' ? (
                                <button
                                  type="button"
                                  disabled={isUpdating}
                                  onClick={() => updateTeacherAbsenceReport(row.id, 'VERIFYING')}
                                  className="px-3 py-1.5 text-sm rounded-lg border border-amber-300 text-amber-800 hover:bg-amber-50 disabled:opacity-50"
                                >
                                  Verificando
                                </button>
                              ) : null}
                              {row.entitlesReplacement && row.status !== 'RESOLVED' ? (
                                <button
                                  type="button"
                                  disabled={isUpdating}
                                  onClick={() =>
                                    updateTeacherAbsenceReport(
                                      row.id,
                                      'CONFIRM_ABSENCE',
                                      row.lessonId
                                    )
                                  }
                                  className="px-3 py-1.5 text-sm rounded-lg border border-sky-300 text-sky-800 hover:bg-sky-50 disabled:opacity-50"
                                >
                                  Confirmar ausência e reagendar
                                </button>
                              ) : null}
                              {!row.entitlesReplacement && row.status !== 'RESOLVED' ? (
                                <button
                                  type="button"
                                  disabled={isUpdating}
                                  onClick={() => updateTeacherAbsenceReport(row.id, 'RESOLVED')}
                                  className="px-3 py-1.5 text-sm rounded-lg border border-emerald-300 text-emerald-800 hover:bg-emerald-50 disabled:opacity-50"
                                >
                                  Resolvido
                                </button>
                              ) : null}
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </TableScrollArea>
            </div>
          ) : modalType === 'totalUsers' ? (
            <ul className="space-y-1 max-h-96 overflow-y-auto">
              {listData.map((item) => {
                const row = item as ListItemTotalUser
                const roleLabel =
                  row.role === 'STUDENT'
                    ? 'Aluno'
                    : row.role === 'ADMIN'
                      ? 'Admin'
                      : row.role ?? '—'
                return (
                  <li key={row.id} className="flex justify-between gap-4 py-1">
                    <span>{row.nome}</span>
                    <span className="text-gray-500 text-sm">{roleLabel}</span>
                  </li>
                )
              })}
            </ul>
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

        {/* Modal Designar aula (novos matriculados ou alunos para redirecionar) */}
        <DesignarAulaModal
          isOpen={!!designarAulaEnrollment}
          onClose={() => {
            setDesignarAulaEnrollment(null)
            setDesignarAulaFromModalType(null)
          }}
          enrollment={designarAulaEnrollment}
          onSuccess={() => {
            if (designarAulaFromModalType) {
              openListModal(designarAulaFromModalType)
            } else {
              openListModal('novosMatriculados')
            }
            setDesignarAulaFromModalType(null)
            fetchMetrics()
            fetchAdminActivities()
          }}
        />
      </div>
    </AdminLayout>
  )
}
