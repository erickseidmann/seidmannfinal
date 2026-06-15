/**
 * Página Admin: Calendário
 *
 * Aulas com aluno, professor e status (confirmada, cancelada, reposição).
 * Cubos: total confirmadas, canceladas, reposições, alunos com frequência incorreta (segunda a sábado).
 */

'use client'

import { useState, useMemo, useEffect, useCallback, useRef } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import AdminLayout from '@/components/admin/AdminLayout'
import TableScrollArea from '@/components/admin/TableScrollArea'
import StatCard from '@/components/admin/StatCard'
import Modal from '@/components/admin/Modal'
import ConfirmModal from '@/components/admin/ConfirmModal'
import { useConfirmDialog } from '@/hooks/useConfirmDialog'
import { useLateCancellationDialog } from '@/hooks/useLateCancellationDialog'
import {
  getLessonCancelamentoAntecedenciaHoras,
  isLessonCancelamentoTardioForEnrollments,
} from '@/lib/lesson-no-show-record'
import Button from '@/components/ui/Button'
import Toast from '@/components/admin/Toast'
import DesignarAulaModal from '@/components/admin/DesignarAulaModal'
import { ChevronLeft, ChevronRight, ChevronDown, CheckCircle, XCircle, RotateCcw, AlertTriangle, Trash2, Loader2, CalendarOff, Users, Check, UserPlus, X, ArrowRightLeft } from 'lucide-react'
import { formatTimeInTZ, getDayOfWeekInTZ, getTimeInTZ, toDateKeyInTZ, isSameDayInTZ } from '@/lib/datetime'
import { DEFAULT_LESSON_REPEAT_WEEKS } from '@/lib/lesson-series'
import {
  isLessonOnPastCalendarDay,
  LESSON_PAST_EDIT_DENIED_MESSAGE,
  LESSON_PAST_EDIT_NEEDS_APPROVAL_MESSAGE,
} from '@/lib/lesson-past-edit'
import {
  buildRescheduleLinks,
  extractCancelledAtFromNotes,
  formatOriginalLessonBadgeDate,
  formatRescheduledBadgeDate,
} from '@/lib/lesson-reschedule'
import {
  formatInactiveDateLabel,
  isLessonInInactivationWarningWindow,
} from '@/lib/enrollment-inactivation-warning'
import SeidmannLoading from '@/components/ui/SeidmannLoading'
import {
  type LessonStatusUi,
  LESSON_STATUS_LABELS,
  isLessonCancelledFamily,
  isLessonScheduledStatus,
  lessonCancelledStatusAllowsReposicao,
} from '@/lib/lesson-status'

type ViewType = 'month' | 'week' | 'day'

interface Lesson {
  id: string
  enrollmentId: string
  teacherId: string
  status: LessonStatusUi
  startAt: string
  durationMinutes: number
  notes: string | null
  createdByName: string | null
  enrollment: {
    id: string
    nome: string
    frequenciaSemanal: number | null
    curso?: string | null
    status?: string
    pausedAt?: string | null
    activationDate?: string | null
    inactiveAt?: string | null
  }
  teacher: { id: string; nome: string }
  requests?: Array<{ id: string; type: string; status: string }>
}

interface Stats {
  confirmed: number
  cancelled: number
  reposicao: number
  wrongFrequencyCount: number
  confirmedList: { id: string; studentName: string; teacherName: string; startAt: string }[]
  cancelledList: {
    id: string
    studentName: string
    teacherName: string
    startAt: string
    rescheduledLessonId?: string | null
    rescheduledAt?: string | null
    rescheduledTeacherName?: string | null
    allowsReschedule?: boolean
  }[]
  reposicaoList: { id: string; studentName: string; teacherName: string; startAt: string }[]
  wrongFrequencyList: {
    enrollmentId: string
    studentName: string
    expected: number
    actual: number
    expectedMinutes?: number
    actualMinutes?: number
    isOverlap?: boolean
    lessonsThisWeek?: { id: string; startAt: string; durationMinutes: number; teacherName: string }[]
    lessonTimesThisWeek?: string[]
  }[]
  teacherErrorsCount: number
  doubleBookingList: { teacherId: string; teacherName: string; lessons: { studentName: string; startAt: string }[] }[]
  inactiveTeacherList: { teacherId: string; teacherName: string; lessons: { studentName: string; startAt: string }[] }[]
}

const DIAS_SEMANA = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']
const MESES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
]

const IDIOMA_SHORT: Record<string, string> = {
  INGLES: 'EN',
  ESPANHOL: 'ES',
  PORTUGUES: 'PT',
  ITALIANO: 'IT',
  FRANCES: 'FR',
}

function getCursoLabel(curso: string | null | undefined): string {
  if (!curso) return ''
  if (curso === 'INGLES') return 'EN'
  if (curso === 'ESPANHOL') return 'ES'
  if (curso === 'INGLES_E_ESPANHOL') return 'EN/ES'
  return curso
}

function getTeacherLanguageLabel(idiomasFala: string[], idiomasEnsina: string[]): string {
  const ensina = idiomasEnsina.map((x) => IDIOMA_SHORT[x] || x).join(', ')
  const fala = idiomasFala.map((x) => IDIOMA_SHORT[x] || x).join(', ')
  const parts: string[] = []
  if (ensina) parts.push(`ensina: ${ensina}`)
  if (fala) parts.push(`fala: ${fala}`)
  return parts.length ? ` — ${parts.join('; ')}` : ''
}

function getStartOfWeek(d: Date): Date {
  const date = new Date(d)
  const day = date.getDay()
  date.setDate(date.getDate() - day)
  date.setHours(0, 0, 0, 0)
  return date
}

/**
 * Extrai informações sobre a última atualização da aula baseado nas observações
 * Retorna uma string formatada como "cancelada pelo aluno" ou "reposição agendada pelo aluno"
 */
function getLastUpdateInfo(notes: string | null, createdByName: string | null): string {
  if (!notes) {
    // Se não há observações, mostra quem agendou
    return createdByName || 'Admin'
  }

  // Procurar pela última linha que contém informações de cancelamento ou reagendamento
  const lines = notes.split('\n').filter(line => line.trim())
  const lastUpdateLine = [...lines].reverse().find(line => 
    line.includes('Aula foi cancelada') || 
    line.includes('Aula foi reagendada') ||
    line.includes('Aula reagendada pelo aluno') ||
    line.includes('cancelada pelo aluno') ||
    line.includes('cancelada pelo admin') ||
    line.includes('reagendada pelo aluno') ||
    line.includes('reagendada pelo admin')
  )

  if (lastUpdateLine) {
    // Extrair informações da linha
    // Exemplo: "Aula foi cancelada pelo aluno às 13/02/2026, 11:55"
    // Exemplo: "Aula reagendada pelo aluno no dia 13/02/2026, 12:07 e aprovado pelo professor no dia 13/02/2026, 12:08"
    
    // Verificar primeiro por reagendamento pelo aluno (formato completo ou simples)
    // Formato completo: "Aula reagendada pelo aluno no dia [data] e aprovado pelo [nome] no dia [data]"
    if (lastUpdateLine.includes('Aula reagendada pelo aluno') || lastUpdateLine.includes('reagendada pelo aluno')) {
      // Se contém "aprovado pelo", extrair o nome do aprovador
      if (lastUpdateLine.includes('aprovado pelo')) {
        const matchAprovador = lastUpdateLine.match(/aprovado pelo (.+?)(?:\s+no dia|$)/i)
        if (matchAprovador && matchAprovador[1]) {
          const aprovador = matchAprovador[1].trim()
          // Se o aprovador não é "admin" ou "professor" genérico, é um nome específico
          if (aprovador.toLowerCase() !== 'admin' && aprovador.toLowerCase() !== 'professor') {
            return `reposição agendada pelo aluno e aprovada por ${aprovador}`
          }
        }
      }
      return 'reposição agendada pelo aluno'
    }
    
    // Verificar cancelamentos
    if (lastUpdateLine.includes('cancelada pelo aluno')) {
      return 'cancelada pelo aluno'
    } else if (lastUpdateLine.includes('cancelada pelo')) {
      // Extrair o nome do admin/aluno que cancelou
      // Formato: "Aula foi cancelada pelo [nome] às [data]"
      const match = lastUpdateLine.match(/cancelada pelo (.+?)(?:\s+às|$)/i)
      if (match && match[1]) {
        const quemCancelou = match[1].trim()
        // Se for "admin" genérico, manter; senão usar o nome específico
        if (quemCancelou.toLowerCase() === 'admin') {
          return 'cancelada pelo admin'
        }
        return `cancelada por ${quemCancelou}`
      }
      return 'cancelada pelo admin'
    }
    
    // Verificar reagendamento pelo admin
    if (lastUpdateLine.includes('reagendada pelo')) {
      // Extrair o nome do admin que reagendou
      // Formato: "Aula foi reagendada pelo [nome] às [data]" ou "Aula reagendada pelo aluno no dia... e aprovado pelo [nome] no dia..."
      if (lastUpdateLine.includes('reagendada pelo aluno')) {
        return 'reposição agendada pelo aluno'
      }
      const match = lastUpdateLine.match(/reagendada pelo (.+?)(?:\s+às|\s+no dia|$)/i)
      if (match && match[1]) {
        const quemReagendou = match[1].trim()
        if (quemReagendou.toLowerCase() === 'admin') {
          return 'reagendada pelo admin'
        }
        return `reagendada por ${quemReagendou}`
      }
      return 'reagendada pelo admin'
    }
    
    // Removido: "cancelada pelo professor" e "reagendada pelo professor" - professores não podem cancelar/reagendar diretamente
  }

  // Se não encontrou atualização nas observações, mostra quem agendou
  return createdByName || 'Admin'
}

/** Segunda-feira 00:00 da semana que contém d */
function getMonday(d: Date): Date {
  const date = new Date(d)
  const day = date.getDay()
  const diff = day === 0 ? -6 : 1 - day
  date.setDate(date.getDate() + diff)
  date.setHours(0, 0, 0, 0)
  return date
}

function getStartOfMonth(d: Date): Date {
  const date = new Date(d.getFullYear(), d.getMonth(), 1)
  date.setHours(0, 0, 0, 0)
  return date
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d)
  r.setDate(r.getDate() + n)
  return r
}

function addMonths(d: Date, n: number): Date {
  const r = new Date(d)
  r.setMonth(r.getMonth() + n)
  return r
}

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  )
}

function isSameMonth(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth()
}

function isToday(d: Date): boolean {
  const t = new Date()
  return isSameDay(d, t)
}

function formatTime(iso: string): string {
  return formatTimeInTZ(iso)
}

/** Rótulo do aluno no calendário: grupo = "Nome do grupo — Nome1, Nome2", particular = nome do aluno */
function getLessonStudentLabel(
  l: Lesson,
  enrollmentsList: { id: string; nome: string; tipoAula: string | null; nomeGrupo: string | null }[]
): string {
  const enr = enrollmentsList.find((e) => e.id === l.enrollmentId)
  if (enr?.tipoAula === 'GRUPO' && enr?.nomeGrupo?.trim()) {
    const key = enr.nomeGrupo.trim()
    const members = enrollmentsList
      .filter((x) => x.tipoAula === 'GRUPO' && x.nomeGrupo?.trim() === key)
      .map((x) => x.nome)
    return `${key} — ${members.join(', ')}`
  }
  return l.enrollment?.nome ?? 'Sem aluno'
}

function toDatetimeLocal(d: Date): string {
  const y = d.getFullYear()
  const m = (d.getMonth() + 1).toString().padStart(2, '0')
  const day = d.getDate().toString().padStart(2, '0')
  const h = d.getHours().toString().padStart(2, '0')
  const min = d.getMinutes().toString().padStart(2, '0')
  return `${y}-${m}-${day}T${h}:${min}`
}

function toDateKey(d: Date): string {
  const y = d.getFullYear()
  const m = (d.getMonth() + 1).toString().padStart(2, '0')
  const day = d.getDate().toString().padStart(2, '0')
  return `${y}-${m}-${day}`
}

export default function AdminCalendarioPage() {
  console.log('render')
  const { confirm, ConfirmDialog } = useConfirmDialog()
  const { promptLateCancellation, LateCancellationDialog } = useLateCancellationDialog()
  const router = useRouter()
  const searchParams = useSearchParams()
  const searchParamsKey = searchParams?.toString() ?? ''
  const reagendarFromUrlHandled = useRef<string | null>(null)
  const [view, setView] = useState<ViewType>('month')
  const [currentDate, setCurrentDate] = useState(() => new Date())
  const [lessons, setLessons] = useState<Lesson[]>([])
  const [reposicaoLookupLessons, setReposicaoLookupLessons] = useState<
    Pick<Lesson, 'id' | 'enrollmentId' | 'status' | 'startAt' | 'notes'>[]
  >([])
  const [stats, setStats] = useState<Stats | null>(null)
  const [enrollments, setEnrollments] = useState<{
    id: string
    nome: string
    frequenciaSemanal: number | null
    tempoAulaMinutos: number | null
    tipoAula: string | null
    nomeGrupo: string | null
    curso: string | null
    escolaMatricula: string | null
    cancelamentoAntecedenciaHoras: number | null
  }[]>([])
  const [cancelamentoExcecao, setCancelamentoExcecao] = useState(false)
  const [teachers, setTeachers] = useState<{
    id: string
    nome: string
    status?: string
    nota?: number | null
    idiomasFala?: string[]
    idiomasEnsina?: string[]
  }[]>([])
  const [loading, setLoading] = useState(true)
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null)
  const [lessonModalOpen, setLessonModalOpen] = useState(false)
  const [editingLesson, setEditingLesson] = useState<Lesson | null>(null)
  const [lessonForm, setLessonForm] = useState({
    enrollmentId: '',
    teacherId: '',
    status: 'CONFIRMED' as LessonStatusUi,
    startAt: '',
    durationMinutes: 30,
    notes: '',
    createdByName: '',
    repeatEnabled: false,
    repeatWeeks: 4,
    repeatSameWeek: false,
    repeatSameWeekStartAt: '',
    repeatFrequencyEnabled: false,
    repeatFrequencyWeeks: 4,
  })
  const [agendarReposicao, setAgendarReposicao] = useState(false)
  const [reposicaoForm, setReposicaoForm] = useState({
    startAt: '',
    teacherId: '',
    durationMinutes: 30,
  })
  const [reposicaoTeacherAvailabilities, setReposicaoTeacherAvailabilities] = useState<Record<string, boolean> | null>(null)
  const [reposicaoTeacherConflicts, setReposicaoTeacherConflicts] = useState<Record<string, string>>({})
  const [reposicaoProfessorDropdownOpen, setReposicaoProfessorDropdownOpen] = useState(false)
  const [reposicaoProfessorSearch, setReposicaoProfessorSearch] = useState('')
  const [deleteLessonModalOpen, setDeleteLessonModalOpen] = useState(false)
  const [savingLesson, setSavingLesson] = useState(false)
  const [cancellingLessonId, setCancellingLessonId] = useState<string | null>(null)
  const [deletingLesson, setDeletingLesson] = useState(false)
  const [enrollmentIdsWithFullWeek, setEnrollmentIdsWithFullWeek] = useState<string[]>([])
  const [weeklyLessonsByEnrollment, setWeeklyLessonsByEnrollment] = useState<
    Record<
      string,
      {
        id: string
        startAt: string
        status: string
        teacherName: string
      }[]
    >
  >({})
  const [listModal, setListModal] = useState<{
    title: string
    type:
      | 'confirmed'
      | 'cancelled'
      | 'reposicao'
      | 'wrongFrequency'
      | 'teacherErrors'
      | 'novosMatriculados'
      | 'alunosParaRedirecionar'
  } | null>(null)
  const [novosMatriculadosCount, setNovosMatriculadosCount] = useState(0)
  const [novosMatriculadosList, setNovosMatriculadosList] = useState<{ id: string; nome: string; dataMatricula?: string; linkPagamentoEnviadoAt?: string | null }[]>([])
  const [novosMatriculadosListLoading, setNovosMatriculadosListLoading] = useState(false)
  const [alunosParaRedirecionarCount, setAlunosParaRedirecionarCount] = useState(0)
  const [alunosParaRedirecionarList, setAlunosParaRedirecionarList] = useState<Array<{
    id: string
    nome: string
    professorNome?: string | null
    frequenciaSemanal?: number | null
    tempoAulaMinutos?: number | null
  }>>([])
  const [alunosParaRedirecionarListLoading, setAlunosParaRedirecionarListLoading] = useState(false)
  const [marcandoAulasId, setMarcandoAulasId] = useState<string | null>(null)
  const [marcandoLinkPagId, setMarcandoLinkPagId] = useState<string | null>(null)
  const [marcandoRedirectId, setMarcandoRedirectId] = useState<string | null>(null)
  const [reagendarCanceladaLoadingId, setReagendarCanceladaLoadingId] = useState<string | null>(null)
  const [holidays, setHolidays] = useState<Set<string>>(new Set())
  const [pendingHolidays, setPendingHolidays] = useState<Set<string>>(new Set())
  const [pendingHolidaysApprovedByMe, setPendingHolidaysApprovedByMe] = useState<Set<string>>(new Set())
  const [holidayLoading, setHolidayLoading] = useState<string | null>(null)
  const [selectedTeacherId, setSelectedTeacherId] = useState<string | null>(null)
  const [isSuperAdmin, setIsSuperAdmin] = useState(false)
  const [canDirectEditPastLessons, setCanDirectEditPastLessons] = useState(false)
  const [canApprovePastLessonEdits, setCanApprovePastLessonEdits] = useState(false)
  const [pendingPastEditLessonIds, setPendingPastEditLessonIds] = useState<Set<string>>(new Set())
  const [pendingPastEditRequests, setPendingPastEditRequests] = useState<
    Array<{
      id: string
      lessonId: string
      studentName: string
      teacherName: string
      lessonStartAt: string
      requestedByName: string
      payload: Record<string, unknown>
    }>
  >([])
  const [pendingPastEditBannerOpen, setPendingPastEditBannerOpen] = useState(false)
  const [pastEditApprovalRequest, setPastEditApprovalRequest] = useState<{
    id: string
    lessonId: string
    studentName: string
    teacherName: string
    lessonStartAt: string
    requestedByName: string
    payload: Record<string, unknown>
  } | null>(null)
  const [pastEditActionLoading, setPastEditActionLoading] = useState(false)
  const [teacherFilterOpen, setTeacherFilterOpen] = useState(false)
  const [teacherFilterSearch, setTeacherFilterSearch] = useState('')
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null)
  const [studentFilterOpen, setStudentFilterOpen] = useState(false)
  const [studentFilterSearch, setStudentFilterSearch] = useState('')
  const [teacherAvailabilities, setTeacherAvailabilities] = useState<Record<string, boolean> | null>(null)
  const [teacherConflicts, setTeacherConflicts] = useState<Record<string, string>>({})
  const [selectedTeacherSlots, setSelectedTeacherSlots] = useState<Array<{ dayOfWeek: number; startMinutes: number; endMinutes: number }>>([])
  const [idiomaErrorModalOpen, setIdiomaErrorModalOpen] = useState(false)
  const [lessonProfessorDropdownOpen, setLessonProfessorDropdownOpen] = useState(false)
  const [lessonAlunoDropdownOpen, setLessonAlunoDropdownOpen] = useState(false)
  const [lessonAlunoSearch, setLessonAlunoSearch] = useState('')
  const [lessonProfessorSearch, setLessonProfessorSearch] = useState('')
  const [lessonStatusDropdownOpen, setLessonStatusDropdownOpen] = useState(false)
  const [lessonStatusSearch, setLessonStatusSearch] = useState('')
  const [studentRescheduledLessons, setStudentRescheduledLessons] = useState<Lesson[]>([])
  const [viewedRescheduledLessons, setViewedRescheduledLessons] = useState<Set<string>>(new Set())
  const [showDurationConfirm, setShowDurationConfirm] = useState(false)
  const [durationConfirmCadastroMin, setDurationConfirmCadastroMin] = useState<number>(30)
  const durationConfirmDidKeepRef = useRef(false)
  const [pendingTransferRequests, setPendingTransferRequests] = useState<Array<{
    id: string
    lessonId: string
    enrollmentId: string
    teacherId: string
    type: string
    status: string
    requestedStartAt: string | null
    requestedTeacherId: string | null
    notes: string | null
    lesson: {
      id: string
      startAt: string
      durationMinutes: number
      status: string
      enrollment: {
        id: string
        nome: string
        curso: string | null
      }
      teacher: {
        id: string
        nome: string
      }
    }
    teacher: {
      id: string
      nome: string
    }
    requestedTeacher: {
      id: string
      nome: string
    } | null
  }>>([])
  const [rescheduledLessonsModalOpen, setRescheduledLessonsModalOpen] = useState(false)
  const [transferRequestsModalOpen, setTransferRequestsModalOpen] = useState(false)
  const [excluindoAulaId, setExcluindoAulaId] = useState<string | null>(null)
  const [designarAulaEnrollment, setDesignarAulaEnrollment] = useState<{
    id: string
    nome: string
    frequenciaSemanal?: number | null
    tempoAulaMinutos?: number | null
  } | null>(null)

  const handleAlunoParaRedirecionarJaFeito = (id: string) => {
    setAlunosParaRedirecionarList((prev) => prev.filter((item) => item.id !== id))
    setAlunosParaRedirecionarCount((prev) => (prev > 0 ? prev - 1 : 0))
  }
  const marcarAlunoParaRedirecionarJaFeito = async (id: string) => {
    setMarcandoRedirectId(id)
    try {
      const res = await fetch('/api/admin/redirect-handled', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ enrollmentId: id }),
      })
      const text = await res.text()
      let json: { ok?: boolean; message?: string }
      try {
        json = text ? JSON.parse(text) : {}
      } catch {
        json = {}
      }
      if (!res.ok || !json.ok) {
        setToast({ message: json.message || 'Erro ao marcar como já feito.', type: 'error' })
        return
      }
      handleAlunoParaRedirecionarJaFeito(id)
    } catch {
      setToast({ message: 'Erro ao marcar como já feito.', type: 'error' })
    } finally {
      setMarcandoRedirectId(null)
    }
  }
  const [designarAulaCorrectionData, setDesignarAulaCorrectionData] = useState<{
    existingLessonTimes: string[]
    existingLessons?: { startAt: string; teacherName?: string }[]
    expected: number
    actual: number
  } | null>(null)

  const weekStartForStats = useMemo(() => getMonday(currentDate), [currentDate])

  const { rescheduledAtByCancelledId: rescheduledAtByCancelledLessonId, originalAtByReposicaoId } =
    useMemo(
      () => buildRescheduleLinks([...lessons, ...reposicaoLookupLessons]),
      [lessons, reposicaoLookupLessons]
    )

  const canDirectEditLesson = useCallback(
    (lesson: { startAt: string }) => {
      if (!isLessonOnPastCalendarDay(lesson.startAt)) return true
      return canDirectEditPastLessons
    },
    [canDirectEditPastLessons]
  )

  const needsPastEditRequest = useCallback(
    (lesson: { startAt: string }) =>
      isLessonOnPastCalendarDay(lesson.startAt) && !canDirectEditPastLessons,
    [canDirectEditPastLessons]
  )

  const fetchPendingPastEditLessons = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/lesson-past-edit-requests?status=PENDING', {
        credentials: 'include',
      })
      const json = await res.json()
      if (json.ok && Array.isArray(json.data?.requests)) {
        const requests = json.data.requests as Array<{
          id: string
          lessonId: string
          studentName: string
          teacherName: string
          lessonStartAt: string
          requestedByName: string
          payload: Record<string, unknown>
        }>
        setPendingPastEditRequests(requests)
        setPendingPastEditLessonIds(new Set(requests.map((r) => r.lessonId)))
        if (requests.length === 0) setPendingPastEditBannerOpen(false)
      }
    } catch {
      /* ignore */
    }
  }, [])

  const openPastEditApproval = useCallback(
    async (lessonId: string) => {
      setPastEditActionLoading(true)
      try {
        const res = await fetch('/api/admin/lesson-past-edit-requests?status=PENDING', {
          credentials: 'include',
        })
        const json = await res.json()
        if (!json.ok || !Array.isArray(json.data?.requests)) {
          setToast({ message: 'Não foi possível carregar a solicitação', type: 'error' })
          return
        }
        const req = json.data.requests.find((r: { lessonId: string }) => r.lessonId === lessonId)
        if (!req) {
          setToast({ message: 'Solicitação não encontrada ou já processada', type: 'error' })
          await fetchPendingPastEditLessons()
          return
        }
        setPastEditApprovalRequest(req)
      } catch {
        setToast({ message: 'Erro ao carregar solicitação', type: 'error' })
      } finally {
        setPastEditActionLoading(false)
      }
    },
    [fetchPendingPastEditLessons]
  )

  // Aplicar filtro de aluno vindo da URL (?aluno=ID) sempre que mudar
  useEffect(() => {
    const aluno = searchParams?.get('aluno')
    const teacher = searchParams?.get('teacher')
    const data = searchParams?.get('data')
    if (aluno && aluno.trim() && selectedStudentId !== aluno.trim()) {
      setSelectedStudentId(aluno.trim())
    }
    if (teacher && teacher.trim() && selectedTeacherId !== teacher.trim()) {
      setSelectedTeacherId(teacher.trim())
    }
    if (data && data.trim()) {
      const d = new Date(data)
      if (
        !Number.isNaN(d.getTime()) &&
        (
          currentDate.getFullYear() !== d.getFullYear() ||
          currentDate.getMonth() !== d.getMonth() ||
          currentDate.getDate() !== d.getDate()
        )
      ) {
        setCurrentDate(d)
      }
    }
  }, [searchParamsKey, selectedStudentId, selectedTeacherId, currentDate])

  const activeTeachers = useMemo(
    () => teachers.filter((t) => t.status === 'ACTIVE'),
    [teachers]
  )
  const filteredTeachers = useMemo(() => {
    if (!teacherFilterSearch.trim()) return activeTeachers
    const search = teacherFilterSearch.toLowerCase().trim()
    return activeTeachers.filter((t) => t.nome.toLowerCase().includes(search))
  }, [activeTeachers, teacherFilterSearch])
  const selectedTeacher = selectedTeacherId
    ? activeTeachers.find((t) => t.id === selectedTeacherId)
    : null

  const filteredStudents = useMemo(() => {
    if (!studentFilterSearch.trim()) return enrollments
    const search = studentFilterSearch.toLowerCase().trim()
    return enrollments.filter(
      (e) =>
        e.nome.toLowerCase().includes(search) ||
        (e.nomeGrupo && e.nomeGrupo.toLowerCase().includes(search))
    )
  }, [enrollments, studentFilterSearch])

  const selectedStudent = selectedStudentId
    ? enrollments.find((e) => e.id === selectedStudentId)
    : null

  // Opções para o select de aluno: grupos ou aluno individual.
  // Alunos com frequência correta na semana aparecem desabilitados, com resumo das aulas já agendadas.
  const studentOptions = useMemo(() => {
    const fullSet = new Set(enrollmentIdsWithFullWeek)
    const list: { value: string; label: string; disabled?: boolean }[] = []
    const groupKeys = new Set<string>()
    // Se estiver editando uma aula, garantir que o aluno dessa aula sempre apareça nas opções
    const editingEnrollmentId = editingLesson?.enrollmentId
    
    for (const e of enrollments) {
      const hasFullWeek = fullSet.has(e.id)
      const isEditingThisEnrollment = e.id === editingEnrollmentId
      
      if (e.tipoAula === 'GRUPO' && e.nomeGrupo?.trim()) {
        const key = e.nomeGrupo.trim()
        if (groupKeys.has(key)) continue
        groupKeys.add(key)
        const members = enrollments
          .filter((x) => x.tipoAula === 'GRUPO' && x.nomeGrupo?.trim() === key)
          .map((x) => x.nome)
        const freq = enrollments.find(
          (x) => x.tipoAula === 'GRUPO' && x.nomeGrupo?.trim() === key
        )?.frequenciaSemanal
        const freqLabel = freq != null ? ` (${freq}x/sem)` : ''
        const anyEnrollmentId = enrollments.find(
          (x) => x.tipoAula === 'GRUPO' && x.nomeGrupo?.trim() === key
        )!.id

        const hasFullForGroup = fullSet.has(anyEnrollmentId)
        const lessonsForGroup =
          weeklyLessonsByEnrollment[anyEnrollmentId] ?? []
        const resumo =
          lessonsForGroup.length > 0
            ? ` — já está com ${lessonsForGroup
                .map((l) => {
                  const d = new Date(l.startAt)
                  const dia = d.toLocaleDateString('pt-BR', {
                    weekday: 'short',
                    day: '2-digit',
                    month: '2-digit',
                  })
                  const hora = d.toLocaleTimeString('pt-BR', {
                    timeZone: 'America/Sao_Paulo',
                    hour: '2-digit',
                    minute: '2-digit',
                  })
                  const sl =
                    LESSON_STATUS_LABELS[l.status as LessonStatusUi] ?? l.status
                  return `${dia} ${hora} – ${l.teacherName} (${sl})`
                })
                .join(' | ')}`
            : ''
        list.push({
          value: anyEnrollmentId,
          label: `${key} — ${members.join(', ')}${freqLabel}${resumo}`,
          disabled: hasFullForGroup && !isEditingThisEnrollment,
        })
      } else {
        const freqLabel =
          e.frequenciaSemanal != null ? ` (${e.frequenciaSemanal}x/sem)` : ''
        const lessonsForEnrollment = weeklyLessonsByEnrollment[e.id] ?? []
        const resumo =
          lessonsForEnrollment.length > 0
            ? ` — já está com ${lessonsForEnrollment
                .map((l) => {
                  const d = new Date(l.startAt)
                  const dia = d.toLocaleDateString('pt-BR', {
                    weekday: 'short',
                    day: '2-digit',
                    month: '2-digit',
                  })
                  const hora = d.toLocaleTimeString('pt-BR', {
                    timeZone: 'America/Sao_Paulo',
                    hour: '2-digit',
                    minute: '2-digit',
                  })
                  const sl =
                    LESSON_STATUS_LABELS[l.status as LessonStatusUi] ?? l.status
                  return `${dia} ${hora} – ${l.teacherName} (${sl})`
                })
                .join(' | ')}`
            : ''
        list.push({
          value: e.id,
          label: `${e.nome}${freqLabel}${resumo}`,
          disabled: hasFullWeek && !isEditingThisEnrollment,
        })
      }
    }
    return list
  }, [enrollments, enrollmentIdsWithFullWeek, weeklyLessonsByEnrollment, editingLesson])

  const fetchLessons = useCallback(async () => {
    let start: Date
    let end: Date
    if (view === 'month') {
      start = getStartOfMonth(currentDate)
      const nextMonth = addMonths(currentDate, 1)
      end = addDays(nextMonth, -1)
      end.setHours(23, 59, 59, 999)
    } else if (view === 'week') {
      start = getStartOfWeek(currentDate)
      end = addDays(start, 6)
      end.setHours(23, 59, 59, 999)
    } else {
      start = new Date(currentDate)
      start.setHours(0, 0, 0, 0)
      end = new Date(currentDate)
      end.setHours(23, 59, 59, 999)
    }
    try {
      const params = new URLSearchParams({
        start: start.toISOString(),
        end: end.toISOString(),
      })
      if (selectedTeacherId) params.set('teacherId', selectedTeacherId)
      const res = await fetch(`/api/admin/lessons?${params}`, { credentials: 'include' })
      if (res.status === 401 || res.status === 403) {
        router.push('/login?tab=admin')
        return
      }
      const json = await res.json()
      if (json.ok) {
        const lessonsData = json.data.lessons || []
        if (lessonsData.length > 0) {
          console.log('Primeira aula:', lessonsData[0])
          console.log('createdByName na primeira aula:', lessonsData[0]?.createdByName)
        }
        setLessons(lessonsData)

        const lookupEnd = new Date(end)
        lookupEnd.setDate(lookupEnd.getDate() + 62)
        const lookupParams = new URLSearchParams({
          start: start.toISOString(),
          end: lookupEnd.toISOString(),
        })
        if (selectedTeacherId) lookupParams.set('teacherId', selectedTeacherId)
        const lookupRes = await fetch(`/api/admin/lessons?${lookupParams}`, { credentials: 'include' })
        if (lookupRes.ok) {
          const lookupJson = await lookupRes.json()
          const lookupAll = lookupJson.ok ? lookupJson.data?.lessons || [] : []
          const visibleIds = new Set(lessonsData.map((l: Lesson) => l.id))
          setReposicaoLookupLessons(
            lookupAll.filter(
              (l: Lesson) =>
                !visibleIds.has(l.id) &&
                (l.status === 'REPOSICAO' || isLessonCancelledFamily(l.status))
            )
          )
        } else {
          setReposicaoLookupLessons([])
        }
      }
    } catch (e) {
      console.error(e)
      setToast({ message: 'Erro ao carregar aulas', type: 'error' })
    }
  }, [view, currentDate, selectedTeacherId, router])

  const fetchStats = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/admin/lessons/stats?weekStart=${weekStartForStats.toISOString()}`,
        { credentials: 'include' }
      )
      if (!res.ok) return
      const json = await res.json()
      if (json.ok && json.data) setStats(json.data)
    } catch (e) {
      console.error(e)
    }
  }, [weekStartForStats])

  const processPastEditApproval = useCallback(
    async (
      action: 'APPROVE' | 'REJECT',
      request?: {
        id: string
        lessonId: string
        studentName: string
        teacherName: string
        lessonStartAt: string
        requestedByName: string
        payload: Record<string, unknown>
      }
    ) => {
      const target = request ?? pastEditApprovalRequest
      if (!target) return
      setPastEditActionLoading(true)
      try {
        const res = await fetch(`/api/admin/lesson-past-edit-requests/${target.id}`, {
          method: 'PATCH',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action }),
        })
        const json = await res.json()
        if (!res.ok || !json.ok) {
          setToast({ message: json.message || 'Erro ao processar solicitação', type: 'error' })
          return
        }
        setPastEditApprovalRequest(null)
        setToast({
          message:
            action === 'APPROVE'
              ? 'Alteração aprovada e aplicada à aula'
              : 'Solicitação rejeitada',
          type: 'success',
        })
        await fetchPendingPastEditLessons()
        fetchLessons()
        fetchStats()
      } catch {
        setToast({ message: 'Erro ao processar solicitação', type: 'error' })
      } finally {
        setPastEditActionLoading(false)
      }
    },
    [pastEditApprovalRequest, fetchPendingPastEditLessons, fetchLessons, fetchStats]
  )

  const excluirAulaWrongFrequency = useCallback(
    async (lesson: { id: string; startAt: string }) => {
      if (!canDirectEditLesson(lesson)) {
        setToast({ message: LESSON_PAST_EDIT_DENIED_MESSAGE, type: 'error' })
        return
      }
      setExcluindoAulaId(lesson.id)
      try {
        const res = await fetch(`/api/admin/lessons/${lesson.id}`, {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ deleteFuture: false }),
        })
        const json = await res.json()
        if (json.ok) {
          await fetchStats()
          setToast({ message: 'Aula excluída.', type: 'success' })
        } else {
          setToast({ message: json.message || 'Erro ao excluir aula', type: 'error' })
        }
      } catch (e) {
        setToast({ message: 'Erro ao excluir aula', type: 'error' })
      } finally {
        setExcluindoAulaId(null)
      }
    },
    [fetchStats, canDirectEditLesson]
  )

  const fetchNovosMatriculadosCount = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/metrics', { credentials: 'include' })
      if (!res.ok) return
      const json = await res.json()
      if (json.ok && json.data && json.data.novosMatriculadosCount != null) {
        setNovosMatriculadosCount(json.data.novosMatriculadosCount)
      }
    } catch (e) {
      console.error(e)
    }
  }, [])

  const marcarAulasAdicionadas = useCallback(async (enrollmentId: string) => {
    setMarcandoAulasId(enrollmentId)
    try {
      const res = await fetch(`/api/admin/enrollments/${enrollmentId}/marcar-aulas-adicionadas`, {
        method: 'PATCH',
        credentials: 'include',
      })
      const json = await res.json()
      if (json.ok) {
        setNovosMatriculadosList((prev) => prev.filter((item) => item.id !== enrollmentId))
        fetchNovosMatriculadosCount()
      }
    } catch (e) {
      console.error(e)
    } finally {
      setMarcandoAulasId(null)
    }
  }, [fetchNovosMatriculadosCount])

  const marcarLinkPagEnviado = useCallback(async (enrollmentId: string) => {
    setMarcandoLinkPagId(enrollmentId)
    try {
      const res = await fetch(`/api/admin/enrollments/${enrollmentId}/marcar-link-pagamento-enviado`, {
        method: 'PATCH',
        credentials: 'include',
      })
      const json = await res.json()
      if (json.ok) {
        setNovosMatriculadosList((prev) =>
          prev.map((item) =>
            item.id === enrollmentId ? { ...item, linkPagamentoEnviadoAt: new Date().toISOString() } : item
          )
        )
      }
    } catch (e) {
      console.error(e)
    } finally {
      setMarcandoLinkPagId(null)
    }
  }, [])

  const fetchEnrollmentsAndTeachers = useCallback(async () => {
    try {
      const [enrRes, teaRes] = await Promise.all([
        fetch('/api/admin/enrollments?schedulingEligible=1', { credentials: 'include' }),
        fetch('/api/admin/teachers?status=ACTIVE', { credentials: 'include' }),
      ])
      if (enrRes.ok) {
        const j = await enrRes.json()
        setEnrollments((j.data?.enrollments || []).map((e: {
          id: string
          nome: string
          frequenciaSemanal?: number | null
          tempoAulaMinutos?: number | null
          tipoAula?: string | null
          nomeGrupo?: string | null
          curso?: string | null
          escolaMatricula?: string | null
          cancelamentoAntecedenciaHoras?: number | null
        }) => ({
          id: e.id,
          nome: e.nome,
          frequenciaSemanal: e.frequenciaSemanal ?? null,
          tempoAulaMinutos: e.tempoAulaMinutos ?? null,
          tipoAula: e.tipoAula ?? null,
          nomeGrupo: e.nomeGrupo ?? null,
          curso: e.curso ?? null,
          escolaMatricula: e.escolaMatricula ?? null,
          cancelamentoAntecedenciaHoras: e.cancelamentoAntecedenciaHoras ?? null,
        })))
      }
      if (teaRes.ok) {
        const j = await teaRes.json()
        setTeachers((j.data?.teachers || []).map((t: {
          id: string
          nome: string
          status?: string
          nota?: number | null
          idiomasFala?: string[] | unknown
          idiomasEnsina?: string[] | unknown
        }) => ({
          id: t.id,
          nome: t.nome,
          status: t.status ?? undefined,
          nota: t.nota ?? undefined,
          idiomasFala: Array.isArray(t.idiomasFala) ? t.idiomasFala : [],
          idiomasEnsina: Array.isArray(t.idiomasEnsina) ? t.idiomasEnsina : [],
        })))
      }
    } catch (e) {
      console.error(e)
    }
  }, [])

  useEffect(() => {
    if (!lessonModalOpen) {
      setEnrollmentIdsWithFullWeek([])
      setWeeklyLessonsByEnrollment({})
      return
    }
    const refDate = lessonForm.startAt ? new Date(lessonForm.startAt) : new Date()
    if (Number.isNaN(refDate.getTime())) return
    const weekStart = getMonday(refDate)
    const saturdayEnd = (() => {
      const d = new Date(weekStart)
      d.setDate(d.getDate() + 5)
      d.setHours(23, 59, 59, 999)
      return d
    })()

    Promise.all([
      fetch(
        `/api/admin/lessons/enrollments-with-full-week?weekStart=${weekStart.toISOString()}`,
        { credentials: 'include' }
      ).then((r) => r.json()),
      fetch(
        `/api/admin/lessons?start=${weekStart.toISOString()}&end=${saturdayEnd.toISOString()}`,
        { credentials: 'include' }
      ).then((r) => r.json()),
    ])
      .then(([fullWeekJson, lessonsJson]) => {
        if (fullWeekJson.ok && Array.isArray(fullWeekJson.data?.enrollmentIds)) {
          setEnrollmentIdsWithFullWeek(fullWeekJson.data.enrollmentIds)
        } else {
          setEnrollmentIdsWithFullWeek([])
        }

        if (lessonsJson.ok && Array.isArray(lessonsJson.data?.lessons)) {
          const map: Record<
            string,
            {
              id: string
              startAt: string
              status: string
              teacherName: string
            }[]
          > = {}
          for (const l of lessonsJson.data.lessons as any[]) {
            const eid = l.enrollmentId as string
            if (!eid) continue
            if (!map[eid]) map[eid] = []
            map[eid].push({
              id: String(l.id),
              startAt: String(l.startAt),
              status: String(l.status),
              teacherName:
                (l.teacher && typeof l.teacher.nome === 'string'
                  ? l.teacher.nome
                  : 'N/A') ?? 'N/A',
            })
          }
          setWeeklyLessonsByEnrollment(map)
        } else {
          setWeeklyLessonsByEnrollment({})
        }
      })
      .catch(() => {
        setEnrollmentIdsWithFullWeek([])
        setWeeklyLessonsByEnrollment({})
      })
  }, [lessonModalOpen, lessonForm.startAt])

  const getHolidaysRange = useCallback(() => {
    let start: Date
    let end: Date
    if (view === 'month') {
      start = getStartOfMonth(currentDate)
      const nextMonth = addMonths(currentDate, 1)
      end = addDays(nextMonth, -1)
    } else if (view === 'week') {
      start = getStartOfWeek(currentDate)
      end = addDays(start, 6)
    } else {
      start = new Date(currentDate)
      start.setHours(0, 0, 0, 0)
      end = new Date(currentDate)
      end.setHours(23, 59, 59, 999)
    }
    return { start: toDateKey(start), end: toDateKey(end) }
  }, [view, currentDate])

  const fetchHolidays = useCallback(async () => {
    const { start, end } = getHolidaysRange()
    try {
      const res = await fetch(`/api/admin/holidays?start=${start}&end=${end}`, { credentials: 'include' })
      if (res.status === 401 || res.status === 403) return
      const json = await res.json()
      if (json.ok && Array.isArray(json.data?.holidays)) {
        setHolidays(new Set(json.data.holidays))
        setPendingHolidays(new Set(Array.isArray(json.data?.pendingHolidays) ? json.data.pendingHolidays : []))
        setPendingHolidaysApprovedByMe(new Set(Array.isArray(json.data?.pendingHolidaysApprovedByMe) ? json.data.pendingHolidaysApprovedByMe : []))
      }
    } catch (e) {
      console.error(e)
    }
  }, [getHolidaysRange])

  const toggleHoliday = useCallback(async (date: Date, action: 'approve' | 'deny' | 'cancel' = 'approve') => {
    const key = toDateKey(date)
    setHolidayLoading(key)
    try {
      const isHoliday = holidays.has(key)
      if (isHoliday) {
        const res = await fetch(`/api/admin/holidays?date=${key}`, {
          method: 'DELETE',
          credentials: 'include',
        })
        const json = await res.json()
        if (!res.ok || !json.ok) {
          setToast({ message: json.message || 'Erro ao remover feriado', type: 'error' })
          return
        }
        setToast({ message: json.message || 'Feriado removido', type: 'success' })
      } else {
        const res = await fetch('/api/admin/holidays', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ date: key, action }),
        })
        const json = await res.json()
        if (!res.ok || !json.ok) {
          setToast({ message: json.message || 'Erro ao definir feriado', type: 'error' })
          return
        }
        setToast({ message: json.message || 'Feriado definido', type: 'success' })
      }
      await fetchHolidays()
    } catch (e) {
      setToast({ message: 'Erro ao alterar feriado', type: 'error' })
    } finally {
      setHolidayLoading(null)
    }
  }, [holidays, fetchHolidays])

  // Buscar slots de disponibilidade do professor selecionado
  useEffect(() => {
    if (!selectedTeacherId) {
      setSelectedTeacherSlots([])
      return
    }
    const fetchTeacherSlots = async () => {
      try {
        const res = await fetch(`/api/admin/teachers/${selectedTeacherId}/availability`, {
          credentials: 'include',
        })
        if (res.ok) {
          const json = await res.json()
          if (json.ok && json.data?.slots) {
            setSelectedTeacherSlots(json.data.slots)
          } else {
            setSelectedTeacherSlots([])
          }
        } else {
          setSelectedTeacherSlots([])
        }
      } catch (e) {
        console.error('Erro ao buscar slots de disponibilidade:', e)
        setSelectedTeacherSlots([])
      }
    }
    fetchTeacherSlots()
  }, [selectedTeacherId])

  // Carregar aulas vistas do localStorage
  useEffect(() => {
    fetch('/api/admin/me', { credentials: 'include' })
      .then((r) => r.json())
      .then((j) => {
        if (j.ok && j.data) {
          if (j.data.isSuperAdmin) setIsSuperAdmin(true)
          setCanDirectEditPastLessons(!!j.data.canDirectEditPastLessons)
          setCanApprovePastLessonEdits(!!j.data.canApprovePastLessonEdits)
        }
      })
      .catch(() => {})
    void fetchPendingPastEditLessons()
  }, [fetchPendingPastEditLessons])

  useEffect(() => {
    const stored = localStorage.getItem('viewedRescheduledLessons')
    if (stored) {
      try {
        const viewedIds = JSON.parse(stored)
        setViewedRescheduledLessons(new Set(viewedIds))
      } catch (e) {
        console.error('Erro ao carregar aulas vistas:', e)
      }
    }
  }, [])

  const fetchStudentRescheduledLessons = useCallback(async () => {
    try {
      // Buscar todas as aulas REPOSICAO (vamos buscar um período amplo)
      const hoje = new Date()
      const inicio = new Date(hoje)
      inicio.setMonth(inicio.getMonth() - 3) // Últimos 3 meses
      const fim = new Date(hoje)
      fim.setMonth(fim.getMonth() + 3) // Próximos 3 meses
      
      const params = new URLSearchParams({
        start: inicio.toISOString(),
        end: fim.toISOString(),
      })
      
      const res = await fetch(`/api/admin/lessons?${params}`, { credentials: 'include' })
      if (res.ok) {
        const json = await res.json()
        if (json.ok && json.data?.lessons) {
          // Filtrar apenas aulas REPOSICAO que foram reagendadas pelo aluno
          const rescheduledByStudent = json.data.lessons.filter((l: Lesson) => 
            l.status === 'REPOSICAO' &&
            l.notes && (
              l.notes.includes('reagendada pelo aluno') || 
              l.notes.includes('Aula reagendada pelo aluno')
            )
          )
          setStudentRescheduledLessons(rescheduledByStudent)
        }
      }
    } catch (e) {
      console.error('Erro ao buscar aulas reagendadas pelos alunos:', e)
    }
  }, [])

  const markRescheduledLessonAsViewed = useCallback((lessonId: string) => {
    const newViewed = new Set(viewedRescheduledLessons)
    newViewed.add(lessonId)
    setViewedRescheduledLessons(newViewed)
    // Salvar no localStorage
    localStorage.setItem('viewedRescheduledLessons', JSON.stringify(Array.from(newViewed)))
  }, [viewedRescheduledLessons])

  const fetchPendingTransferRequests = useCallback(async () => {
    try {
      // Buscar solicitações pendentes para gestão:
      // 1. TEACHER_REJECTED (professor rejeitou e passou para gestão)
      // 2. PENDING com requestedStartAt customizado (aluno selecionou "não encontrou horário")
      const res = await fetch('/api/admin/lesson-requests?status=TEACHER_REJECTED', { credentials: 'include' })
      if (res.ok) {
        const json = await res.json()
        if (json.ok && json.requests) {
          const rejected = json.requests
          
          // Buscar também PENDING com custom time
          const resPending = await fetch('/api/admin/lesson-requests?status=PENDING', { credentials: 'include' })
          if (resPending.ok) {
            const jsonPending = await resPending.json()
            if (jsonPending.ok && jsonPending.requests) {
              // Filtrar apenas as que têm requestedStartAt customizado (não estão nos slots padrão)
              const customTimeRequests = jsonPending.requests.filter((r: any) => 
                r.requestedStartAt && r.type === 'TROCA_AULA'
              )
              setPendingTransferRequests([...rejected, ...customTimeRequests])
              return
            }
          }
          setPendingTransferRequests(rejected)
        }
      }
    } catch (e) {
      console.error('Erro ao buscar solicitações de troca:', e)
    }
  }, [])

  useEffect(() => {
    setLoading(true)
    // Carregamento crítico da tela: não bloquear por consultas secundárias pesadas.
    Promise.all([
      fetchLessons(),
      fetchStats(),
      fetchEnrollmentsAndTeachers(),
      fetchHolidays(),
    ]).finally(() => setLoading(false))

    // Cargas secundárias (não devem travar o calendário principal).
    void fetchStudentRescheduledLessons()
    void fetchPendingTransferRequests()
    void fetchNovosMatriculadosCount()
  }, [fetchLessons, fetchStats, fetchEnrollmentsAndTeachers, fetchHolidays, fetchStudentRescheduledLessons, fetchPendingTransferRequests, fetchNovosMatriculadosCount])

  useEffect(() => {
    if (listModal?.type !== 'novosMatriculados') return
    setNovosMatriculadosListLoading(true)
    setNovosMatriculadosList([])
    fetch(`/api/admin/dashboard-lists?type=novosMatriculados`, { credentials: 'include' })
      .then((r) => r.json())
      .then((j) => {
        if (j.ok && Array.isArray(j.data)) {
          setNovosMatriculadosList(j.data)
        }
      })
      .catch(() => setNovosMatriculadosList([]))
      .finally(() => setNovosMatriculadosListLoading(false))
  }, [listModal?.type])

  // já não carregamos mais a lista de alunos para redirecionar

  // Ouvir evento de atualização de aulas (quando solicitação é aprovada)
  useEffect(() => {
    const handleLessonsUpdated = () => {
      fetchLessons()
      fetchStats()
    }
    window.addEventListener('lessons-updated', handleLessonsUpdated)
    return () => window.removeEventListener('lessons-updated', handleLessonsUpdated)
  }, [fetchLessons, fetchStats])

  useEffect(() => {
    if (!lessonModalOpen || !lessonForm.startAt?.trim() || activeTeachers.length === 0) {
      setTeacherAvailabilities(null)
      setTeacherConflicts({})
      return
    }
    const raw = lessonForm.startAt.trim()
    const iso = raw.length >= 16 ? new Date(raw.length === 16 ? raw + ':00' : raw).toISOString() : null
    if (!iso || Number.isNaN(new Date(iso).getTime())) {
      setTeacherAvailabilities(null)
      setTeacherConflicts({})
      return
    }
    const duration = lessonForm.durationMinutes || 60
    const excludeId = editingLesson?.id ?? ''
    let cancelled = false
    const base = `/api/admin/teachers/check-availability?datetime=${encodeURIComponent(iso)}&durationMinutes=${duration}${excludeId ? `&excludeLessonId=${encodeURIComponent(excludeId)}` : ''}`
    Promise.all(
      activeTeachers.map((t) =>
        fetch(`${base}&teacherId=${encodeURIComponent(t.id)}`, { credentials: 'include' }).then((r) => r.json())
      )
    )
      .then((results) => {
        if (cancelled) return
        const availabilities: Record<string, boolean> = {}
        const conflicts: Record<string, string> = {}
        results.forEach((j, i) => {
          const teacherId = activeTeachers[i]?.id
          if (!teacherId) return
          if (j.ok && typeof j.available === 'boolean') {
            availabilities[teacherId] = j.available
            if (j.available === false && j.reason) conflicts[teacherId] = j.reason
          }
        })
        setTeacherAvailabilities(availabilities)
        setTeacherConflicts(conflicts)
      })
      .catch(() => {
        if (!cancelled) {
          setTeacherAvailabilities(null)
          setTeacherConflicts({})
        }
      })
    return () => {
      cancelled = true
    }
  }, [lessonModalOpen, lessonForm.startAt, lessonForm.durationMinutes, editingLesson?.id, activeTeachers])

  // Verificar disponibilidade dos professores para reposição
  useEffect(() => {
    if (!lessonModalOpen || !agendarReposicao || !reposicaoForm.startAt?.trim() || activeTeachers.length === 0) {
      setReposicaoTeacherAvailabilities(null)
      setReposicaoTeacherConflicts({})
      return
    }
    const raw = reposicaoForm.startAt.trim()
    const iso = raw.length >= 16 ? new Date(raw.length === 16 ? raw + ':00' : raw).toISOString() : null
    if (!iso || Number.isNaN(new Date(iso).getTime())) {
      setReposicaoTeacherAvailabilities(null)
      setReposicaoTeacherConflicts({})
      return
    }
    const duration = reposicaoForm.durationMinutes || 60
    let cancelled = false
    const base = `/api/admin/teachers/check-availability?datetime=${encodeURIComponent(iso)}&durationMinutes=${duration}`
    Promise.all(
      activeTeachers.map((t) =>
        fetch(`${base}&teacherId=${encodeURIComponent(t.id)}`, { credentials: 'include' }).then((r) => r.json())
      )
    )
      .then((results) => {
        if (cancelled) return
        const availabilities: Record<string, boolean> = {}
        const conflicts: Record<string, string> = {}
        results.forEach((j, i) => {
          const teacherId = activeTeachers[i]?.id
          if (!teacherId) return
          if (j.ok && typeof j.available === 'boolean') {
            availabilities[teacherId] = j.available
            if (j.available === false && j.reason) conflicts[teacherId] = j.reason
          }
        })
        setReposicaoTeacherAvailabilities(availabilities)
        setReposicaoTeacherConflicts(conflicts)
      })
      .catch(() => {
        if (!cancelled) {
          setReposicaoTeacherAvailabilities(null)
          setReposicaoTeacherConflicts({})
        }
      })
    return () => {
      cancelled = true
    }
  }, [lessonModalOpen, agendarReposicao, reposicaoForm.startAt, reposicaoForm.durationMinutes, activeTeachers])

  useEffect(() => {
    if (teacherAvailabilities != null && lessonForm.teacherId && teacherAvailabilities[lessonForm.teacherId] === false) {
      setLessonForm((prev) => ({ ...prev, teacherId: '' }))
    }
  }, [teacherAvailabilities, lessonForm.teacherId])

  const openNewLesson = (date: Date, hour?: number) => {
    const start = new Date(date)
    // Se a data já veio com horário (ex.: clique no slot 14:00), manter; senão usar 9:00 ou o hour passado
    const alreadyHasTime = date.getHours() !== 0 || date.getMinutes() !== 0
    if (!alreadyHasTime) start.setHours(hour ?? 9, 0, 0, 0)
    setEditingLesson(null)
    setAgendarReposicao(false)
    setReposicaoForm({ startAt: '', teacherId: '', durationMinutes: 30 })
    setLessonForm({
      enrollmentId: '',
      teacherId: '',
      status: 'CONFIRMED',
      startAt: toDatetimeLocal(start),
      durationMinutes: 30,
      notes: '',
      createdByName: '',
      repeatEnabled: false,
      repeatWeeks: 4,
      repeatSameWeek: false,
      repeatSameWeekStartAt: '',
      repeatFrequencyEnabled: false,
      repeatFrequencyWeeks: 4,
    })
    setLessonModalOpen(true)
  }

  const openEditLesson = (
    lesson: Lesson,
    options?: { status?: LessonStatusUi; agendarReposicao?: boolean }
  ) => {
    if (pendingPastEditLessonIds.has(lesson.id)) {
      if (canApprovePastLessonEdits) {
        void openPastEditApproval(lesson.id)
        return
      }
      setToast({
        message: 'Esta aula tem alteração pendente de aprovação.',
        type: 'error',
      })
      return
    }
    if (!options?.agendarReposicao) {
      setCancelamentoExcecao(false)
    }
    setEditingLesson(lesson)
    setAgendarReposicao(options?.agendarReposicao ?? false)
    setReposicaoForm({ startAt: '', teacherId: '', durationMinutes: lesson.durationMinutes || 30 })
    const start = new Date(lesson.startAt)
    setLessonForm({
      enrollmentId: lesson.enrollmentId,
      teacherId: lesson.teacherId,
      status: options?.status ?? lesson.status,
      startAt: toDatetimeLocal(start),
      durationMinutes: lesson.durationMinutes,
      notes: lesson.notes || '',
      createdByName: lesson.createdByName || '',
      repeatEnabled: false,
      repeatWeeks: 4,
      repeatSameWeek: false,
      repeatSameWeekStartAt: '',
      repeatFrequencyEnabled: false,
      repeatFrequencyWeeks: 4,
    })
    setLessonModalOpen(true)
  }

  const abrirReagendamentoDaCancelada = useCallback(async (lessonId: string) => {
    setReagendarCanceladaLoadingId(lessonId)
    try {
      const res = await fetch(`/api/admin/lessons/${lessonId}`, { credentials: 'include' })
      if (res.status === 401 || res.status === 403) {
        router.push('/login?tab=admin')
        return
      }
      const json = await res.json()
      if (!json?.ok || !json?.data?.lesson) {
        setToast({ message: json?.message || 'Não foi possível abrir a aula cancelada', type: 'error' })
        return
      }

      const raw = json.data.lesson
      if (!lessonCancelledStatusAllowsReposicao(raw.status)) {
        setToast({
          message:
            'Esta aula está marcada como cancelada sem reposição. Não é possível agendar reposição a partir dela.',
          type: 'error',
        })
        return
      }
      if (!raw.teacherId || !raw.teacher?.id) {
        setToast({ message: 'Aula sem professor definido. Ajuste o professor antes de reagendar.', type: 'error' })
        return
      }

      const mappedStatus: LessonStatusUi =
        raw.status === 'CONFIRMED' ||
        raw.status === 'CANCELLED' ||
        raw.status === 'CANCELLED_BY_TEACHER' ||
        raw.status === 'CANCELLED_NO_REPLACEMENT' ||
        raw.status === 'REPOSICAO'
          ? raw.status
          : 'CONFIRMED'

      const lessonToEdit: Lesson = {
        id: raw.id,
        enrollmentId: raw.enrollmentId,
        teacherId: raw.teacherId,
        status: mappedStatus,
        startAt: raw.startAt,
        durationMinutes: raw.durationMinutes ?? 30,
        notes: raw.notes ?? null,
        createdByName: raw.createdByName ?? null,
        enrollment: {
          id: raw.enrollment.id,
          nome: raw.enrollment.nome,
          frequenciaSemanal: raw.enrollment.frequenciaSemanal ?? null,
        },
        teacher: { id: raw.teacher.id, nome: raw.teacher.nome },
      }

      setListModal(null)
      openEditLesson(lessonToEdit)
      setAgendarReposicao(true)
    } catch {
      setToast({ message: 'Erro ao abrir aula cancelada para reagendar', type: 'error' })
    } finally {
      setReagendarCanceladaLoadingId(null)
    }
  }, [router])

  // Abrir modal de reposição vindo do alerta de professor ausente (?reagendar=lessonId)
  useEffect(() => {
    const lessonId = searchParams?.get('reagendar')?.trim()
    if (!lessonId || reagendarFromUrlHandled.current === lessonId) return
    reagendarFromUrlHandled.current = lessonId
    void abrirReagendamentoDaCancelada(lessonId)
  }, [searchParamsKey, abrirReagendamentoDaCancelada])

  const handleSaveLesson = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!lessonForm.enrollmentId || !lessonForm.teacherId) {
      setToast({ message: 'Selecione aluno e professor', type: 'error' })
      return
    }
    if (teacherAvailabilities != null && teacherAvailabilities[lessonForm.teacherId] === false) {
      const reason = teacherConflicts[lessonForm.teacherId] || 'Professor indisponível neste horário'
      setToast({ message: reason, type: 'error' })
      return
    }
    // Validar reposição se estiver cancelando e marcou agendar reposição
    if (lessonCancelledStatusAllowsReposicao(lessonForm.status) && agendarReposicao) {
      if (!reposicaoForm.startAt?.trim() || !reposicaoForm.teacherId) {
        setToast({ message: 'Preencha data/hora e professor para a reposição', type: 'error' })
        return
      }
      if (reposicaoTeacherAvailabilities != null && reposicaoTeacherAvailabilities[reposicaoForm.teacherId] === false) {
        const reason = reposicaoTeacherConflicts[reposicaoForm.teacherId] || 'Professor indisponível neste horário'
        setToast({ message: `Reposição: ${reason}`, type: 'error' })
        return
      }
      // Validar idioma do professor da reposição
      const enrollment = enrollments.find((e) => e.id === lessonForm.enrollmentId)
      const reposicaoTeacher = teachers.find((t) => t.id === reposicaoForm.teacherId)
      const curso = enrollment?.curso
      const ensina = reposicaoTeacher?.idiomasEnsina ?? []
      if (curso === 'INGLES' && !ensina.includes('INGLES')) {
        setToast({ message: 'O professor da reposição não ensina esse idioma', type: 'error' })
        return
      }
      if (curso === 'ESPANHOL' && !ensina.includes('ESPANHOL')) {
        setToast({ message: 'O professor da reposição não ensina esse idioma', type: 'error' })
        return
      }
      if (curso === 'INGLES_E_ESPANHOL' && (!ensina.includes('INGLES') && !ensina.includes('ESPANHOL'))) {
        setToast({ message: 'O professor da reposição não ensina esse idioma', type: 'error' })
        return
      }
    }
    // Validar idioma: professor deve ensinar o(s) idioma(s) do curso do aluno
    const enrollment = enrollments.find((e) => e.id === lessonForm.enrollmentId)
    const teacher = teachers.find((t) => t.id === lessonForm.teacherId)
    const curso = enrollment?.curso
    const ensina = teacher?.idiomasEnsina ?? []
    if (curso === 'INGLES' && !ensina.includes('INGLES')) {
      setIdiomaErrorModalOpen(true)
      return
    }
    if (curso === 'ESPANHOL' && !ensina.includes('ESPANHOL')) {
      setIdiomaErrorModalOpen(true)
      return
    }
    if (curso === 'INGLES_E_ESPANHOL' && (!ensina.includes('INGLES') && !ensina.includes('ESPANHOL'))) {
      setIdiomaErrorModalOpen(true)
      return
    }
    const startAt = new Date(lessonForm.startAt + ':00') // datetime-local não envia segundos
    if (Number.isNaN(startAt.getTime())) {
      setToast({ message: 'Data/hora inválida', type: 'error' })
      return
    }
    setSavingLesson(true)
    try {
      if (editingLesson) {
        const teacherChanged = lessonForm.teacherId !== editingLesson.teacherId
        const startChanged = new Date(editingLesson.startAt).getTime() !== startAt.getTime()
        const durationChanged =
          (lessonForm.durationMinutes || 30) !== (editingLesson.durationMinutes || 30)
        const statusChanged = lessonForm.status !== editingLesson.status
        let applyToFuture = false

        if (teacherChanged || startChanged || durationChanged || statusChanged) {
          applyToFuture = await confirm({
            title: 'Alterar só esta semana?',
            message:
              'Esta aula faz parte de uma série semanal (mesmo dia e horário). Deseja aplicar a alteração apenas nesta semana ou em todas as aulas futuras desta série, a partir desta data?',
            confirmLabel: 'Todas dali pra frente',
            cancelLabel: 'Só esta semana',
          })
        }

        if (needsPastEditRequest(editingLesson)) {
          const sendRequest = await confirm({
            title: 'Enviar solicitação de aprovação?',
            message: `${LESSON_PAST_EDIT_NEEDS_APPROVAL_MESSAGE} Deseja enviar esta solicitação para um administrador autorizado?`,
            confirmLabel: 'Sim, enviar',
            cancelLabel: 'Cancelar',
          })
          if (!sendRequest) return

          const reqRes = await fetch('/api/admin/lesson-past-edit-requests', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({
              lessonId: editingLesson.id,
              payload: {
                enrollmentId: lessonForm.enrollmentId,
                teacherId: lessonForm.teacherId,
                status: lessonForm.status,
                startAt: startAt.toISOString(),
                durationMinutes: lessonForm.durationMinutes,
                notes: lessonForm.notes || null,
                createdByName: lessonForm.createdByName?.trim() || null,
                applyToFuture,
              },
            }),
          })
          const reqJson = await reqRes.json()
          if (!reqRes.ok || !reqJson.ok) {
            setToast({ message: reqJson.message || 'Erro ao enviar solicitação', type: 'error' })
            return
          }
          setLessonModalOpen(false)
          setEditingLesson(null)
          setAgendarReposicao(false)
          await fetchPendingPastEditLessons()
          setToast({
            message: 'Solicitação enviada. A aula ficará piscando até um administrador autorizado aprovar.',
            type: 'success',
          })
          return
        }

        const res = await fetch(`/api/admin/lessons/${editingLesson.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            enrollmentId: lessonForm.enrollmentId,
            teacherId: lessonForm.teacherId,
            status: lessonForm.status,
            startAt: startAt.toISOString(),
            durationMinutes: lessonForm.durationMinutes,
            notes: lessonForm.notes || null,
            createdByName: lessonForm.createdByName?.trim() || null,
            ...(applyToFuture ? { applyToFuture: true } : {}),
            ...(cancelamentoExcecao ? { cancelamentoExcecao: true } : {}),
          }),
        })
        const json = await res.json()
        if (!res.ok || !json.ok) {
          setToast({ message: json.message || 'Erro ao atualizar', type: 'error' })
          return
        }
        
        // Verificar se há solicitação pendente associada a esta aula e processá-la
        if (editingLesson) {
          try {
            const requestRes = await fetch(`/api/admin/lesson-requests?lessonId=${editingLesson.id}`, { credentials: 'include' })
            if (requestRes.ok) {
              const requestJson = await requestRes.json()
              if (requestJson.ok && requestJson.requests && requestJson.requests.length > 0) {
                // Encontrar solicitação pendente (TEACHER_REJECTED ou PENDING)
                const pendingRequest = requestJson.requests.find((r: any) => 
                  r.status === 'TEACHER_REJECTED' || r.status === 'PENDING'
                )
                
                if (pendingRequest) {
                  // Processar a solicitação como aprovada
                  const processRes = await fetch(`/api/admin/lesson-requests/${pendingRequest.id}`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    credentials: 'include',
                    body: JSON.stringify({
                      action: 'APPROVE',
                      newTeacherId: lessonForm.teacherId,
                      newStartAt: startAt.toISOString(),
                      adminNotes: 'Processado pela gestão através do calendário',
                    }),
                  })
                  
                  if (processRes.ok) {
                    const processJson = await processRes.json()
                    if (processJson.ok) {
                      // Recarregar solicitações pendentes
                      fetchPendingTransferRequests()
                    }
                  }
                }
              }
            }
          } catch (e) {
            console.error('Erro ao processar solicitação:', e)
            // Não bloquear o salvamento se houver erro ao processar solicitação
          }
        }
        
        // Se cancelou e marcou agendar reposição, criar a reposição
        if (
          lessonCancelledStatusAllowsReposicao(lessonForm.status) &&
          agendarReposicao &&
          reposicaoForm.startAt &&
          reposicaoForm.teacherId
        ) {
          const reposicaoStartAt = new Date(reposicaoForm.startAt + ':00')
          if (!Number.isNaN(reposicaoStartAt.getTime())) {
            const reposicaoRes = await fetch('/api/admin/lessons', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              credentials: 'include',
              body: JSON.stringify({
                enrollmentId: lessonForm.enrollmentId,
                teacherId: reposicaoForm.teacherId,
                status: 'REPOSICAO',
                startAt: reposicaoStartAt.toISOString(),
                durationMinutes: reposicaoForm.durationMinutes || lessonForm.durationMinutes,
                notes: `Reposição da aula cancelada em ${startAt.toLocaleDateString('pt-BR')}${
                  editingLesson ? ` [cancelledLessonId:${editingLesson.id}]` : ''
                }`,
                canceledLessonInfo: {
                  startAt: startAt.toISOString(),
                  teacherId: lessonForm.teacherId,
                  lessonId: editingLesson?.id ?? null,
                },
              }),
            })
            const reposicaoJson = await reposicaoRes.json()
            if (!reposicaoRes.ok || !reposicaoJson.ok) {
              setToast({ message: 'Aula cancelada, mas erro ao criar reposição: ' + (reposicaoJson.message || 'Erro desconhecido'), type: 'error' })
            } else {
              setToast({ message: 'Aula cancelada e reposição agendada', type: 'success' })
            }
          }
        } else {
          setToast({ message: 'Aula atualizada', type: 'success' })
          // Recarregar solicitações pendentes após um pequeno delay para garantir que o backend processou
          setTimeout(() => {
            fetchPendingTransferRequests()
          }, 500)
        }
      } else {
        const res = await fetch('/api/admin/lessons', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            enrollmentId: lessonForm.enrollmentId,
            teacherId: lessonForm.teacherId,
            status: lessonForm.status,
            startAt: startAt.toISOString(),
            durationMinutes: lessonForm.durationMinutes,
            notes: lessonForm.notes || null,
            repeatWeeks: DEFAULT_LESSON_REPEAT_WEEKS,
          }),
        })
        const json = await res.json()
        if (!res.ok || !json.ok) {
          setToast({ message: json.message || 'Erro ao criar aula', type: 'error' })
          return
        }
        const count = json.data?.count ?? 1
        setToast({ message: count > 1 ? `${count} aulas criadas` : 'Aula criada', type: 'success' })
      }
      setLessonModalOpen(false)
      setLessonProfessorDropdownOpen(false)
      setAgendarReposicao(false)
      setCancelamentoExcecao(false)
      setReposicaoForm({ startAt: '', teacherId: '', durationMinutes: 30 })
      fetchLessons()
      fetchStats()
    } catch (err) {
      setToast({ message: 'Erro ao salvar', type: 'error' })
    } finally {
      setSavingLesson(false)
    }
  }

  const cancelConfirmedLesson = useCallback(
    async (lesson: Lesson, fromModal: boolean) => {
      if (!canDirectEditLesson(lesson)) {
        setToast({ message: LESSON_PAST_EDIT_DENIED_MESSAGE, type: 'error' })
        return
      }
      if (lesson.status !== 'CONFIRMED') return

      const doCancel = await confirm({
        title: 'Cancelar aula',
        message:
          'Deseja cancelar esta aula confirmada? O status será alterado para "Cancelada" e o aluno pode receber notificação por e-mail.',
        confirmLabel: 'Sim, cancelar',
        cancelLabel: 'Não',
        variant: 'danger',
      })
      if (!doCancel) return

      const applyToFuture = await confirm({
        title: 'Cancelar só esta semana?',
        message:
          'Esta aula faz parte de uma série semanal (mesmo dia e horário). Deseja cancelar apenas nesta semana ou em todas as aulas futuras desta série, a partir desta data?',
        confirmLabel: 'Todas dali pra frente',
        cancelLabel: 'Só esta semana',
      })

      const startAt = fromModal && editingLesson?.id === lesson.id && lessonForm.startAt
        ? new Date(lessonForm.startAt + ':00')
        : new Date(lesson.startAt)
      if (Number.isNaN(startAt.getTime())) {
        setToast({ message: 'Data/hora inválida', type: 'error' })
        return
      }

      const cancelamentoTardio = isLessonCancelamentoTardioForEnrollments(
        startAt,
        lesson.enrollmentId,
        enrollments
      )

      let scheduleReposicao = false

      if (cancelamentoTardio) {
        const horas = getLessonCancelamentoAntecedenciaHoras(lesson.enrollmentId, enrollments)
        const lateChoice = await promptLateCancellation(horas)
        if (lateChoice === 'back') return
        if (lateChoice === 'exception') {
          setCancelamentoExcecao(true)
          scheduleReposicao = true
        }
      } else {
        scheduleReposicao = await confirm({
          title: 'Agendar reposição?',
          message: 'Deseja agendar uma aula de reposição após o cancelamento?',
          confirmLabel: 'Sim, agendar',
          cancelLabel: 'Não',
        })
      }

      if (scheduleReposicao) {
        if (fromModal && editingLesson?.id === lesson.id) {
          setLessonForm((f) => ({ ...f, status: 'CANCELLED' }))
          setAgendarReposicao(true)
        } else {
          openEditLesson(lesson, { status: 'CANCELLED', agendarReposicao: true })
        }
        setReposicaoForm((f) => ({
          ...f,
          teacherId: f.teacherId || lesson.teacherId,
          durationMinutes: lesson.durationMinutes,
        }))
        setToast({
          message: cancelamentoTardio
            ? 'Exceção registrada. Preencha a reposição e clique em Salvar.'
            : 'Preencha a data e o professor da reposição e clique em Salvar.',
          type: 'success',
        })
        return
      }

      setCancelamentoExcecao(false)
      setCancellingLessonId(lesson.id)
      try {
        const res = await fetch(`/api/admin/lessons/${lesson.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            enrollmentId: lesson.enrollmentId,
            teacherId: lesson.teacherId,
            status: 'CANCELLED',
            startAt: startAt.toISOString(),
            durationMinutes: lesson.durationMinutes,
            notes: lesson.notes || null,
            ...(applyToFuture ? { applyToFuture: true } : {}),
          }),
        })
        const json = await res.json()
        if (!res.ok || !json.ok) {
          setToast({ message: json.message || 'Erro ao cancelar aula', type: 'error' })
          return
        }
        if (fromModal) {
          setLessonModalOpen(false)
          setLessonProfessorDropdownOpen(false)
          setLessonAlunoDropdownOpen(false)
          setLessonStatusDropdownOpen(false)
          setAgendarReposicao(false)
          setReposicaoForm({ startAt: '', teacherId: '', durationMinutes: 30 })
          setEditingLesson(null)
        }
        setToast({
          message: json.data?.cancelamentoTardio
            ? 'Cancelamento em cima da hora: aula registrada automaticamente para o professor (aluno não compareceu, sem reposição).'
            : 'Aula cancelada',
          type: 'success',
        })
        fetchLessons()
        fetchStats()
      } catch {
        setToast({ message: 'Erro ao cancelar aula', type: 'error' })
      } finally {
        setCancellingLessonId(null)
      }
    },
    [
      canDirectEditLesson,
      confirm,
      promptLateCancellation,
      enrollments,
      editingLesson,
      lessonForm.startAt,
      fetchLessons,
      fetchStats,
      openEditLesson,
    ]
  )

  const handleCancelLesson = () => {
    if (editingLesson) void cancelConfirmedLesson(editingLesson, true)
  }

  const openDeleteLessonModal = () => {
    if (editingLesson) setDeleteLessonModalOpen(true)
  }

  const handleDeleteLesson = async (deleteFuture: boolean) => {
    if (!editingLesson) return
    setDeletingLesson(true)
    try {
      const res = await fetch(`/api/admin/lessons/${editingLesson.id}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ deleteFuture }),
      })
      const json = await res.json()
      if (!res.ok || !json.ok) {
        setToast({ message: json.message || 'Erro ao excluir', type: 'error' })
        return
      }
      setDeleteLessonModalOpen(false)
      setLessonModalOpen(false)
      setLessonProfessorDropdownOpen(false)
      setAgendarReposicao(false)
      setReposicaoForm({ startAt: '', teacherId: '', durationMinutes: 30 })
      setEditingLesson(null)
      const count = json.data?.count ?? 1
      setToast({ message: count > 1 ? `${count} aulas excluídas` : 'Aula excluída', type: 'success' })
      fetchLessons()
      fetchStats()
    } catch (err) {
      setToast({ message: 'Erro ao excluir aula', type: 'error' })
    } finally {
      setDeletingLesson(false)
    }
  }

  const titleLabel = useMemo(() => {
    if (view === 'month') return `${MESES[currentDate.getMonth()]} ${currentDate.getFullYear()}`
    if (view === 'week') {
      const start = getStartOfWeek(currentDate)
      const end = addDays(start, 6)
      return `${start.getDate()}/${start.getMonth() + 1} – ${end.getDate()}/${end.getMonth() + 1} ${currentDate.getFullYear()}`
    }
    return `${currentDate.getDate()} ${MESES[currentDate.getMonth()]} ${currentDate.getFullYear()}`
  }, [view, currentDate])

  const goPrev = () => {
    if (view === 'month') setCurrentDate((d) => addMonths(d, -1))
    else if (view === 'week') setCurrentDate((d) => addDays(d, -7))
    else setCurrentDate((d) => addDays(d, -1))
  }

  const goNext = () => {
    if (view === 'month') setCurrentDate((d) => addMonths(d, 1))
    else if (view === 'week') setCurrentDate((d) => addDays(d, 7))
    else setCurrentDate((d) => addDays(d, 1))
  }

  const goToday = () => setCurrentDate(new Date())

  const monthGrid = useMemo(() => {
    const start = getStartOfMonth(currentDate)
    let cell = new Date(getStartOfWeek(start))
    const weeks: Date[][] = []
    for (let w = 0; w < 6; w++) {
      const row: Date[] = []
      for (let d = 0; d < 7; d++) {
        row.push(new Date(cell))
        cell.setDate(cell.getDate() + 1)
      }
      weeks.push(row)
    }
    return weeks
  }, [currentDate])

  const weekStart = useMemo(() => getStartOfWeek(currentDate), [currentDate])

  // Slots de 30 em 30 min, das 6h às 23h30 (incluindo 23:30)
  const timeSlots = useMemo(() => {
    const slots: { hour: number; minute: number }[] = []
    for (let h = 6; h <= 23; h++) {
      slots.push({ hour: h, minute: 0 })
      if (h <= 23) slots.push({ hour: h, minute: 30 }) // Fix: include 23:30
    }
    return slots
  }, [])

  const formatSlotLabel = (slot: { hour: number; minute: number }) =>
    `${slot.hour.toString().padStart(2, '0')}:${slot.minute.toString().padStart(2, '0')}`

  // Verificar se o professor está disponível em um horário específico
  // Grade em passos de 30 min — comparar com blocos de 30 min (não 60), alinhado ao America/Sao_Paulo.
  const isTeacherAvailableAtSlot = useCallback((day: Date, slotHour: number, slotMinute: number, durationMinutes: number = 30): boolean => {
    // Se não há professor selecionado, sempre disponível
    if (!selectedTeacherId || selectedTeacherSlots.length === 0) {
      return true
    }

    const dayOfWeek = getDayOfWeekInTZ(day)
    const slotStartMinutes = slotHour * 60 + slotMinute
    const slotEndMinutes = slotStartMinutes + durationMinutes

    return selectedTeacherSlots.some(
      (slot) =>
        slot.dayOfWeek === dayOfWeek &&
        slotStartMinutes >= slot.startMinutes &&
        slotEndMinutes <= slot.endMinutes
    )
  }, [selectedTeacherId, selectedTeacherSlots])

  const visibleLessons = useMemo(
    () =>
      selectedStudentId
        ? lessons.filter((l) => l.enrollmentId === selectedStudentId)
        : lessons,
    [lessons, selectedStudentId]
  )

  // Indexações para evitar filtrar todo o array em cada célula/slot.
  const visibleLessonsByDayKey = useMemo(() => {
    const map: Record<string, Lesson[]> = {}
    for (const l of visibleLessons) {
      const dayKey = toDateKeyInTZ(l.startAt)
      if (!map[dayKey]) map[dayKey] = []
      map[dayKey].push(l)
    }
    return map
  }, [visibleLessons])

  const getLessonsForDay = (day: Date) =>
    visibleLessonsByDayKey[toDateKeyInTZ(day)] ?? []

  /**
   * Aulas que ocupam o bloco de 30 min [slot, slot+30) — inclui aula de 60 min que começou na meia hora anterior.
   */
  const getLessonsIntersectingSlot = useCallback(
    (day: Date, slotHour: number, slotMinute: number) => {
      const dayKey = toDateKeyInTZ(day)
      const blockStart = new Date(day)
      blockStart.setHours(slotHour, slotMinute, 0, 0)
      const dayLessons = visibleLessonsByDayKey[dayKey] ?? []
      return dayLessons.filter((l) => {
        const ls = new Date(l.startAt).getTime()
        const le = ls + (l.durationMinutes ?? 60) * 60 * 1000
        const bs = blockStart.getTime()
        const be = bs + 30 * 60 * 1000
        return ls < be && bs < le
      })
    },
    [visibleLessonsByDayKey]
  )

  /** Com filtro de professor ou aluno: não oferecer "+ Aula" em bloco já coberto por aula desse recurso. */
  const slotBlockedForNewLessonByFilter = useCallback(
    (day: Date, slotHour: number, slotMinute: number) => {
      const intersecting = getLessonsIntersectingSlot(day, slotHour, slotMinute)
      if (
        selectedTeacherId &&
        intersecting.some((l) => l.teacherId === selectedTeacherId && isLessonScheduledStatus(l.status))
      ) {
        return true
      }
      if (
        selectedStudentId &&
        intersecting.some((l) => l.enrollmentId === selectedStudentId && isLessonScheduledStatus(l.status))
      ) {
        return true
      }
      return false
    },
    [getLessonsIntersectingSlot, selectedTeacherId, selectedStudentId]
  )

  const statusLabel = (s: string) => LESSON_STATUS_LABELS[s as LessonStatusUi] ?? s

  const isPaused = (lesson: Lesson): boolean => {
    if (lesson.enrollment?.status !== 'PAUSED' || !lesson.enrollment?.pausedAt) return false
    const pausedAt = new Date(lesson.enrollment.pausedAt)
    pausedAt.setHours(0, 0, 0, 0)
    const lessonDate = new Date(lesson.startAt)
    lessonDate.setHours(0, 0, 0, 0)
    const activationDate = lesson.enrollment.activationDate ? new Date(lesson.enrollment.activationDate) : null
    if (activationDate) {
      activationDate.setHours(0, 0, 0, 0)
    }
    // Está pausado se a aula está entre pausedAt e activationDate (ou sem activationDate)
    return lessonDate >= pausedAt && (!activationDate || lessonDate < activationDate)
  }

  const statusColor = (s: string, lesson?: Lesson) => {
    // Se há solicitação pendente, usar roxo
    if (lesson && lesson.requests && lesson.requests.length > 0) {
      return 'bg-violet-50 text-violet-800 border-violet-200 hover:bg-violet-100'
    }
    // Se o aluno está pausado, usar cor diferente (azul claro)
    if (lesson && isPaused(lesson)) {
      return 'bg-sky-50 text-sky-800 border-sky-200 hover:bg-sky-100'
    }
    return s === 'CONFIRMED'
      ? 'bg-emerald-50 text-emerald-800 border-emerald-200 hover:bg-emerald-100'
      : isLessonCancelledFamily(s)
        ? 'bg-rose-50 text-rose-800 border-rose-200 hover:bg-rose-100'
        : 'bg-amber-50 text-amber-800 border-amber-200 hover:bg-amber-100'
  }

  type LessonBlockSize = 'month' | 'week' | 'day'

  const renderLessonCalendarBlock = (l: Lesson, size: LessonBlockSize) => {
    const isCancelled = isLessonCancelledFamily(l.status)
    const isReposicao = l.status === 'REPOSICAO'
    const rescheduledAt = isCancelled ? rescheduledAtByCancelledLessonId.get(l.id) : undefined
    const isCancelledWithReposicao = Boolean(rescheduledAt)
    const cancelledAt = isCancelled && !isCancelledWithReposicao ? extractCancelledAtFromNotes(l.notes) : null
    const originalLessonAt = isReposicao ? originalAtByReposicaoId.get(l.id) : undefined

    const inactiveAt = l.enrollment.inactiveAt ?? null
    const inactivationWarning =
      Boolean(inactiveAt) && isLessonInInactivationWarningWindow(l.startAt, inactiveAt)
    const inactiveDateLabel = inactiveAt ? formatInactiveDateLabel(inactiveAt) : null

    const showCancelledBadge = isCancelled
    const showReposicaoBadge = isReposicao && Boolean(originalLessonAt)
    const showInactiveBadge = inactivationWarning
    const showBadge = showCancelledBadge || showReposicaoBadge || showInactiveBadge
    const badgeHasSecondLine =
      isCancelledWithReposicao ||
      Boolean(cancelledAt) ||
      showReposicaoBadge ||
      showInactiveBadge

    const canCancel = l.status === 'CONFIRMED' && canDirectEditLesson(l)
    const isCancelling = cancellingLessonId === l.id
    const hasPendingPastEdit = pendingPastEditLessonIds.has(l.id)

    const cardColorClass = inactivationWarning
      ? 'bg-violet-50 text-violet-900 border-violet-300 hover:bg-violet-100'
      : statusColor(l.status, l)

    const cfg =
      size === 'month'
        ? {
            btn: 'block w-full text-left text-xs px-2 py-1 rounded-lg border shadow-sm break-words relative',
            contentPad: showBadge ? (badgeHasSecondLine ? 'pt-7 pr-8 pb-3' : 'pt-4 pr-8 pb-3') : 'pr-8 pb-3',
            curso: 'text-[9px]',
            paused: 'text-[10px]',
            admin: 'text-[9px]',
            icon: 'w-3 h-3',
            cancelBtn: 'top-0.5 right-0.5',
            badge: 'text-[8px] py-0.5',
          }
        : size === 'week'
          ? {
              btn: 'text-[10px] text-left px-1.5 py-1 rounded-lg border shadow-sm break-words relative w-full',
              contentPad: showBadge ? (badgeHasSecondLine ? 'pt-7 pr-8 pb-3' : 'pt-4 pr-8 pb-3') : 'pr-8 pb-3',
              curso: 'text-[8px]',
              paused: 'text-[9px]',
              admin: 'text-[8px]',
              icon: 'w-2.5 h-2.5',
              cancelBtn: 'top-0 right-0',
              badge: 'text-[7px] py-px',
            }
          : {
              btn: 'text-sm text-left px-3 py-1.5 rounded-lg border shadow-sm w-fit max-w-full break-words relative',
              contentPad: showBadge ? (badgeHasSecondLine ? 'pt-9 pr-12 pb-4' : 'pt-5 pr-12 pb-4') : 'pr-12 pb-4',
              curso: 'text-[10px]',
              paused: '',
              admin: 'text-[10px]',
              icon: 'w-3.5 h-3.5',
              cancelBtn: 'top-1 right-1',
              badge: 'text-[9px] py-0.5',
            }

    const titleExtra =
      `${l.requests && l.requests.length > 0 ? ' (Em processo de troca)' : ''}${isPaused(l) ? ' (Aluno Pausado)' : ''}`

    return (
      <div key={l.id} className="relative w-full">
        {canCancel && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              void cancelConfirmedLesson(l, false)
            }}
            disabled={isCancelling || savingLesson}
            className={`absolute ${cfg.cancelBtn} z-20 p-0.5 rounded text-rose-600 hover:bg-rose-100 disabled:opacity-50`}
            title="Cancelar aula"
          >
            {isCancelling ? (
              <Loader2 className={`${cfg.icon} animate-spin`} />
            ) : (
              <XCircle className={cfg.icon} />
            )}
          </button>
        )}
        <button
          type="button"
          onClick={() => openEditLesson(l)}
          className={`${cfg.btn} ${cardColorClass} ${hasPendingPastEdit ? 'animate-blink-alert ring-2 ring-amber-400' : ''} ${size === 'month' ? 'hover:shadow transition-shadow' : 'hover:shadow'}`}
          title={`${getLessonStudentLabel(l, enrollments)} – ${l.teacher?.nome ?? 'Sem professor'} – ${statusLabel(l.status)}${titleExtra}${hasPendingPastEdit ? ' (Alteração pendente de aprovação)' : ''}${inactivationWarning && inactiveDateLabel ? ` (Aluno inativado em ${inactiveDateLabel})` : ''}`}
        >
          {showBadge && (
            showCancelledBadge ? (
              isCancelledWithReposicao && rescheduledAt ? (
                <span
                  className={`absolute inset-x-0 top-0 z-10 text-center ${cfg.badge} font-bold uppercase tracking-wider bg-amber-600 text-white rounded-t-md leading-tight px-0.5`}
                >
                  <span className="block">Reagendada</span>
                  <span className="block font-medium normal-case tracking-normal">
                    para {formatRescheduledBadgeDate(rescheduledAt)}
                  </span>
                </span>
              ) : (
                <span
                  className={`absolute inset-x-0 top-0 z-10 text-center ${cfg.badge} font-bold uppercase tracking-wider bg-rose-600 text-white rounded-t-md leading-tight px-0.5`}
                >
                  <span className="block">Cancelado</span>
                  {cancelledAt && (
                    <span className="block font-medium normal-case tracking-normal">em {cancelledAt}</span>
                  )}
                </span>
              )
            ) : showReposicaoBadge && originalLessonAt ? (
              <span
                className={`absolute inset-x-0 top-0 z-10 text-center ${cfg.badge} font-bold uppercase tracking-wider bg-amber-600 text-white rounded-t-md leading-tight px-0.5`}
              >
                <span className="block normal-case font-semibold">Aula reagendada</span>
                <span className="block font-medium normal-case tracking-normal">
                  referente ao dia {formatOriginalLessonBadgeDate(originalLessonAt)}
                </span>
              </span>
            ) : showInactiveBadge && inactiveDateLabel ? (
              <span
                className={`absolute inset-x-0 top-0 z-10 text-center ${cfg.badge} font-bold uppercase tracking-wider bg-violet-700 text-white rounded-t-md leading-tight px-0.5`}
              >
                <span className="block normal-case font-semibold">Aluno inativado</span>
                <span className="block font-medium normal-case tracking-normal">
                  no dia {inactiveDateLabel}
                </span>
              </span>
            ) : null
          )}
          <div className={`line-clamp-2 ${cfg.contentPad}`}>
            {getLessonStudentLabel(l, enrollments)} – {l.teacher?.nome ?? 'Sem professor'}
            {size === 'day' ? ` – ${statusLabel(l.status)} (${formatTime(l.startAt)})` : ` ${formatTime(l.startAt)}`}
            {l.enrollment.curso && (
              <span className={`ml-1 ${cfg.curso} font-semibold text-gray-600`}>
                ({getCursoLabel(l.enrollment.curso)})
              </span>
            )}
            {isPaused(l) && <span className={`ml-1 ${cfg.paused}`}>⏸️</span>}
          </div>
          <div className={`absolute bottom-0.5 right-1 ${cfg.admin} text-gray-500 opacity-60 leading-tight`}>
            {getLastUpdateInfo(l.notes, l.createdByName)}
          </div>
        </button>
      </div>
    )
  }

  // Estado para horários
  const [currentTimeSP, setCurrentTimeSP] = useState('')
  const [currentTimeLocal, setCurrentTimeLocal] = useState('')
  const [userTimezone, setUserTimezone] = useState('')

  useEffect(() => {
    // Obter timezone local do navegador
    const localTz = Intl.DateTimeFormat().resolvedOptions().timeZone
    setUserTimezone(localTz)

    // Função para atualizar horários
    const updateTimes = () => {
      const now = new Date()
      
      // Horário de São Paulo
      const spTime = new Intl.DateTimeFormat('pt-BR', {
        timeZone: 'America/Sao_Paulo',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      }).format(now)
      
      // Horário local do usuário
      const localTime = new Intl.DateTimeFormat('pt-BR', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      }).format(now)
      
      setCurrentTimeSP(spTime)
      setCurrentTimeLocal(localTime)
    }

    // Atualizar imediatamente
    updateTimes()
    
    // Atualizar a cada minuto para evitar rerender pesado contínuo
    const interval = setInterval(updateTimes, 60_000)
    
    return () => clearInterval(interval)
  }, [])

  return (
    <AdminLayout>
      <div className="min-h-screen bg-gradient-to-b from-slate-50 via-white to-slate-50/50">
        {/* Banner de informações de horário */}
        <div className="mb-6 p-4 bg-white/80 backdrop-blur border border-slate-200 rounded-xl shadow-sm">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 text-sm">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-gray-700">⏰ Horário de referência:</span>
              <span className="text-gray-900 font-mono font-semibold">{currentTimeSP}</span>
              <span className="text-gray-600">(São Paulo, Brasil)</span>
            </div>
            {userTimezone !== 'America/Sao_Paulo' && (
              <div className="flex items-center gap-2 text-gray-600">
                <span>Seu horário local:</span>
                <span className="font-mono font-semibold text-gray-900">{currentTimeLocal}</span>
                <span className="text-xs">({userTimezone})</span>
              </div>
            )}
          </div>
          <p className="text-xs text-gray-600 mt-1">
            Todas as aulas são exibidas de acordo com o horário de São Paulo, Brasil, independente da sua localização.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
          <div>
            <h1 className="text-3xl md:text-4xl font-bold bg-gradient-to-r from-gray-900 to-gray-700 bg-clip-text text-transparent mb-1">
              Calendário
            </h1>
            <p className="text-sm text-gray-500">
              Aulas por mês, semana ou dia — segunda a sábado para conferência de frequência
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative">
              <div className="relative">
                <input
                  type="text"
                  value={
                    teacherFilterOpen
                      ? teacherFilterSearch
                      : selectedTeacher
                        ? selectedTeacher.nome
                        : 'Todos os professores'
                  }
                  onChange={(e) => {
                    setTeacherFilterSearch(e.target.value)
                    if (!teacherFilterOpen) setTeacherFilterOpen(true)
                  }}
                  onFocus={() => {
                    setTeacherFilterOpen(true)
                    setTeacherFilterSearch('')
                  }}
                  placeholder="Filtrar por professor..."
                  className="flex items-center gap-2 pl-10 pr-4 py-2.5 rounded-xl border border-gray-200 bg-white shadow-sm hover:shadow transition-shadow text-sm font-medium text-gray-700 w-[220px] focus:ring-2 focus:ring-brand-orange/30 focus:border-brand-orange"
                  title="Digite ou selecione um professor"
                />
                <Users className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 pointer-events-none" />
              </div>
              {teacherFilterOpen && (
                <>
                  <div
                    className="fixed inset-0 z-10"
                    aria-hidden
                    onClick={() => {
                      setTeacherFilterOpen(false)
                      setTeacherFilterSearch('')
                    }}
                  />
                  <div className="absolute left-0 top-full mt-1 z-20 min-w-[220px] py-1 bg-white rounded-lg border border-gray-200 shadow-lg max-h-[280px] overflow-y-auto">
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedTeacherId(null)
                        setTeacherFilterOpen(false)
                        setTeacherFilterSearch('')
                      }}
                      className={`w-full text-left px-4 py-2 text-sm ${!selectedTeacherId ? 'bg-brand-orange/10 text-brand-orange font-medium' : 'text-gray-700 hover:bg-gray-100'}`}
                    >
                      Todos os professores
                    </button>
                    {filteredTeachers.map((t) => (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => {
                          setSelectedTeacherId(t.id)
                          setTeacherFilterOpen(false)
                          setTeacherFilterSearch('')
                        }}
                        className={`w-full text-left px-4 py-2 text-sm ${selectedTeacherId === t.id ? 'bg-brand-orange/10 text-brand-orange font-medium' : 'text-gray-700 hover:bg-gray-100'}`}
                      >
                        {t.nome}
                      </button>
                    ))}
                    {filteredTeachers.length === 0 && activeTeachers.length > 0 && (
                      <p className="px-4 py-2 text-sm text-gray-500">Nenhum professor encontrado</p>
                    )}
                    {activeTeachers.length === 0 && (
                      <p className="px-4 py-2 text-sm text-gray-500">Nenhum professor ativo</p>
                    )}
                  </div>
                </>
              )}
            </div>
            <div className="relative">
              <div className="relative">
                <input
                  type="text"
                  value={
                    studentFilterOpen
                      ? studentFilterSearch
                      : selectedStudent
                        ? selectedStudent.nome
                        : 'Todos os alunos'
                  }
                  onChange={(e) => {
                    setStudentFilterSearch(e.target.value)
                    if (!studentFilterOpen) setStudentFilterOpen(true)
                  }}
                  onFocus={() => {
                    setStudentFilterOpen(true)
                    setStudentFilterSearch('')
                  }}
                  placeholder="Filtrar por aluno..."
                  className="flex items-center gap-2 pl-10 pr-4 py-2.5 rounded-xl border border-gray-200 bg-white shadow-sm hover:shadow transition-shadow text-sm font-medium text-gray-700 w-[220px] focus:ring-2 focus:ring-brand-orange/30 focus:border-brand-orange"
                  title="Digite ou selecione um aluno"
                />
                <Users className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 pointer-events-none" />
              </div>
              {studentFilterOpen && (
                <>
                  <div
                    className="fixed inset-0 z-10"
                    aria-hidden
                    onClick={() => {
                      setStudentFilterOpen(false)
                      setStudentFilterSearch('')
                    }}
                  />
                  <div className="absolute left-0 top-full mt-1 z-20 min-w-[220px] py-1 bg-white rounded-lg border border-gray-200 shadow-lg max-h-[280px] overflow-y-auto">
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedStudentId(null)
                        setStudentFilterOpen(false)
                        setStudentFilterSearch('')
                      }}
                      className={`w-full text-left px-4 py-2 text-sm ${!selectedStudentId ? 'bg-brand-orange/10 text-brand-orange font-medium' : 'text-gray-700 hover:bg-gray-100'}`}
                    >
                      Todos os alunos
                    </button>
                    {filteredStudents.map((s) => (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => {
                          setSelectedStudentId(s.id)
                          setStudentFilterOpen(false)
                          setStudentFilterSearch('')
                        }}
                        className={`w-full text-left px-4 py-2 text-sm ${selectedStudentId === s.id ? 'bg-brand-orange/10 text-brand-orange font-medium' : 'text-gray-700 hover:bg-gray-100'}`}
                      >
                        {s.tipoAula === 'GRUPO' && s.nomeGrupo ? `${s.nomeGrupo} — ${s.nome}` : s.nome}
                      </button>
                    ))}
                    {filteredStudents.length === 0 && enrollments.length > 0 && (
                      <p className="px-4 py-2 text-sm text-gray-500">Nenhum aluno encontrado</p>
                    )}
                    {enrollments.length === 0 && (
                      <p className="px-4 py-2 text-sm text-gray-500">Nenhum aluno cadastrado</p>
                    )}
                  </div>
                </>
              )}
            </div>
            <div className="flex rounded-xl overflow-hidden bg-white shadow-sm border border-gray-200">
              <button
                type="button"
                onClick={() => setView('month')}
                className={`px-4 py-2.5 text-sm font-medium transition-colors ${view === 'month' ? 'bg-brand-orange text-white shadow-sm' : 'text-gray-600 hover:bg-gray-100'}`}
              >
                Mês
              </button>
              <button
                type="button"
                onClick={() => setView('week')}
                className={`px-4 py-2.5 text-sm font-medium transition-colors ${view === 'week' ? 'bg-brand-orange text-white shadow-sm' : 'text-gray-600 hover:bg-gray-100'}`}
              >
                Semana
              </button>
              <button
                type="button"
                onClick={() => setView('day')}
                className={`px-4 py-2.5 text-sm font-medium transition-colors ${view === 'day' ? 'bg-brand-orange text-white shadow-sm' : 'text-gray-600 hover:bg-gray-100'}`}
              >
                Dia
              </button>
            </div>
            <div className="flex items-center gap-1 rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
              <Button variant="outline" size="sm" onClick={goPrev} className="p-2 rounded-none border-0 hover:bg-gray-100" title="Anterior">
                <ChevronLeft className="w-5 h-5" />
              </Button>
              <Button variant="outline" size="sm" onClick={goToday} className="min-w-[100px] rounded-none border-0 border-x border-gray-200 hover:bg-gray-50 font-medium">
                Hoje
              </Button>
              <Button variant="outline" size="sm" onClick={goNext} className="p-2 rounded-none border-0 hover:bg-gray-100" title="Próximo">
                <ChevronRight className="w-5 h-5" />
              </Button>
            </div>
            <h2 className="text-xl font-semibold text-gray-800 min-w-[200px] text-center sm:text-left">
              {titleLabel}
            </h2>
          </div>
        </div>

        {canApprovePastLessonEdits && pendingPastEditLessonIds.size > 0 ? (
          <div className="mb-4 rounded-xl border border-amber-300 bg-amber-50 text-sm text-amber-900 overflow-hidden">
            <button
              type="button"
              onClick={() => setPendingPastEditBannerOpen((open) => !open)}
              className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left hover:bg-amber-100/70 transition-colors"
            >
              <span>
                <strong>{pendingPastEditLessonIds.size}</strong> aula(s) com alteração tardia pendente de
                aprovação — clique na aula <strong>piscando</strong> no calendário ou expanda a lista para liberar.
              </span>
              <ChevronDown
                className={`w-5 h-5 shrink-0 transition-transform duration-200 ${pendingPastEditBannerOpen ? 'rotate-180' : ''}`}
                aria-hidden
              />
            </button>
            {pendingPastEditBannerOpen ? (
              <div className="border-t border-amber-200 px-4 py-3 space-y-2">
                {pendingPastEditRequests.map((req) => (
                  <div
                    key={req.id}
                    className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 rounded-lg bg-white/90 border border-amber-200 px-3 py-2.5"
                  >
                    <button
                      type="button"
                      onClick={() => setPastEditApprovalRequest(req)}
                      className="min-w-0 text-left hover:opacity-80 transition-opacity"
                    >
                      <p className="font-medium text-amber-950">
                        {req.studentName} · {req.teacherName}
                      </p>
                      <p className="text-xs text-amber-800 mt-0.5">
                        {new Date(req.lessonStartAt).toLocaleString('pt-BR', {
                          day: '2-digit',
                          month: '2-digit',
                          year: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}{' '}
                        — solicitado por {req.requestedByName}
                      </p>
                    </button>
                    <div className="flex flex-wrap gap-2 shrink-0">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setPastEditApprovalRequest(req)}
                        disabled={pastEditActionLoading}
                      >
                        Ver detalhes
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        onClick={() => void processPastEditApproval('APPROVE', req)}
                        disabled={pastEditActionLoading}
                      >
                        {pastEditActionLoading ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          'Liberar'
                        )}
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}

        {/* Cubos: semana segunda a sábado + novos matriculados (estilo financeiro) */}
        <div className="mb-8 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-4 xl:grid-cols-8 gap-3">
          <div
            role="button"
            tabIndex={0}
            onClick={() => setListModal({ title: 'Novos alunos matriculados', type: 'novosMatriculados' })}
            onKeyDown={(e) => e.key === 'Enter' && setListModal({ title: 'Novos alunos matriculados', type: 'novosMatriculados' })}
            className="cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-brand-orange rounded-xl transition-transform hover:scale-[1.02] active:scale-[0.99] min-h-0"
          >
            <StatCard
              variant="finance"
              title="Novos alunos matriculados"
              value={novosMatriculadosCount}
              icon={<UserPlus className="w-5 h-5" />}
              color="blue"
              subtitle="Clique para ver, marcar «enviei link pag» e «tudo feito»"
            />
          </div>
          <div
            role="button"
            tabIndex={0}
            onClick={() => setListModal({ title: 'Aulas confirmadas', type: 'confirmed' })}
            onKeyDown={(e) => e.key === 'Enter' && setListModal({ title: 'Aulas confirmadas', type: 'confirmed' })}
            className="cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-brand-orange rounded-xl transition-transform hover:scale-[1.02] active:scale-[0.99] min-h-0"
          >
            <StatCard variant="finance" title="Confirmadas" value={stats?.confirmed ?? 0} icon={<CheckCircle className="w-5 h-5" />} color="green" />
          </div>
          <div
            role="button"
            tabIndex={0}
            onClick={() => setListModal({ title: 'Aulas canceladas', type: 'cancelled' })}
            onKeyDown={(e) => e.key === 'Enter' && setListModal({ title: 'Aulas canceladas', type: 'cancelled' })}
            className="cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-brand-orange rounded-xl transition-transform hover:scale-[1.02] active:scale-[0.99] min-h-0"
          >
            <StatCard variant="finance" title="Canceladas" value={stats?.cancelled ?? 0} icon={<XCircle className="w-5 h-5" />} color="red" />
          </div>
          <div
            role="button"
            tabIndex={0}
            onClick={() => setListModal({ title: 'Reposições', type: 'reposicao' })}
            onKeyDown={(e) => e.key === 'Enter' && setListModal({ title: 'Reposições', type: 'reposicao' })}
            className="cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-brand-orange rounded-xl transition-transform hover:scale-[1.02] active:scale-[0.99] min-h-0"
          >
            <StatCard variant="finance" title="Reposições" value={stats?.reposicao ?? 0} icon={<RotateCcw className="w-5 h-5" />} color="orange" />
          </div>
          <div
            role="button"
            tabIndex={0}
            onClick={() => setListModal({ title: 'Alunos ativos com total de aulas incorreto na semana', type: 'wrongFrequency' })}
            onKeyDown={(e) => e.key === 'Enter' && setListModal({ title: 'Alunos ativos com total de aulas incorreto na semana', type: 'wrongFrequency' })}
            className="cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-brand-orange rounded-xl transition-transform hover:scale-[1.02] active:scale-[0.99] min-h-0"
          >
            <StatCard
              variant="finance"
              title="Freq. incorreta (ativos)"
              value={stats?.wrongFrequencyCount ?? 0}
              icon={<AlertTriangle className="w-5 h-5" />}
              color="orange"
              subtitle="Total de aulas na semana (seg–sáb) vs. frequência cadastrada"
            />
          </div>
          <div
            role="button"
            tabIndex={0}
            onClick={() => setListModal({ title: 'Erros professores', type: 'teacherErrors' })}
            onKeyDown={(e) => e.key === 'Enter' && setListModal({ title: 'Erros professores', type: 'teacherErrors' })}
            className="cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-brand-orange rounded-xl transition-transform hover:scale-[1.02] active:scale-[0.99] min-h-0"
          >
            <StatCard
              variant="finance"
              title="Erros professores"
              value={stats?.teacherErrorsCount ?? 0}
              icon={<AlertTriangle className="w-5 h-5" />}
              color="red"
              subtitle="Sobreposição ou professor inativo com aula"
            />
          </div>
          <div
            role="button"
            tabIndex={0}
            onClick={() => setRescheduledLessonsModalOpen(true)}
            onKeyDown={(e) => e.key === 'Enter' && setRescheduledLessonsModalOpen(true)}
            className="cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-brand-orange rounded-xl transition-transform hover:scale-[1.02] active:scale-[0.99] min-h-0"
          >
            <StatCard
              variant="finance"
              title="Aulas reagendadas pelos alunos"
              value={studentRescheduledLessons.filter((l) => !viewedRescheduledLessons.has(l.id)).length}
              icon={<RotateCcw className="w-5 h-5" />}
              color="blue"
            />
          </div>
          <div
            role="button"
            tabIndex={0}
            onClick={() => setTransferRequestsModalOpen(true)}
            onKeyDown={(e) => e.key === 'Enter' && setTransferRequestsModalOpen(true)}
            className="cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-brand-orange rounded-xl transition-transform hover:scale-[1.02] active:scale-[0.99] min-h-0"
          >
            <StatCard
              variant="finance"
              title="Solicitação de trocas de aulas"
              value={pendingTransferRequests.length}
              icon={<AlertTriangle className="w-5 h-5" />}
              color="purple"
            />
          </div>
        </div>

        {selectedTeacher && (
          <p className="mb-4 text-sm text-slate-600 bg-white/80 rounded-xl px-4 py-2 border border-slate-200/80 shadow-sm">
            Exibindo apenas aulas de <strong>{selectedTeacher.nome}</strong>. Altere em &quot;Ver por professor&quot; para ver todos.
          </p>
        )}

        {loading && (
          <SeidmannLoading message="Carregando calendário..." variant="compact" className="mb-6" />
        )}

        {/* Visualização mensal */}
        {view === 'month' && (
          <div className="bg-white rounded-2xl border border-slate-200/80 shadow-lg overflow-hidden">
            <div className="grid grid-cols-7 border-b border-slate-200 bg-slate-50/80">
              {DIAS_SEMANA.map((dia, idx) => (
                <div
                  key={dia}
                  className={`py-3 text-center text-xs font-semibold uppercase tracking-wider ${idx === 0 ? 'text-red-600 bg-red-50/80' : 'text-slate-600'}`}
                >
                  {dia}
                </div>
              ))}
            </div>
            <div className="grid grid-cols-7">
              {monthGrid.map((week, wi) =>
                week.map((day, di) => {
                  const otherMonth = !isSameMonth(day, currentDate)
                  const today = isToday(day)
                  const dayLessons = getLessonsForDay(day)
                  const isHoliday = holidays.has(toDateKey(day))
                  const isPendingHoliday = pendingHolidays.has(toDateKey(day))
                  const isPendingApprovedByMe = pendingHolidaysApprovedByMe.has(toDateKey(day))
                  const isSunday = day.getDay() === 0
                  const showDayActions = !otherMonth && !isSunday
                  return (
                    <div
                      key={`${wi}-${di}`}
                      className={`min-h-[110px] sm:min-h-[130px] border-b border-r border-slate-100 p-2 transition-colors ${
                        otherMonth ? 'bg-slate-50/40' : isHoliday ? 'bg-amber-50/80' : isPendingHoliday ? 'bg-amber-50/60 animate-pulse' : di === 0 ? 'bg-red-50/50' : 'bg-white hover:bg-slate-50/50'
                      } ${di === 6 ? 'border-r-0' : ''}`}
                    >
                      <div className="flex items-center justify-between">
                        <span
                          className={`inline-flex items-center justify-center w-8 h-8 rounded-full text-sm font-medium transition-colors ${
                            today ? 'bg-brand-orange text-white shadow-md ring-2 ring-brand-orange/30' : otherMonth ? 'text-slate-400' : di === 0 ? 'text-red-600' : 'text-slate-700'
                          }`}
                        >
                          {day.getDate()}
                        </span>
                        {showDayActions && (
                          <button
                            type="button"
                            onClick={() => openNewLesson(day)}
                            className="text-xs font-medium text-brand-orange hover:bg-brand-orange/10 px-2 py-1 rounded-lg transition-colors"
                          >
                            + Aula
                          </button>
                        )}
                      </div>
                      {showDayActions && (
                        <div className="mt-0.5">
                          <button
                            type="button"
                            onClick={() => toggleHoliday(day, isPendingHoliday && isPendingApprovedByMe ? 'cancel' : 'approve')}
                            disabled={holidayLoading === toDateKey(day)}
                            className={`text-[10px] flex items-center gap-0.5 ${isHoliday ? 'text-amber-700 hover:underline' : isPendingHoliday ? 'text-amber-700 animate-pulse hover:underline' : 'text-gray-500 hover:text-amber-600 hover:underline'}`}
                            title={isHoliday ? 'Cancelar feriado' : isPendingHoliday ? (isPendingApprovedByMe ? 'Cancelar solicitação' : 'Aprovar feriado') : 'Definir feriado'}
                          >
                            {holidayLoading === toDateKey(day) ? (
                              <Loader2 className="w-3 h-3 animate-spin" />
                            ) : (
                              <CalendarOff className="w-3 h-3" />
                            )}
                            {isHoliday ? 'Cancelar feriado' : isPendingHoliday ? (isPendingApprovedByMe ? 'Cancelar pedido' : 'Aprovar feriado') : 'Definir feriado'}
                          </button>
                          {isPendingHoliday && !isPendingApprovedByMe && (
                            <button
                              type="button"
                              onClick={() => toggleHoliday(day, 'deny')}
                              disabled={holidayLoading === toDateKey(day)}
                              className="ml-2 text-[10px] text-red-600 hover:underline disabled:opacity-60"
                              title="Negar solicitação de feriado"
                            >
                              Negar
                            </button>
                          )}
                        </div>
                      )}
                      <div className="mt-1.5 space-y-1">
                        {dayLessons.slice(0, 3).map((l) => renderLessonCalendarBlock(l, 'month'))}
                        {dayLessons.length > 3 && (
                          <span className="text-xs font-medium text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">+{dayLessons.length - 3}</span>
                        )}
                      </div>
                    </div>
                  )
                })
              )}
            </div>
          </div>
        )}

        {/* Visualização semanal */}
        {view === 'week' && (
          <div className="bg-white rounded-2xl border border-slate-200/80 shadow-lg overflow-hidden">
            <div className="grid grid-cols-8 border-b border-slate-200 bg-slate-50/80">
              <div className="py-3 text-xs font-semibold text-slate-600 border-r border-slate-200 pl-3">Horário</div>
              {Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)).map((d) => {
                const isSunday = d.getDay() === 0
                const isHoliday = holidays.has(toDateKey(d))
                const isPendingHoliday = pendingHolidays.has(toDateKey(d))
                const isPendingApprovedByMe = pendingHolidaysApprovedByMe.has(toDateKey(d))
                return (
                  <div
                    key={d.toISOString()}
                    className={`py-3 text-center text-xs font-semibold ${isSunday ? 'text-red-600 bg-red-50/80' : isHoliday ? 'text-amber-700 bg-amber-50/80' : isPendingHoliday ? 'text-amber-700 bg-amber-50/60 animate-pulse' : isToday(d) ? 'text-brand-orange bg-orange-50' : 'text-slate-600'}`}
                  >
                    <div>{DIAS_SEMANA[d.getDay()]}</div>
                    <div className="font-normal">{d.getDate()}</div>
                    {!isSunday && (
                      <>
                        <button
                          type="button"
                          onClick={() => toggleHoliday(d, isPendingHoliday && isPendingApprovedByMe ? 'cancel' : 'approve')}
                          disabled={holidayLoading === toDateKey(d)}
                          className={`mt-1 text-[10px] hover:underline flex items-center justify-center gap-0.5 w-full ${isHoliday ? 'text-amber-700' : isPendingHoliday ? 'text-amber-700 animate-pulse' : 'text-gray-500 hover:text-amber-600'}`}
                          title={isHoliday ? 'Cancelar feriado' : isPendingHoliday ? (isPendingApprovedByMe ? 'Cancelar solicitação' : 'Aprovar feriado') : 'Definir feriado'}
                        >
                          {holidayLoading === toDateKey(d) ? <Loader2 className="w-3 h-3 animate-spin" /> : <CalendarOff className="w-3 h-3" />}
                          {isHoliday ? 'Cancelar feriado' : isPendingHoliday ? (isPendingApprovedByMe ? 'Cancelar pedido' : 'Aprovar') : 'Feriado'}
                        </button>
                        {isPendingHoliday && !isPendingApprovedByMe && (
                          <button
                            type="button"
                            onClick={() => toggleHoliday(d, 'deny')}
                            disabled={holidayLoading === toDateKey(d)}
                            className="mt-1 text-[10px] text-red-600 hover:underline"
                            title="Negar solicitação de feriado"
                          >
                            Negar
                          </button>
                        )}
                      </>
                    )}
                  </div>
                )
              })}
            </div>
            <div className="max-h-[70vh] overflow-y-auto">
              {timeSlots.map((slot) => (
                <div key={`${slot.hour}-${slot.minute}`} className="grid grid-cols-8 border-b border-slate-100 min-h-[44px]">
                  <div className="py-1.5 pl-3 text-xs text-slate-500 border-r border-slate-100 font-medium">
                    {formatSlotLabel(slot)}
                  </div>
                  {Array.from({ length: 7 }, (_, i) => {
                    const d = addDays(weekStart, i)
                    const isSunday = d.getDay() === 0
                    const isHoliday = holidays.has(toDateKey(d))
                    const slotLessons = getLessonsIntersectingSlot(d, slot.hour, slot.minute)
                    const teacherSlotBad =
                      selectedTeacherId &&
                      !isTeacherAvailableAtSlot(d, slot.hour, slot.minute, 60)
                    const slotBlocked = slotBlockedForNewLessonByFilter(d, slot.hour, slot.minute)
                    return (
                      <div
                        key={i}
                        className={`border-r border-slate-100 last:border-r-0 p-1 flex flex-col gap-0.5 ${isSunday ? 'bg-red-50/50' : isHoliday ? 'bg-amber-50/50' : ''}`}
                      >
                        {!isSunday && (
                          <>
                            {teacherSlotBad ? (
                              <span className="text-[10px] text-gray-400 italic">Não disponível</span>
                            ) : slotBlocked ? (
                              <span
                                className="text-[10px] text-amber-700 italic"
                                title="Horário coberto por aula existente (filtro de professor ou aluno)"
                              >
                                Ocupado
                              </span>
                            ) : (
                              <button
                                type="button"
                                onClick={() => {
                                  const start = new Date(d)
                                  start.setHours(slot.hour, slot.minute, 0, 0)
                                  openNewLesson(start)
                                }}
                                className="text-[10px] text-gray-400 hover:text-brand-orange hover:underline"
                              >
                                + Aula
                              </button>
                            )}
                          </>
                        )}
                        {slotLessons.map((l) => renderLessonCalendarBlock(l, 'week'))}
                      </div>
                    )
                  })}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Visualização do dia */}
        {view === 'day' && (
          <div className="bg-white rounded-2xl border border-slate-200/80 shadow-lg overflow-hidden">
            <div
              className={`border-b border-slate-200 px-5 py-3 text-sm font-semibold flex items-center justify-between flex-wrap gap-2 ${
                currentDate.getDay() === 0
                  ? 'bg-red-50/80 text-red-700'
                  : holidays.has(toDateKey(currentDate))
                    ? 'bg-amber-50/80 text-amber-800'
                    : pendingHolidays.has(toDateKey(currentDate))
                      ? 'bg-amber-50/60 text-amber-800 animate-pulse'
                      : 'bg-slate-50/80 text-slate-700'
              }`}
            >
              <span>{DIAS_SEMANA[currentDate.getDay()]} – {currentDate.getDate()} {MESES[currentDate.getMonth()]}</span>
              {currentDate.getDay() !== 0 && (
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => toggleHoliday(currentDate, pendingHolidays.has(toDateKey(currentDate)) && pendingHolidaysApprovedByMe.has(toDateKey(currentDate)) ? 'cancel' : 'approve')}
                    disabled={holidayLoading === toDateKey(currentDate)}
                    className={`text-xs font-normal flex items-center gap-1 hover:underline ${
                      holidays.has(toDateKey(currentDate))
                        ? 'text-amber-700'
                        : pendingHolidays.has(toDateKey(currentDate))
                          ? 'text-amber-700 animate-pulse'
                          : 'text-gray-600 hover:text-amber-700'
                    }`}
                    title={
                      holidays.has(toDateKey(currentDate))
                        ? 'Cancelar feriado'
                        : pendingHolidays.has(toDateKey(currentDate))
                          ? (pendingHolidaysApprovedByMe.has(toDateKey(currentDate)) ? 'Cancelar solicitação' : 'Aprovar feriado')
                          : 'Definir feriado'
                    }
                  >
                    {holidayLoading === toDateKey(currentDate) ? <Loader2 className="w-3 h-3 animate-spin" /> : <CalendarOff className="w-3 h-3" />}
                    {holidays.has(toDateKey(currentDate))
                      ? 'Cancelar feriado'
                      : pendingHolidays.has(toDateKey(currentDate))
                        ? (pendingHolidaysApprovedByMe.has(toDateKey(currentDate)) ? 'Cancelar pedido' : 'Aprovar feriado')
                        : 'Definir feriado'}
                  </button>
                  {pendingHolidays.has(toDateKey(currentDate)) && !pendingHolidaysApprovedByMe.has(toDateKey(currentDate)) && (
                    <button
                      type="button"
                      onClick={() => toggleHoliday(currentDate, 'deny')}
                      disabled={holidayLoading === toDateKey(currentDate)}
                      className="text-xs font-normal text-red-600 hover:underline"
                      title="Negar solicitação de feriado"
                    >
                      Negar
                    </button>
                  )}
                </div>
              )}
            </div>
            <div
              className={`max-h-[70vh] overflow-y-auto ${
                currentDate.getDay() === 0
                  ? 'bg-red-50/20'
                  : holidays.has(toDateKey(currentDate))
                    ? 'bg-amber-50/20'
                    : pendingHolidays.has(toDateKey(currentDate))
                      ? 'bg-amber-50/10 animate-pulse'
                      : ''
              }`}
            >
              {timeSlots.map((slot) => {
                const slotLessons = getLessonsIntersectingSlot(currentDate, slot.hour, slot.minute)
                const teacherSlotBad =
                  selectedTeacherId &&
                  !isTeacherAvailableAtSlot(currentDate, slot.hour, slot.minute, 60)
                const slotBlocked = slotBlockedForNewLessonByFilter(
                  currentDate,
                  slot.hour,
                  slot.minute
                )
                const isSunday = currentDate.getDay() === 0
                const isHoliday = holidays.has(toDateKey(currentDate))
                return (
                  <div key={`${slot.hour}-${slot.minute}`} className="flex border-b border-slate-100 min-h-[52px]">
                    <div className="w-16 shrink-0 py-2 pl-3 text-xs text-slate-500 border-r border-slate-100 font-medium">
                      {formatSlotLabel(slot)}
                    </div>
                    <div className="flex-1 p-2 flex flex-col gap-1">
                      {!isSunday && (
                        <>
                          {teacherSlotBad ? (
                            <span className="text-xs text-gray-400 italic">Não disponível</span>
                          ) : slotBlocked ? (
                            <span
                              className="text-xs text-amber-700 italic"
                              title="Horário coberto por aula existente (filtro de professor ou aluno)"
                            >
                              Ocupado
                            </span>
                          ) : (
                            <button
                              type="button"
                              onClick={() => {
                                const start = new Date(currentDate)
                                start.setHours(slot.hour, slot.minute, 0, 0)
                                openNewLesson(start)
                              }}
                              className="text-xs text-gray-400 hover:text-brand-orange hover:underline w-fit"
                            >
                              + Adicionar aula
                            </button>
                          )}
                        </>
                      )}
                      {slotLessons.map((l) => renderLessonCalendarBlock(l, 'day'))}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Modal Nova/Editar aula */}
        <Modal
          isOpen={lessonModalOpen}
          onClose={() => {
            setLessonModalOpen(false)
            setLessonProfessorDropdownOpen(false)
            setLessonAlunoDropdownOpen(false)
            setLessonStatusDropdownOpen(false)
            setLessonAlunoSearch('')
            setLessonProfessorSearch('')
            setLessonStatusSearch('')
            setAgendarReposicao(false)
            setReposicaoForm({ startAt: '', teacherId: '', durationMinutes: 30 })
            setReposicaoProfessorDropdownOpen(false)
            setReposicaoProfessorSearch('')
          }}
          title={editingLesson ? 'Editar aula' : 'Nova aula'}
          size="md"
          footer={
            <>
              {editingLesson && (
                <div className="mr-auto flex flex-wrap items-center gap-2">
                  {editingLesson.status === 'CONFIRMED' && (
                    <Button
                      variant="outline"
                      onClick={() => void handleCancelLesson()}
                      className="text-red-600 border-red-200 hover:bg-red-50"
                      disabled={savingLesson || deletingLesson}
                    >
                      <XCircle className="w-4 h-4 mr-1" />
                      Cancelar aula
                    </Button>
                  )}
                  <Button
                    variant="outline"
                    onClick={openDeleteLessonModal}
                    className="text-red-600 border-red-200 hover:bg-red-50"
                    disabled={savingLesson || deletingLesson}
                  >
                    <Trash2 className="w-4 h-4 mr-1" />
                    Excluir aula
                  </Button>
                </div>
              )}
              <Button
                variant="outline"
                onClick={() => {
                  setLessonModalOpen(false)
                  setLessonProfessorDropdownOpen(false)
                  setLessonAlunoDropdownOpen(false)
                  setLessonStatusDropdownOpen(false)
                  setAgendarReposicao(false)
                  setReposicaoForm({ startAt: '', teacherId: '', durationMinutes: 30 })
                  setReposicaoProfessorDropdownOpen(false)
                  setReposicaoProfessorSearch('')
                }}
                disabled={savingLesson}
              >
                Cancelar
              </Button>
              <Button variant="primary" onClick={() => void handleSaveLesson({ preventDefault: () => {} } as React.FormEvent)} disabled={savingLesson}>
                {savingLesson ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Salvando...
                  </>
                ) : editingLesson ? (
                  'Salvar'
                ) : (
                  'Criar'
                )}
              </Button>
            </>
          }
        >
          {editingLesson && needsPastEditRequest(editingLesson) ? (
            <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
              Esta aula é de um dia anterior. Ao salvar, será enviada uma{' '}
              <strong>solicitação de aprovação</strong> para um administrador autorizado.
            </div>
          ) : null}
          <form onSubmit={handleSaveLesson} className="space-y-4">
            {/* Aluno – combobox (digitar + lista) */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">Aluno *</label>
              <div className="relative">
                <input
                  type="text"
                  value={
                    lessonAlunoDropdownOpen
                      ? lessonAlunoSearch
                      : studentOptions.find((o) => o.value === lessonForm.enrollmentId)?.label ?? ''
                  }
                  onChange={(e) => {
                    setLessonAlunoSearch(e.target.value)
                    if (!lessonAlunoDropdownOpen) setLessonAlunoDropdownOpen(true)
                  }}
                  onFocus={() => setLessonAlunoDropdownOpen(true)}
                  placeholder="Digite ou selecione o aluno"
                  className="input w-full"
                  autoComplete="off"
                />
                {lessonAlunoDropdownOpen && (
                  <>
                    <div
                      className="fixed inset-0 z-10"
                      aria-hidden
                      onClick={() => setLessonAlunoDropdownOpen(false)}
                    />
                    <div className="absolute left-0 right-0 top-full mt-1 z-20 py-1 bg-white rounded-lg border border-gray-200 shadow-lg max-h-[220px] overflow-y-auto">
                      {studentOptions
                        .filter(
                          (opt) =>
                            !lessonAlunoSearch.trim() ||
                            opt.label.toLowerCase().includes(lessonAlunoSearch.toLowerCase())
                        )
                        .map((opt) => (
                          <button
                            key={opt.value}
                            type="button"
                            onClick={() => {
                              if (opt.disabled) return
                              const enrollment = enrollments.find((e) => e.id === opt.value)
                              const duration =
                                enrollment?.tempoAulaMinutos != null ? enrollment.tempoAulaMinutos : 30
                              setLessonForm({
                                ...lessonForm,
                                enrollmentId: opt.value,
                                durationMinutes: duration,
                              })
                              setLessonAlunoSearch('')
                              setLessonAlunoDropdownOpen(false)
                            }}
                            disabled={opt.disabled}
                            className={`w-full text-left px-3 py-2 text-sm hover:bg-gray-100 ${
                              opt.disabled ? 'cursor-not-allowed opacity-60 hover:bg-white' : ''
                            }`}
                          >
                            {opt.label}
                          </button>
                        ))}
                      {studentOptions.filter(
                        (opt) =>
                          !lessonAlunoSearch.trim() ||
                          opt.label.toLowerCase().includes(lessonAlunoSearch.toLowerCase())
                      ).length === 0 && (
                        <p className="px-3 py-2 text-sm text-gray-500">Nenhum aluno encontrado.</p>
                      )}
                    </div>
                  </>
                )}
              </div>
            </div>
            {/* Professor – combobox (digitar para filtrar + lista, indisponível com mensagem) */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">Professor *</label>
              <div className="relative">
                <input
                  type="text"
                  value={
                    lessonProfessorDropdownOpen
                      ? lessonProfessorSearch
                      : (() => {
                          const t = activeTeachers.find((x) => x.id === lessonForm.teacherId)
                          if (!t) return ''
                          const unav = teacherAvailabilities != null && teacherAvailabilities[t.id] === false
                          const conflict = teacherConflicts[t.id]
                          const label = getTeacherLanguageLabel(t.idiomasFala ?? [], t.idiomasEnsina ?? [])
                          if (unav && conflict) return `${t.nome}${label} (já tem aula nesse horário com ${conflict})`
                          if (unav) return `${t.nome}${label} (Indisponível)`
                          return `${t.nome}${label}`
                        })()
                  }
                  onChange={(e) => {
                    setLessonProfessorSearch(e.target.value)
                    if (!lessonProfessorDropdownOpen) setLessonProfessorDropdownOpen(true)
                  }}
                  onFocus={() => setLessonProfessorDropdownOpen(true)}
                  placeholder="Digite ou selecione o professor"
                  className="input w-full"
                  autoComplete="off"
                />
                <button
                  type="button"
                  onClick={() => setLessonProfessorDropdownOpen((v) => !v)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400"
                >
                  <ChevronRight
                    className={`w-4 h-4 transition-transform ${lessonProfessorDropdownOpen ? 'rotate-90' : ''}`}
                  />
                </button>
                {lessonProfessorDropdownOpen && (
                  <>
                    <div
                      className="fixed inset-0 z-10"
                      aria-hidden
                      onClick={() => setLessonProfessorDropdownOpen(false)}
                    />
                    <div className="absolute left-0 right-0 top-full mt-1 z-20 py-1 bg-white rounded-lg border border-gray-200 shadow-lg max-h-[240px] overflow-y-auto">
                      {activeTeachers
                        .filter(
                          (t) =>
                            !lessonProfessorSearch.trim() ||
                            t.nome.toLowerCase().includes(lessonProfessorSearch.toLowerCase())
                        )
                        .map((t) => {
                          const unavailable = teacherAvailabilities != null && teacherAvailabilities[t.id] === false
                          const conflictMsg = teacherConflicts[t.id]
                          const label = getTeacherLanguageLabel(t.idiomasFala ?? [], t.idiomasEnsina ?? [])
                          const teachesEn = (t.idiomasEnsina ?? []).includes('INGLES')
                          const teachesEs = (t.idiomasEnsina ?? []).includes('ESPANHOL')
                          const nameColor =
                            teachesEn && teachesEs
                              ? 'text-blue-600'
                              : teachesEn
                                ? 'text-blue-600 font-medium'
                                : teachesEs
                                  ? 'text-amber-600 font-medium'
                                  : 'text-gray-800'
                          return (
                            <button
                              key={t.id}
                              type="button"
                              disabled={unavailable}
                              onClick={() => {
                                setLessonForm({ ...lessonForm, teacherId: t.id })
                                setLessonProfessorSearch('')
                                setLessonProfessorDropdownOpen(false)
                              }}
                              className={`w-full text-left px-3 py-2 text-sm ${unavailable ? 'opacity-60 cursor-not-allowed' : 'hover:bg-gray-100'}`}
                            >
                              <span className={nameColor}>{t.nome}</span>
                              {label && <span className="text-gray-500 font-normal">{label}</span>}
                              {unavailable && (
                                <span className="text-gray-500 block text-xs mt-0.5">
                                  {conflictMsg
                                    ? `(já tem aula nesse horário com ${conflictMsg})`
                                    : '(Indisponível)'}
                                </span>
                              )}
                            </button>
                          )
                        })}
                      {activeTeachers.filter(
                        (t) =>
                          !lessonProfessorSearch.trim() ||
                          t.nome.toLowerCase().includes(lessonProfessorSearch.toLowerCase())
                      ).length === 0 && (
                        <p className="px-3 py-2 text-sm text-gray-500">Nenhum professor encontrado.</p>
                      )}
                    </div>
                  </>
                )}
              </div>
              {lessonForm.teacherId && (() => {
                const t = teachers.find((x) => x.id === lessonForm.teacherId)
                const falaPt = t && (t.idiomasFala ?? []).includes('PORTUGUES')
                if (!t) return null
                const isOneStar = t.nota === 1
                return (
                  <>
                    {isOneStar && (
                      <p className="text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2 text-sm mt-2 flex items-center gap-2">
                        <AlertTriangle className="w-4 h-4 shrink-0" />
                        Atenção: esse é um professor 1 estrela!
                      </p>
                    )}
                    {!falaPt && (
                      <p className="text-amber-700 bg-amber-50 border border-amber-200 rounded px-3 py-2 text-sm mt-2 flex items-center gap-2">
                        <AlertTriangle className="w-4 h-4 shrink-0" />
                        Atenção: esse professor não fala português.
                      </p>
                    )}
                  </>
                )
              })()}
              {lessonForm.startAt && teacherAvailabilities != null && (
                <p className="text-xs text-gray-500 mt-1">
                  Por padrão todos estão disponíveis. Quem tem horários cadastrados só aparece disponível nesses horários. Quem já tem aula no horário aparece como indisponível.
                </p>
              )}
            </div>
            {/* Status – combobox (digitar + lista) */}
            {(() => {
              const statusOpcoesBase: { value: LessonStatusUi; label: string }[] = [
                { value: 'CONFIRMED', label: LESSON_STATUS_LABELS.CONFIRMED },
                { value: 'CANCELLED', label: LESSON_STATUS_LABELS.CANCELLED },
                { value: 'CANCELLED_BY_TEACHER', label: LESSON_STATUS_LABELS.CANCELLED_BY_TEACHER },
                { value: 'CANCELLED_NO_REPLACEMENT', label: LESSON_STATUS_LABELS.CANCELLED_NO_REPLACEMENT },
              ]
              const mostrarOpcaoReposicao =
                lessonForm.status === 'REPOSICAO' ||
                lessonCancelledStatusAllowsReposicao(lessonForm.status)
              const STATUS_OPCOES: { value: LessonStatusUi; label: string }[] = mostrarOpcaoReposicao
                ? [
                    ...statusOpcoesBase,
                    { value: 'REPOSICAO', label: LESSON_STATUS_LABELS.REPOSICAO },
                  ]
                : statusOpcoesBase
              const filteredStatus = !lessonStatusSearch.trim()
                ? STATUS_OPCOES
                : STATUS_OPCOES.filter((o) =>
                    o.label.toLowerCase().includes(lessonStatusSearch.toLowerCase())
                  )
              return (
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">Status</label>
                  <div className="relative">
                    <input
                      type="text"
                      value={
                        lessonStatusDropdownOpen
                          ? lessonStatusSearch
                          : STATUS_OPCOES.find((o) => o.value === lessonForm.status)?.label ??
                            LESSON_STATUS_LABELS[lessonForm.status] ??
                            ''
                      }
                      onChange={(e) => {
                        setLessonStatusSearch(e.target.value)
                        if (!lessonStatusDropdownOpen) setLessonStatusDropdownOpen(true)
                      }}
                      onFocus={() => setLessonStatusDropdownOpen(true)}
                      placeholder="Digite ou selecione"
                      className="input w-full"
                      autoComplete="off"
                    />
                    {lessonStatusDropdownOpen && (
                      <>
                        <div
                          className="fixed inset-0 z-10"
                          aria-hidden
                          onClick={() => setLessonStatusDropdownOpen(false)}
                        />
                        <div className="absolute left-0 right-0 top-full mt-1 z-20 py-1 bg-white rounded-lg border border-gray-200 shadow-lg">
                          {filteredStatus.map((opt) => (
                            <button
                              key={opt.value}
                              type="button"
                              onClick={() => {
                                const newStatus = opt.value
                                setLessonForm({ ...lessonForm, status: newStatus })
                                setLessonStatusSearch('')
                                setLessonStatusDropdownOpen(false)
                                if (!lessonCancelledStatusAllowsReposicao(newStatus)) {
                                  setAgendarReposicao(false)
                                  setReposicaoForm({
                                    startAt: '',
                                    teacherId: '',
                                    durationMinutes: lessonForm.durationMinutes,
                                  })
                                }
                              }}
                              className="w-full text-left px-3 py-2 text-sm hover:bg-gray-100"
                            >
                              {opt.label}
                            </button>
                          ))}
                        </div>
                      </>
                    )}
                  </div>
                </div>
              )
            })()}
            {/* Opção de agendar reposição quando cancelar */}
            {lessonCancelledStatusAllowsReposicao(lessonForm.status) && (
              <div className="space-y-3 pt-2 border-t border-gray-200">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={agendarReposicao}
                    onChange={(e) => {
                      setAgendarReposicao(e.target.checked)
                      if (!e.target.checked) {
                        setReposicaoForm({ startAt: '', teacherId: '', durationMinutes: lessonForm.durationMinutes })
                      }
                    }}
                    className="rounded border-gray-300"
                  />
                  <span className="text-sm font-medium text-gray-700">Agendar reposição</span>
                </label>
                {agendarReposicao && (
                  <div className="space-y-3 pl-6 border-l-2 border-blue-200">
                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-1">Data e hora da reposição *</label>
                      <input
                        type="datetime-local"
                        value={reposicaoForm.startAt}
                        onChange={(e) => setReposicaoForm({ ...reposicaoForm, startAt: e.target.value })}
                        className="input w-full"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-1">Professor da reposição *</label>
                      <div className="relative">
                        <input
                          type="text"
                          value={
                            reposicaoProfessorDropdownOpen
                              ? reposicaoProfessorSearch
                              : teachers.find((t) => t.id === reposicaoForm.teacherId)?.nome ?? ''
                          }
                          onChange={(e) => {
                            setReposicaoProfessorSearch(e.target.value)
                            if (!reposicaoProfessorDropdownOpen) setReposicaoProfessorDropdownOpen(true)
                          }}
                          onFocus={() => setReposicaoProfessorDropdownOpen(true)}
                          placeholder="Digite ou selecione"
                          className="input w-full"
                          autoComplete="off"
                        />
                        {reposicaoProfessorDropdownOpen && (
                          <>
                            <div
                              className="fixed inset-0 z-10"
                              aria-hidden
                              onClick={() => {
                                setReposicaoProfessorDropdownOpen(false)
                                setReposicaoProfessorSearch('')
                              }}
                            />
                            <div className="absolute left-0 right-0 top-full mt-1 z-20 max-h-60 overflow-y-auto py-1 bg-white rounded-lg border border-gray-200 shadow-lg">
                              {activeTeachers
                                .filter((t) =>
                                  !reposicaoProfessorSearch.trim() ||
                                  t.nome.toLowerCase().includes(reposicaoProfessorSearch.toLowerCase())
                                )
                                .map((t) => {
                                  const disponivel =
                                    reposicaoTeacherAvailabilities == null
                                      ? true
                                      : reposicaoTeacherAvailabilities[t.id] !== false
                                  const motivo = reposicaoTeacherConflicts[t.id]
                                  return (
                                    <button
                                      key={t.id}
                                      type="button"
                                      onClick={() => {
                                        setReposicaoForm({ ...reposicaoForm, teacherId: t.id })
                                        setReposicaoProfessorSearch('')
                                        setReposicaoProfessorDropdownOpen(false)
                                      }}
                                      disabled={!disponivel}
                                      className={`w-full text-left px-3 py-2 text-sm hover:bg-gray-100 ${
                                        !disponivel ? 'opacity-50 cursor-not-allowed' : ''
                                      }`}
                                    >
                                      <div className="flex items-center justify-between">
                                        <span>{t.nome}</span>
                                        {!disponivel && motivo && (
                                          <span className="text-xs text-red-600 ml-2">{motivo}</span>
                                        )}
                                      </div>
                                    </button>
                                  )
                                })}
                            </div>
                          </>
                        )}
                      </div>
                      {reposicaoForm.startAt && reposicaoTeacherAvailabilities != null && (
                        <p className="text-xs text-gray-500 mt-1">
                          Por padrão todos estão disponíveis. Quem tem horários cadastrados só aparece disponível nesses horários. Quem já tem aula no horário aparece como indisponível.
                        </p>
                      )}
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-1">Duração da reposição (min)</label>
                      <input
                        type="number"
                        min={15}
                        step={15}
                        value={reposicaoForm.durationMinutes}
                        onChange={(e) =>
                          setReposicaoForm({ ...reposicaoForm, durationMinutes: Number(e.target.value) || 30 })
                        }
                        className="input w-full"
                      />
                    </div>
                  </div>
                )}
              </div>
            )}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">Data e hora *</label>
              <input
                type="datetime-local"
                value={lessonForm.startAt}
                onChange={(e) => setLessonForm({ ...lessonForm, startAt: e.target.value })}
                className="input w-full"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">Duração (min)</label>
              <input
                type="number"
                min={15}
                step={15}
                value={lessonForm.durationMinutes}
                onChange={(e) => {
                  const newVal = Number(e.target.value) || 30
                  const enrollment = lessonForm.enrollmentId ? enrollments.find((en) => en.id === lessonForm.enrollmentId) : null
                  const cadastro = enrollment?.tempoAulaMinutos ?? null
                  setLessonForm({ ...lessonForm, durationMinutes: newVal })
                  if (cadastro != null && newVal !== cadastro) {
                    setDurationConfirmCadastroMin(cadastro)
                    setShowDurationConfirm(true)
                    durationConfirmDidKeepRef.current = false
                  }
                }}
                className="input w-full"
              />
              {showDurationConfirm && (
                <ConfirmModal
                  isOpen={showDurationConfirm}
                  onClose={() => {
                    if (!durationConfirmDidKeepRef.current) {
                      setLessonForm((prev) => ({ ...prev, durationMinutes: durationConfirmCadastroMin }))
                    }
                    setShowDurationConfirm(false)
                    durationConfirmDidKeepRef.current = false
                  }}
                  onConfirm={() => {
                    durationConfirmDidKeepRef.current = true
                    setShowDurationConfirm(false)
                  }}
                  title="Tem certeza?"
                  message={`No cadastro do aluno o tempo de aula é de ${durationConfirmCadastroMin} min. Você alterou para ${lessonForm.durationMinutes} min. Deseja manter ${lessonForm.durationMinutes} min ou reverter para o cadastro?`}
                  cancelLabel={`Reverter para ${durationConfirmCadastroMin} min`}
                  confirmLabel={`Manter ${lessonForm.durationMinutes} min`}
                />
              )}
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">Observações</label>
              <textarea
                value={lessonForm.notes}
                onChange={(e) => setLessonForm({ ...lessonForm, notes: e.target.value })}
                className="input w-full min-h-[60px]"
                placeholder="Opcional"
              />
            </div>
            {editingLesson && (
              <div className="pt-2 border-t border-gray-200">
                {(() => {
                  const lastUpdate = getLastUpdateInfo(editingLesson.notes, editingLesson.createdByName)
                  const isUpdateInfo = lastUpdate.includes('cancelada') || lastUpdate.includes('reagendada')
                  
                  if (isUpdateInfo) {
                    return (
                      <p className="text-xs text-gray-500">
                        Última atualização: <span className="font-semibold text-gray-700">{lastUpdate}</span>
                      </p>
                    )
                  } else {
                    // Se não há atualização nas observações, mostra quem agendou
                    return editingLesson.createdByName ? (
                      <p className="text-xs text-gray-500">
                        Esta aula foi agendada por <span className="font-semibold text-gray-700">{editingLesson.createdByName}</span>
                      </p>
                    ) : (
                      <div>
                        <label className="block text-xs font-semibold text-gray-700 mb-1">Agendada por (opcional)</label>
                        <input
                          type="text"
                          value={lessonForm.createdByName || ''}
                          onChange={(e) => setLessonForm({ ...lessonForm, createdByName: e.target.value })}
                          placeholder="Ex: Talissa admin"
                          className="input w-full text-xs"
                        />
                        <p className="text-xs text-gray-400 mt-1">Preencha manualmente para aulas antigas</p>
                      </div>
                    )
                  }
                })()}
              </div>
            )}
            {!editingLesson && (
              <p className="pt-2 border-t border-gray-200 text-xs text-gray-500">
                A aula será repetida automaticamente toda semana no mesmo dia e horário ({DEFAULT_LESSON_REPEAT_WEEKS}{' '}
                semanas).
              </p>
            )}
          </form>
        </Modal>

        {/* Modal: professor não ensina o idioma do aluno */}
        <Modal
          isOpen={idiomaErrorModalOpen}
          onClose={() => setIdiomaErrorModalOpen(false)}
          title="Idioma não compatível"
          size="sm"
          footer={<Button variant="primary" onClick={() => setIdiomaErrorModalOpen(false)}>Fechar</Button>}
        >
          <p className="text-sm text-gray-700">
            Isso não pode ser feito porque o professor não ensina esse idioma. Selecione um professor que ensine o idioma do curso do aluno.
          </p>
        </Modal>

        {/* Modal: excluir apenas esta ou esta e todas à frente */}
        <Modal
          isOpen={deleteLessonModalOpen}
          onClose={() => setDeleteLessonModalOpen(false)}
          title="Excluir aula"
          size="sm"
          footer={
            <>
              <Button variant="outline" onClick={() => setDeleteLessonModalOpen(false)} disabled={deletingLesson}>
                Cancelar
              </Button>
              <Button variant="outline" className="text-red-600 border-red-200 hover:bg-red-50" onClick={() => handleDeleteLesson(false)} disabled={deletingLesson}>
                {deletingLesson ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Excluindo...
                  </>
                ) : (
                  'Só esta semana'
                )}
              </Button>
              <Button variant="primary" className="bg-red-600 hover:bg-red-700" onClick={() => handleDeleteLesson(true)} disabled={deletingLesson}>
                {deletingLesson ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Excluindo...
                  </>
                ) : (
                  'Todas dali pra frente'
                )}
              </Button>
            </>
          }
        >
          <p className="text-sm text-gray-700">
            Esta aula faz parte de uma série semanal. Deseja excluir só esta semana ou todas as ocorrências futuras no
            mesmo dia e horário, a partir desta data?
          </p>
        </Modal>

        {/* Modal lista (ao clicar no cubo) */}
        <Modal
          isOpen={!!listModal}
          onClose={() => setListModal(null)}
          title={listModal?.title ?? ''}
          size={listModal?.type === 'novosMatriculados' ? 'lg' : 'md'}
          footer={<Button variant="primary" onClick={() => setListModal(null)}>Fechar</Button>}
        >
          {listModal?.type === 'novosMatriculados' ? (
            <div className="max-h-[60vh] overflow-y-auto space-y-3">
              <p className="text-sm text-gray-600">
                Alunos que se matricularam (formulário ou lista) e ainda não foram marcados como «tudo feito». Use «Enviei link pag» para registrar o envio do link de pagamento. «Tudo feito» remove o aluno da lista mesmo sem pagamento confirmado.
              </p>
              {novosMatriculadosListLoading ? (
                <SeidmannLoading variant="inline" />
              ) : novosMatriculadosList.length === 0 ? (
                <p className="text-gray-500">Nenhum novo aluno matriculado pendente.</p>
              ) : (
                <TableScrollArea>
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-gray-200">
                        <th className="py-2 pr-4 font-semibold text-gray-700">Nome</th>
                        <th className="py-2 pr-4 font-semibold text-gray-700">Data da matrícula</th>
                        <th className="py-2 font-semibold text-gray-700">Ação</th>
                      </tr>
                    </thead>
                    <tbody>
                      {novosMatriculadosList.map((row) => {
                        const dataFormatada = row.dataMatricula
                          ? new Date(row.dataMatricula).toLocaleDateString('pt-BR', {
                              day: '2-digit',
                              month: '2-digit',
                              year: 'numeric',
                            })
                          : '—'
                        const isLoadingAulas = marcandoAulasId === row.id
                        const isLoadingLink = marcandoLinkPagId === row.id
                        const linkEnviado = !!row.linkPagamentoEnviadoAt
                        return (
                          <tr key={row.id} className="border-b border-gray-100">
                            <td className="py-2 pr-4">{row.nome}</td>
                            <td className="py-2 pr-4">{dataFormatada}</td>
                            <td className="py-2">
                              <div className="flex flex-wrap gap-2">
                                <button
                                  type="button"
                                  onClick={() => marcarLinkPagEnviado(row.id)}
                                  disabled={isLoadingLink || linkEnviado}
                                  className={`px-3 py-1.5 text-sm font-medium rounded-lg disabled:cursor-not-allowed disabled:opacity-50 ${
                                    linkEnviado ? 'bg-gray-200 text-gray-600 cursor-default' : 'bg-sky-600 text-white hover:opacity-90'
                                  }`}
                                >
                                  {isLoadingLink ? 'Salvando...' : linkEnviado ? 'Link enviado' : 'Enviei link pag'}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => marcarAulasAdicionadas(row.id)}
                                  disabled={isLoadingAulas}
                                  className="px-3 py-1.5 text-sm font-medium rounded-lg bg-brand-orange text-white hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                  {isLoadingAulas ? 'Salvando...' : 'Tudo feito'}
                                </button>
                              </div>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </TableScrollArea>
              )}
            </div>
          ) : listModal?.type === 'alunosParaRedirecionar' ? (
            <div className="space-y-3">
              <p className="text-sm text-gray-600">
                Alunos que têm aulas futuras em horários fora da disponibilidade atual do professor. Quando o professor salvar a alteração de horários, esses alunos serão redirecionados para outros professores.
              </p>
              {alunosParaRedirecionarListLoading ? (
                <SeidmannLoading variant="inline" />
              ) : alunosParaRedirecionarList.length === 0 ? (
                <p className="text-gray-500">Nenhum aluno para redirecionar.</p>
              ) : (
                <TableScrollArea>
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-gray-200">
                        <th className="py-2 pr-4 font-semibold text-gray-700">Nome</th>
                        <th className="py-2 pr-4 font-semibold text-gray-700">Professor (horário alterado)</th>
                        <th className="py-2 font-semibold text-gray-700">Ações</th>
                      </tr>
                    </thead>
                    <tbody>
                      {alunosParaRedirecionarList.map((row) => {
                        const isLoadingRedirect = marcandoRedirectId === row.id
                        return (
                          <tr key={row.id} className="border-b border-gray-100">
                            <td className="py-2 pr-4">{row.nome}</td>
                            <td className="py-2 pr-4">{row.professorNome ?? '—'}</td>
                            <td className="py-2">
                              <div className="flex flex-wrap gap-2">
                                <button
                                  type="button"
                                  onClick={() => setDesignarAulaEnrollment(row)}
                                  className="px-3 py-1.5 text-sm font-medium rounded-lg bg-emerald-600 text-white hover:opacity-90"
                                >
                                  Agendar aula
                                </button>
                                <button
                                  type="button"
                                  onClick={() => marcarAlunoParaRedirecionarJaFeito(row.id)}
                                  disabled={isLoadingRedirect}
                                  className="px-3 py-1.5 text-sm font-medium rounded-lg bg-gray-200 text-gray-800 hover:bg-gray-300 disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                  {isLoadingRedirect ? 'Salvando...' : 'Já feito'}
                                </button>
                              </div>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </TableScrollArea>
              )}
            </div>
          ) : listModal && stats ? (
            <div className="max-h-[60vh] overflow-y-auto space-y-2">
              {listModal.type === 'confirmed' &&
                stats.confirmedList.map((item) => (
                  <div key={item.id} className="p-3 rounded-lg border border-green-200 bg-green-50 text-sm">
                    <span className="font-medium">{item.studentName}</span> – {item.teacherName} –{' '}
                    {formatTime(item.startAt)}
                  </div>
                ))}
              {listModal.type === 'confirmed' && stats.confirmedList.length === 0 && (
                <p className="text-gray-500 text-sm">Nenhuma aula confirmada nesta semana.</p>
              )}
              {listModal.type === 'cancelled' &&
                stats.cancelledList.map((item) => (
                  <div key={item.id} className="p-3 rounded-lg border border-red-200 bg-red-50 text-sm">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <span className="font-medium">{item.studentName}</span> – {item.teacherName} –{' '}
                        {formatTime(item.startAt)}
                        {item.rescheduledAt ? (
                          <p className="mt-1 text-xs text-emerald-700">
                            Reagendada para {new Date(item.rescheduledAt).toLocaleDateString('pt-BR')} às {formatTime(item.rescheduledAt)}
                            {item.rescheduledTeacherName ? ` com ${item.rescheduledTeacherName}` : ''}
                          </p>
                        ) : (
                          <p className="mt-1 text-xs text-red-700">Sem reagendamento</p>
                        )}
                      </div>
                      {item.allowsReschedule !== false && !item.rescheduledAt && (
                        <Button
                          type="button"
                          size="sm"
                          variant="primary"
                          onClick={() => void abrirReagendamentoDaCancelada(item.id)}
                          disabled={reagendarCanceladaLoadingId === item.id}
                          className="shrink-0"
                        >
                          {reagendarCanceladaLoadingId === item.id ? 'Abrindo...' : 'Reagendar'}
                        </Button>
                      )}
                      {item.allowsReschedule === false && !item.rescheduledAt && (
                        <p className="text-xs text-gray-600 shrink-0 max-w-[11rem] text-right">
                          Sem reposição permitida
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              {listModal.type === 'cancelled' && stats.cancelledList.length === 0 && (
                <p className="text-gray-500 text-sm">Nenhuma aula cancelada neste mês.</p>
              )}
              {listModal.type === 'reposicao' &&
                stats.reposicaoList.map((item) => (
                  <div key={item.id} className="p-3 rounded-lg border border-amber-200 bg-amber-50 text-sm">
                    <span className="font-medium">{item.studentName}</span> – {item.teacherName} –{' '}
                    {formatTime(item.startAt)}
                  </div>
                ))}
              {listModal.type === 'reposicao' && stats.reposicaoList.length === 0 && (
                <p className="text-gray-500 text-sm">Nenhuma reposição nesta semana.</p>
              )}
              {listModal.type === 'wrongFrequency' &&
                stats.wrongFrequencyList.map((item) => (
                  <div key={item.enrollmentId} className="p-3 rounded-lg border border-orange-200 bg-orange-50 text-sm space-y-2">
                    <div>
                      <span className="font-medium">{item.studentName}</span>
                      {item.isOverlap ? (
                        <span className="ml-1 text-red-700 font-semibold">– Aula sobreposta</span>
                      ) : item.expectedMinutes != null && item.actualMinutes != null ? (
                        <> – cadastro: {item.expectedMinutes} min/sem (ex.: {item.expected}x{Math.round(item.expectedMinutes / item.expected)}min). Nesta semana (seg–sáb): {item.actualMinutes} min.</>
                      ) : (
                        <> – cadastro: {item.expected} aula(s) por semana. Nesta semana (seg–sáb): {item.actual} aula(s).</>
                      )}
                    </div>
                    {item.isOverlap && item.lessonsThisWeek && item.lessonsThisWeek.length > 0 && (
                      <div className="mt-2 space-y-1">
                        <p className="text-xs font-medium text-gray-700">Excluir uma aula para corrigir:</p>
                        <ul className="space-y-1">
                          {item.lessonsThisWeek.map((lesson) => {
                            const startDate = new Date(lesson.startAt)
                            const diaHora = startDate.toLocaleDateString('pt-BR', {
                              weekday: 'short',
                              day: '2-digit',
                              month: '2-digit',
                              year: 'numeric',
                            })
                            const hora = formatTime(lesson.startAt)
                            return (
                              <li
                                key={lesson.id}
                                className="flex items-center justify-between gap-2 py-1.5 px-2 rounded bg-white border border-orange-100"
                              >
                                <span>
                                  {diaHora} às {hora} – {lesson.teacherName} ({lesson.durationMinutes} min)
                                </span>
                                <button
                                  type="button"
                                  onClick={() => excluirAulaWrongFrequency(lesson)}
                                  disabled={excluindoAulaId === lesson.id || !canDirectEditLesson(lesson)}
                                  className="flex-shrink-0 p-1 rounded text-red-600 hover:bg-red-100 hover:text-red-800 disabled:opacity-50"
                                  title={
                                    canDirectEditLesson(lesson)
                                      ? 'Excluir esta aula'
                                      : 'Aulas de dias anteriores só podem ser excluídas pelo administrador principal'
                                  }
                                >
                                  <X className="w-4 h-4" />
                                </button>
                              </li>
                            )
                          })}
                        </ul>
                      </div>
                    )}
                    {!item.isOverlap && (
                      <Button
                        type="button"
                        variant="primary"
                        size="sm"
                        onClick={() => {
                          const tempoAula =
                            item.expectedMinutes != null && item.expected > 0
                              ? Math.round(item.expectedMinutes / item.expected)
                              : undefined
                          setDesignarAulaEnrollment({
                            id: item.enrollmentId,
                            nome: item.studentName,
                            frequenciaSemanal: item.expected,
                            tempoAulaMinutos: tempoAula ?? undefined,
                          })
                          setDesignarAulaCorrectionData({
                            existingLessonTimes: item.lessonTimesThisWeek ?? [],
                            existingLessons: item.lessonsThisWeek?.map((l) => ({ startAt: l.startAt, teacherName: l.teacherName })),
                            expected: item.expected,
                            actual: item.actual,
                          })
                        }}
                        className="mt-2"
                      >
                        Corrigir
                      </Button>
                    )}
                  </div>
                ))}
              {listModal.type === 'wrongFrequency' && stats.wrongFrequencyList.length === 0 && (
                <p className="text-gray-500 text-sm">Todos os alunos ativos estão com o total de aulas desta semana (seg–sáb) igual à frequência cadastrada.</p>
              )}
              {listModal.type === 'teacherErrors' && (
                <div className="space-y-4">
                  <div>
                    <h3 className="text-sm font-semibold text-gray-800 mb-2">Professor com mais de um aluno no mesmo horário/dia</h3>
                    {stats.doubleBookingList && stats.doubleBookingList.length > 0 ? (
                      <div className="space-y-2">
                        {stats.doubleBookingList.map((item, idx) => (
                          <div key={`db-${item.teacherId}-${idx}`} className="p-3 rounded-lg border border-red-200 bg-red-50 text-sm">
                            <span className="font-medium">{item.teacherName}</span> – {item.lessons.length} aluno(s) no mesmo horário:
                            <ul className="mt-1 ml-2 list-disc">
                              {item.lessons.map((l, i) => (
                                <li key={i}>
                                  {l.studentName} – {formatTime(l.startAt)}
                                </li>
                              ))}
                            </ul>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-gray-500 text-sm">Nenhum professor com sobreposição de aulas nesta semana.</p>
                    )}
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-gray-800 mb-2">Professor inativo com aula agendada</h3>
                    {stats.inactiveTeacherList && stats.inactiveTeacherList.length > 0 ? (
                      <div className="space-y-2">
                        {stats.inactiveTeacherList.map((item) => (
                          <div key={item.teacherId} className="p-3 rounded-lg border border-amber-200 bg-amber-50 text-sm">
                            <span className="font-medium">{item.teacherName}</span> (inativo) – {item.lessons.length} aula(s) na semana:
                            <ul className="mt-1 ml-2 list-disc">
                              {item.lessons.map((l, i) => (
                                <li key={i}>
                                  {l.studentName} – {formatTime(l.startAt)}
                                </li>
                              ))}
                            </ul>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-gray-500 text-sm">Nenhum professor inativo com aula nesta semana.</p>
                    )}
                  </div>
                </div>
              )}
            </div>
          ) : null}
        </Modal>

        {/* Modal: Aulas reagendadas pelos alunos */}
        <Modal
          isOpen={rescheduledLessonsModalOpen}
          onClose={() => setRescheduledLessonsModalOpen(false)}
          title="Aulas reagendadas pelos alunos"
          size="lg"
          footer={<Button variant="primary" onClick={() => setRescheduledLessonsModalOpen(false)}>Fechar</Button>}
        >
          <div className="max-h-[60vh] overflow-y-auto space-y-2">
            {studentRescheduledLessons.filter((l) => !viewedRescheduledLessons.has(l.id)).length > 0 ? (
              studentRescheduledLessons
                .filter((l) => !viewedRescheduledLessons.has(l.id))
                .slice(0, 5)
                .map((lesson) => {
                  const studentLabel = getLessonStudentLabel(lesson, enrollments)
                  const startDate = new Date(lesson.startAt)
                  return (
                    <div
                      key={lesson.id}
                      className="p-3 rounded-lg border border-blue-200 bg-blue-50 text-sm"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div 
                          className="flex-1 cursor-pointer hover:bg-blue-100 transition-colors rounded p-1 -m-1"
                          onClick={() => {
                            setEditingLesson(lesson)
                            setLessonForm({
                              enrollmentId: lesson.enrollmentId,
                              teacherId: lesson.teacherId,
                              status: lesson.status,
                              startAt: toDatetimeLocal(startDate),
                              durationMinutes: lesson.durationMinutes,
                              notes: lesson.notes || '',
                              createdByName: lesson.createdByName || '',
                              repeatEnabled: false,
                              repeatWeeks: 4,
                              repeatSameWeek: false,
                              repeatSameWeekStartAt: '',
                              repeatFrequencyEnabled: false,
                              repeatFrequencyWeeks: 4,
                            })
                            setRescheduledLessonsModalOpen(false)
                            setLessonModalOpen(true)
                          }}
                        >
                          <div className="font-medium">{studentLabel}</div>
                          <div className="text-gray-600">
                            {lesson.teacher?.nome ?? 'Sem professor'} – {startDate.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric' })} às {formatTime(lesson.startAt)}
                          </div>
                          {lesson.notes && (
                            <div className="text-xs text-gray-500 mt-1">{lesson.notes.split('\n').slice(-1)[0]}</div>
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation()
                            markRescheduledLessonAsViewed(lesson.id)
                          }}
                          className="shrink-0 flex items-center gap-2 px-3 py-1.5 text-xs font-medium text-green-700 bg-green-100 hover:bg-green-200 rounded-lg border border-green-300 transition-colors"
                        >
                          <CheckCircle className="w-4 h-4" />
                          Confirmo que vi
                        </button>
                      </div>
                    </div>
                  )
                })
            ) : (
              <p className="text-gray-500 text-sm">Nenhuma aula reagendada pelos alunos não visualizada.</p>
            )}
            {studentRescheduledLessons.filter((l) => !viewedRescheduledLessons.has(l.id)).length > 5 && (
              <p className="text-xs text-gray-500 text-center py-2 border-t border-gray-200 mt-3">
                Mostrando apenas as 5 aulas mais recentes de {studentRescheduledLessons.filter((l) => !viewedRescheduledLessons.has(l.id)).length} total
              </p>
            )}
          </div>
        </Modal>

        {/* Modal: Solicitação de trocas de aulas */}
        <Modal
          isOpen={transferRequestsModalOpen}
          onClose={() => setTransferRequestsModalOpen(false)}
          title="Solicitação de trocas de aulas"
          size="lg"
          footer={<Button variant="primary" onClick={() => setTransferRequestsModalOpen(false)}>Fechar</Button>}
        >
          <div className="max-h-[60vh] overflow-y-auto space-y-2">
            {pendingTransferRequests.length > 0 ? (
              pendingTransferRequests.map((request) => {
                const startDate = new Date(request.lesson.startAt)
                const requestedDate = request.requestedStartAt ? new Date(request.requestedStartAt) : null
                return (
                  <div
                    key={request.id}
                    className="p-3 rounded-lg border border-purple-200 bg-purple-50 text-sm cursor-pointer hover:bg-purple-100 transition-colors"
                    onClick={async () => {
                      // Buscar a aula completa para edição
                      try {
                        const res = await fetch(`/api/admin/lessons/${request.lessonId}`, { credentials: 'include' })
                        if (res.ok) {
                          const json = await res.json()
                          if (json.ok && json.data?.lesson) {
                            const lesson = json.data.lesson
                            const startDateObj = new Date(lesson.startAt)
                            // Criar objeto Lesson compatível com o tipo esperado
                            const lessonForEdit: Lesson = {
                              id: lesson.id,
                              enrollmentId: lesson.enrollmentId,
                              teacherId: lesson.teacherId,
                              status: lesson.status,
                              startAt: lesson.startAt,
                              durationMinutes: lesson.durationMinutes,
                              notes: lesson.notes,
                              createdByName: lesson.createdByName,
                              enrollment: {
                                id: lesson.enrollment?.id,
                                nome: lesson.enrollment?.nome ?? 'Sem aluno',
                                frequenciaSemanal: lesson.enrollment?.frequenciaSemanal,
                              },
                              teacher: {
                                id: lesson.teacher?.id,
                                nome: lesson.teacher?.nome ?? 'Sem professor',
                              },
                            }
                            setEditingLesson(lessonForEdit)
                            setLessonForm({
                              enrollmentId: lesson.enrollmentId,
                              teacherId: lesson.teacherId,
                              status: lesson.status,
                              startAt: toDatetimeLocal(startDateObj),
                              durationMinutes: lesson.durationMinutes,
                              notes: lesson.notes || '',
                              createdByName: lesson.createdByName || '',
                              repeatEnabled: false,
                              repeatWeeks: 4,
                              repeatSameWeek: false,
                              repeatSameWeekStartAt: '',
                              repeatFrequencyEnabled: false,
                              repeatFrequencyWeeks: 4,
                            })
                            setTransferRequestsModalOpen(false)
                            setLessonModalOpen(true)
                          }
                        }
                      } catch (e) {
                        console.error('Erro ao buscar aula:', e)
                        setToast({ message: 'Erro ao carregar aula', type: 'error' })
                      }
                    }}
                  >
                    <div className="font-medium">{request.lesson.enrollment?.nome ?? 'Sem aluno'}</div>
                    <div className="text-gray-600">
                      Aula atual: {request.lesson.teacher?.nome ?? 'Sem professor'} – {startDate.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric' })} às {formatTime(request.lesson.startAt)}
                    </div>
                    {request.type === 'TROCA_AULA' && requestedDate && (
                      <div className="text-gray-600">
                        Solicitado para: {request.requestedTeacher?.nome ?? request.lesson.teacher?.nome ?? 'Sem professor'} – {requestedDate.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric' })} às {formatTime(request.requestedStartAt!)}
                      </div>
                    )}
                    {request.type === 'TROCA_PROFESSOR' && request.requestedTeacher && (
                      <div className="text-gray-600">
                        Solicitado professor: {request.requestedTeacher?.nome ?? 'Sem professor'}
                      </div>
                    )}
                    {request.status === 'TEACHER_REJECTED' && (
                      <div className="text-xs text-red-600 mt-1">Rejeitado pelo professor - aguardando gestão</div>
                    )}
                    {request.notes && (
                      <div className="text-xs text-gray-500 mt-1">{request.notes}</div>
                    )}
                  </div>
                )
              })
            ) : (
              <p className="text-gray-500 text-sm">Nenhuma solicitação de troca pendente para gestão.</p>
            )}
          </div>
        </Modal>

        <DesignarAulaModal
          isOpen={!!designarAulaEnrollment}
          onClose={() => {
            setDesignarAulaEnrollment(null)
            setDesignarAulaCorrectionData(null)
          }}
          enrollment={
            designarAulaEnrollment
              ? {
                  id: designarAulaEnrollment.id,
                  nome: designarAulaEnrollment.nome,
                  frequenciaSemanal: designarAulaEnrollment.frequenciaSemanal ?? null,
                  tempoAulaMinutos: designarAulaEnrollment.tempoAulaMinutos ?? null,
                }
              : null
          }
          correctionData={designarAulaCorrectionData}
          onSuccess={() => {
            setDesignarAulaEnrollment(null)
            setDesignarAulaCorrectionData(null)
            fetchStats()
            fetchNovosMatriculadosCount()
            if (listModal?.type === 'alunosParaRedirecionar') {
              fetch(`/api/admin/dashboard-lists?type=alunosParaRedirecionar`, { credentials: 'include' })
                .then((r) => r.json())
                .then((j) => { if (j.ok && Array.isArray(j.data)) setAlunosParaRedirecionarList(j.data) })
                .catch(() => {})
            }
          }}
        />

        <Modal
          isOpen={!!pastEditApprovalRequest}
          onClose={() => setPastEditApprovalRequest(null)}
          title="Aprovar alteração tardia de aula"
          size="md"
          footer={
            <div className="flex flex-wrap gap-2 justify-end w-full">
              <Button
                variant="outline"
                onClick={() => void processPastEditApproval('REJECT')}
                disabled={pastEditActionLoading}
                className="text-red-700 border-red-200"
              >
                Rejeitar
              </Button>
              <Button
                onClick={() => void processPastEditApproval('APPROVE')}
                disabled={pastEditActionLoading}
              >
                {pastEditActionLoading ? (
                  <Loader2 className="w-4 h-4 animate-spin mr-1" />
                ) : null}
                Aprovar alteração
              </Button>
            </div>
          }
        >
          {pastEditApprovalRequest ? (
            <div className="space-y-3 text-sm text-gray-700">
              <p>
                <strong>{pastEditApprovalRequest.requestedByName}</strong> solicitou alterar a aula
                de <strong>{pastEditApprovalRequest.studentName}</strong> com{' '}
                <strong>{pastEditApprovalRequest.teacherName}</strong>.
              </p>
              <p className="text-gray-600">
                Horário original:{' '}
                {new Date(pastEditApprovalRequest.lessonStartAt).toLocaleString('pt-BR')}
              </p>
              <pre className="text-xs bg-slate-50 border border-slate-200 rounded-lg p-3 overflow-x-auto whitespace-pre-wrap">
                {JSON.stringify(pastEditApprovalRequest.payload, null, 2)}
              </pre>
            </div>
          ) : null}
        </Modal>

        {toast && (
          <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />
        )}
        <ConfirmDialog />
        <LateCancellationDialog />
      </div>
    </AdminLayout>
  )
}
