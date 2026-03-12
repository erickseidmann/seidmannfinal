/**
 * Dashboard Professores – Registrar aulas: lista de aulas do período de pagamento; clique para registrar.
 */

'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { ClipboardList, Loader2, CheckCircle, Circle, ChevronLeft, ChevronRight, BookOpen, Clock, Wallet, FileEdit, CalendarX, Pencil } from 'lucide-react'
import { useLanguage } from '@/contexts/LanguageContext'
import { formatTimeInTZ, formatDateTimeInTZ, toDateKeyInTZ } from '@/lib/datetime'
import Modal from '@/components/admin/Modal'
import Button from '@/components/ui/Button'
import Toast from '@/components/admin/Toast'

const BRAZIL_TZ = 'America/Sao_Paulo'

interface Lesson {
  id: string
  enrollmentId: string
  teacherId: string
  status: string
  startAt: string
  durationMinutes: number
  enrollment: {
    id: string
    nome: string
    tipoAula: string | null
    nomeGrupo: string | null
    curso?: string | null
    groupMemberNames?: string[]
  }
  teacher: { id: string; nome: string }
  record?: { id: string; criadoEm?: string; atualizadoEm?: string } | null
}

interface UltimaRecord {
  id: string
  status: string
  presence: string
  lessonType: string
  curso: string | null
  tempoAulaMinutos: number | null
  book: string | null
  lastPage: string | null
  assignedHomework: string | null
  homeworkDone: string | null
  conversationDescription: string | null
  notes: string | null
  notesForStudent: string | null
  notesForParents: string | null
  gradeGrammar: number | null
  gradeSpeaking: number | null
  gradeListening: number | null
  gradeUnderstanding: number | null
  studentPresences?: { enrollmentId: string; enrollment?: { nome: string }; presence: string }[]
  lesson: { startAt: string; enrollment: { nome: string; tipoAula?: string | null; nomeGrupo?: string | null }; teacher: { nome: string } }
}

interface GroupMember {
  id: string
  nome: string
}

type FormStatus = 'CONFIRMED' | 'CANCELLED' | 'REPOSICAO'
type FormPresence = 'PRESENTE' | 'NAO_COMPARECEU' | 'ATRASADO'
type FormLessonType = 'NORMAL' | 'CONVERSAÇÃO' | 'REVISAO' | 'AVALIACAO'

const emptyForm = {
  status: 'CONFIRMED' as FormStatus,
  presence: 'PRESENTE' as FormPresence,
  lessonType: 'NORMAL' as FormLessonType,
  curso: '',
  tempoAulaMinutos: '' as string | number,
  book: '',
  lastPage: '',
  assignedHomework: '',
  homeworkDone: '' as string,
  conversationDescription: '',
  notes: '',
  notesForStudent: '',
  notesForParents: '',
  gradeGrammar: '' as string | number,
  gradeSpeaking: '' as string | number,
  gradeListening: '' as string | number,
  gradeUnderstanding: '' as string | number,
}

function formatDateOnly(iso: string, locale: string): string {
  const d = new Date(iso)
  return new Intl.DateTimeFormat(locale, {
    timeZone: BRAZIL_TZ,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(d)
}

function getLessonStudentLabel(l: Lesson): string {
  const enr = l.enrollment
  if (enr?.tipoAula === 'GRUPO' && enr?.nomeGrupo?.trim()) {
    const groupName = enr.nomeGrupo.trim()
    const members = enr.groupMemberNames?.length ? enr.groupMemberNames.join(', ') : ''
    return members ? `${groupName} — ${members}` : groupName
  }
  return enr?.nome ?? '—'
}

export default function RegistrarAulasPage() {
  const now = new Date()
  const [selectedYear, setSelectedYear] = useState(() => now.getFullYear())
  const [selectedMonth, setSelectedMonth] = useState(() => now.getMonth() + 1) // 1-12

  const { t, locale } = useLanguage()
  const dateLocale = locale === 'pt-BR' ? 'pt-BR' : locale === 'es' ? 'es' : 'en-US'

  const [periodStart, setPeriodStart] = useState<string | null>(null)
  const [periodEnd, setPeriodEnd] = useState<string | null>(null)
  const [lessons, setLessons] = useState<Lesson[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [selectedLesson, setSelectedLesson] = useState<Lesson | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [studentsPresence, setStudentsPresence] = useState<{ enrollmentId: string; presence: string }[]>([])
  const [groupMembers, setGroupMembers] = useState<GroupMember[]>([])
  const [loadingGroup, setLoadingGroup] = useState(false)
  const [saving, setSaving] = useState(false)
  const [ultimaRecord, setUltimaRecord] = useState<UltimaRecord | null>(null)
  const [ultimaLoading, setUltimaLoading] = useState(false)
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null)
  const [holidays, setHolidays] = useState<Set<string>>(new Set())
  const [stats, setStats] = useState({ totalAulasRegistradas: 0, totalHorasRegistradas: 0, valorAPagar: 0 })
  const [showPendingList, setShowPendingList] = useState(false)
  const [editingRecordId, setEditingRecordId] = useState<string | null>(null)
  const [loadingRecord, setLoadingRecord] = useState(false)
  const [periodPaid, setPeriodPaid] = useState(false)
  const [registeringLessonId, setRegisteringLessonId] = useState<string | null>(null)

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      // Usar year/month para obter o mesmo período que o admin (TeacherPaymentMonth: 25/01–25/02 etc.)
      const finRes = await fetch(
        `/api/professor/financeiro?year=${selectedYear}&month=${selectedMonth}`,
        { credentials: 'include' }
      )
      const finJson = await finRes.json()
      let start: string
      let end: string
      let isPaid = false

      if (finRes.ok && finJson.ok && finJson.data?.dataInicio && finJson.data?.dataTermino) {
        start = finJson.data.dataInicio
        end = finJson.data.dataTermino
        isPaid = finJson.data.statusPagamento === 'PAGO'
        setPeriodStart(start)
        setPeriodEnd(end)
        setPeriodPaid(isPaid)
        setStats({
          totalAulasRegistradas: Array.isArray(finJson.data.registrosDetalhados) ? finJson.data.registrosDetalhados.length : 0,
          totalHorasRegistradas: typeof finJson.data.totalHorasRegistradas === 'number' ? finJson.data.totalHorasRegistradas : 0,
          valorAPagar: typeof finJson.data.valorAPagar === 'number' ? finJson.data.valorAPagar : 0,
        })
      } else {
        const y = selectedYear
        const m = selectedMonth
        start = `${y}-${String(m).padStart(2, '0')}-01`
        const lastDay = new Date(y, m, 0).getDate()
        end = `${y}-${String(m).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`
        isPaid = false
        setPeriodPaid(false)
        setPeriodStart(start)
        setPeriodEnd(end)
        setStats({ totalAulasRegistradas: 0, totalHorasRegistradas: 0, valorAPagar: 0 })
      }

      const periodStartDate = new Date(start + 'T00:00:00.000Z')
      const periodEndDate = new Date(end + 'T23:59:59.999Z')

      // Para permitir que o professor registre aulas DEPOIS do fim do período já pago,
      // buscamos aulas até o fim do mês de calendário selecionado quando o período está pago.
      let lessonsStartDate = periodStartDate
      let lessonsEndDate = periodEndDate
      if (isPaid) {
        const y = selectedYear
        const m = selectedMonth
        const lastDay = new Date(y, m, 0).getDate()
        lessonsEndDate = new Date(`${y}-${String(m).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}T23:59:59.999Z`)
      }

      const lessonsRes = await fetch(
        `/api/professor/lessons?start=${lessonsStartDate.toISOString()}&end=${lessonsEndDate.toISOString()}`,
        { credentials: 'include' }
      )
      const lessonsJson = await lessonsRes.json()
      if (lessonsRes.ok && lessonsJson.ok && Array.isArray(lessonsJson.data?.lessons)) {
        setLessons(lessonsJson.data.lessons)
      } else {
        setLessons([])
      }

      // Carregar feriados do período para excluir do cálculo de pendentes
      try {
        const startKey = toDateKeyInTZ(startDate)
        const endKey = toDateKeyInTZ(endDate)
        const holidaysRes = await fetch(`/api/professor/holidays?start=${startKey}&end=${endKey}`, {
          credentials: 'include',
        })
        if (holidaysRes.ok) {
          const holidaysJson = await holidaysRes.json()
          if (holidaysJson.ok && Array.isArray(holidaysJson.data?.holidays)) {
            setHolidays(new Set(holidaysJson.data.holidays))
          } else {
            setHolidays(new Set())
          }
        }
      } catch {
        setHolidays(new Set())
      }
    } catch {
      setError(t('professor.calendar.errorLoad'))
      setLessons([])
    } finally {
      setLoading(false)
    }
  }, [t, selectedYear, selectedMonth])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const monthYearLabel = useMemo(() => {
    const d = new Date(selectedYear, selectedMonth - 1, 15)
    return new Intl.DateTimeFormat(dateLocale, { month: 'long', year: 'numeric' }).format(d)
  }, [selectedYear, selectedMonth, dateLocale])

  const goPrevMonth = () => {
    if (selectedMonth === 1) {
      setSelectedYear((y) => y - 1)
      setSelectedMonth(12)
    } else {
      setSelectedMonth((m) => m - 1)
    }
  }

  const goNextMonth = () => {
    if (selectedMonth === 12) {
      setSelectedYear((y) => y + 1)
      setSelectedMonth(1)
    } else {
      setSelectedMonth((m) => m + 1)
    }
  }

  const isCurrentMonth = selectedYear === now.getFullYear() && selectedMonth === now.getMonth() + 1
  const paidPeriodRange = useMemo(() => {
    if (!periodPaid || !periodStart || !periodEnd) return null
    const start = new Date(periodStart + 'T00:00:00.000Z').getTime()
    const end = new Date(periodEnd + 'T23:59:59.999Z').getTime()
    return { start, end }
  }, [periodPaid, periodStart, periodEnd])

  const pendingLessons = useMemo(() => {
    const nowMs = Date.now()
    return lessons.filter((l) => {
      if (l.status === 'CANCELLED') return false
      const isHoliday = holidays.has(toDateKeyInTZ(l.startAt))
      if (isHoliday) return false
      const startAtMs = new Date(l.startAt).getTime()
      const isFuture = startAtMs > nowMs
      if (isFuture) return false
      // Se o período está pago, não contar pendências DENTRO do período pago (essas ficam fechadas)
      if (paidPeriodRange && startAtMs >= paidPeriodRange.start && startAtMs <= paidPeriodRange.end) {
        return false
      }
      return !l.record?.id
    })
  }, [lessons, holidays, paidPeriodRange])
  const registrosEmAberto = periodPaid ? 0 : pendingLessons.length
  const valorFormatado = useMemo(
    () => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(stats.valorAPagar),
    [stats.valorAPagar]
  )

  const modalOpen = selectedLesson !== null
  const isGroupLesson = selectedLesson?.enrollment?.tipoAula === 'GRUPO' && selectedLesson?.enrollment?.nomeGrupo?.trim()
  const selectedLessonIsHoliday = selectedLesson ? holidays.has(toDateKeyInTZ(selectedLesson.startAt)) : false
  const selectedLessonIsFuture = selectedLesson ? new Date(selectedLesson.startAt) > new Date() : false

  const closeModal = useCallback(() => {
    setSelectedLesson(null)
    setEditingRecordId(null)
    setUltimaRecord(null)
    setForm(emptyForm)
    setStudentsPresence([])
    setGroupMembers([])
  }, [])

  const handleLessonClick = (lesson: Lesson) => {
    if (lesson.status === 'CANCELLED' || lesson.record?.id) return
    if (registeringLessonId) {
      setToast({ message: t('professor.registerClasses.waitRegistration'), type: 'error' })
      return
    }
    setShowPendingList(false)
    setEditingRecordId(null)
    setSelectedLesson(lesson)
    setForm({
      ...emptyForm,
      tempoAulaMinutos: lesson.durationMinutes ?? '',
      curso: lesson.enrollment?.curso ?? '',
    })
    setStudentsPresence([])
    setUltimaRecord(null)
  }

  const handleEditClick = (e: React.MouseEvent, lesson: Lesson) => {
    e.stopPropagation()
    if (!lesson.record?.id) return
    if (registeringLessonId) {
      setToast({ message: t('professor.registerClasses.waitRegistration'), type: 'error' })
      return
    }
    setShowPendingList(false)
    setSelectedLesson(lesson)
    setEditingRecordId(lesson.record.id)
    setForm(emptyForm)
    setStudentsPresence([])
    setUltimaRecord(null)
  }

  useEffect(() => {
    if (!editingRecordId || !selectedLesson) return
    setLoadingRecord(true)
    fetch(`/api/professor/lesson-records/${editingRecordId}`, { credentials: 'include' })
      .then((res) => res.json())
      .then((json) => {
        if (!json.ok || !json.data?.record) return
        const r = json.data.record
        setForm({
          status: (['CONFIRMED', 'CANCELLED', 'REPOSICAO'].includes(r.status) ? r.status : 'CONFIRMED') as FormStatus,
          presence: (['PRESENTE', 'NAO_COMPARECEU', 'ATRASADO'].includes(r.presence) ? r.presence : 'PRESENTE') as FormPresence,
          lessonType: (['NORMAL', 'CONVERSAÇÃO', 'REVISAO', 'AVALIACAO'].includes(r.lessonType) ? r.lessonType : 'NORMAL') as FormLessonType,
          curso: r.curso ?? '',
          tempoAulaMinutos: r.tempoAulaMinutos ?? selectedLesson.durationMinutes ?? '',
          book: r.book ?? '',
          lastPage: r.lastPage ?? '',
          assignedHomework: r.assignedHomework ?? '',
          homeworkDone: (r.homeworkDone ?? '') as string,
          conversationDescription: r.conversationDescription ?? '',
          notes: r.notes ?? '',
          notesForStudent: r.notesForStudent ?? '',
          notesForParents: r.notesForParents ?? '',
          gradeGrammar: r.gradeGrammar ?? '',
          gradeSpeaking: r.gradeSpeaking ?? '',
          gradeListening: r.gradeListening ?? '',
          gradeUnderstanding: r.gradeUnderstanding ?? '',
        })
        if (Array.isArray(r.studentPresences) && r.studentPresences.length > 0) {
          setStudentsPresence(r.studentPresences.map((s: { enrollmentId: string; presence: string }) => ({ enrollmentId: s.enrollmentId, presence: s.presence })))
        }
      })
      .finally(() => setLoadingRecord(false))
  }, [editingRecordId, selectedLesson?.id, selectedLesson?.durationMinutes])

  useEffect(() => {
    if (!selectedLesson) return
    setUltimaLoading(true)
    setUltimaRecord(null)
    fetch(`/api/professor/lesson-records/ultima?enrollmentId=${encodeURIComponent(selectedLesson.enrollmentId)}`, { credentials: 'include' })
      .then((res) => res.json())
      .then((json) => {
        if (json.ok && json.data?.record) setUltimaRecord(json.data.record as UltimaRecord)
        else setUltimaRecord(null)
      })
      .catch(() => setUltimaRecord(null))
      .finally(() => setUltimaLoading(false))
  }, [selectedLesson?.enrollmentId])

  useEffect(() => {
    if (!selectedLesson || !isGroupLesson) {
      setGroupMembers([])
      return
    }
    const nomeGrupo = selectedLesson.enrollment.nomeGrupo!.trim()
    setLoadingGroup(true)
    fetch(`/api/professor/enrollments/group-members?nomeGrupo=${encodeURIComponent(nomeGrupo)}`, { credentials: 'include' })
      .then((res) => res.json())
      .then((json) => {
        if (json.ok && json.data?.enrollments) {
          const members = json.data.enrollments as GroupMember[]
          setGroupMembers(members)
          setStudentsPresence((prev) => (prev.length > 0 ? prev : members.map((m) => ({ enrollmentId: m.id, presence: 'PRESENTE' }))))
        } else setGroupMembers([])
      })
      .catch(() => setGroupMembers([]))
      .finally(() => setLoadingGroup(false))
  }, [selectedLesson?.enrollment?.nomeGrupo, isGroupLesson])

  const getPresenceLabel = (p: string) =>
    p === 'PRESENTE' ? t('professor.calendar.presencePresent') : p === 'NAO_COMPARECEU' ? t('professor.calendar.presenceAbsent') : t('professor.calendar.presenceLate')
  const getLessonTypeLabel = (type: string) =>
    type === 'NORMAL' ? t('professor.calendar.lessonTypeNormal') : type === 'CONVERSAÇÃO' ? t('professor.calendar.lessonTypeConversation') : type === 'REVISAO' ? t('professor.calendar.lessonTypeRevisao') : t('professor.calendar.lessonTypeAvaliacao')
  const getCursoLabel = (c: string) =>
    c === 'INGLES' ? t('professor.calendar.courseEnglish') : c === 'ESPANHOL' ? t('professor.calendar.courseSpanish') : t('professor.calendar.courseBoth')

  const handlePreencherUltima = () => {
    if (!ultimaRecord || !selectedLesson) return
    setForm({
      status: (['CONFIRMED', 'CANCELLED', 'REPOSICAO'].includes(ultimaRecord.status) ? ultimaRecord.status : 'CONFIRMED') as FormStatus,
      presence: (['PRESENTE', 'NAO_COMPARECEU', 'ATRASADO'].includes(ultimaRecord.presence) ? ultimaRecord.presence : 'PRESENTE') as FormPresence,
      lessonType: (['NORMAL', 'CONVERSAÇÃO', 'REVISAO', 'AVALIACAO'].includes(ultimaRecord.lessonType) ? ultimaRecord.lessonType : 'NORMAL') as FormLessonType,
      curso: ultimaRecord.curso || '',
      tempoAulaMinutos: ultimaRecord.tempoAulaMinutos ?? selectedLesson.durationMinutes ?? '',
      book: ultimaRecord.book || '',
      lastPage: ultimaRecord.lastPage || '',
      assignedHomework: ultimaRecord.assignedHomework || '',
      homeworkDone: (ultimaRecord.homeworkDone || '') as string,
      conversationDescription: ultimaRecord.conversationDescription || '',
      notes: ultimaRecord.notes || '',
      notesForStudent: ultimaRecord.notesForStudent || '',
      notesForParents: ultimaRecord.notesForParents || '',
      gradeGrammar: ultimaRecord.gradeGrammar ?? '',
      gradeSpeaking: ultimaRecord.gradeSpeaking ?? '',
      gradeListening: ultimaRecord.gradeListening ?? '',
      gradeUnderstanding: ultimaRecord.gradeUnderstanding ?? '',
    })
    if (ultimaRecord.studentPresences?.length) {
      setStudentsPresence(ultimaRecord.studentPresences.map((s) => ({ enrollmentId: s.enrollmentId, presence: s.presence })))
    }
    setToast({ message: 'Formulário preenchido com os dados da última aula', type: 'success' })
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedLesson) return
    if (!editingRecordId && selectedLessonIsHoliday) {
      setToast({ message: t('professor.calendar.noWorkOnHolidays'), type: 'error' })
      return
    }
    if (!editingRecordId && selectedLessonIsFuture) {
      setToast({ message: t('professor.calendar.noFutureLessonRecord'), type: 'error' })
      return
    }
    if (!form.book?.trim()) {
      setToast({ message: 'Preencha o campo Livro do aluno.', type: 'error' })
      return
    }
    if (!form.lastPage?.trim()) {
      setToast({ message: 'Preencha o campo Última página trabalhada.', type: 'error' })
      return
    }

    const lessonIdToRegister = selectedLesson.id
    let url: string
    let method: string
    let payload: object

    if (editingRecordId) {
      url = `/api/professor/lesson-records/${editingRecordId}`
      method = 'PATCH'
      payload = {
        presence: form.presence,
        ...(isGroupLesson && studentsPresence.length > 0 ? { studentsPresence } : {}),
        lessonType: form.lessonType,
        tempoAulaMinutos: selectedLesson.durationMinutes ?? null,
        book: form.book || null,
        lastPage: form.lastPage || null,
        assignedHomework: form.assignedHomework || null,
        homeworkDone: form.homeworkDone || null,
        conversationDescription: form.lessonType === 'CONVERSAÇÃO' ? (form.conversationDescription || null) : null,
        notes: form.notes || null,
        notesForStudent: form.notesForStudent || null,
        notesForParents: form.notesForParents || null,
        gradeGrammar: form.lessonType === 'AVALIACAO' && form.gradeGrammar !== '' ? Number(form.gradeGrammar) : null,
        gradeSpeaking: form.lessonType === 'AVALIACAO' && form.gradeSpeaking !== '' ? Number(form.gradeSpeaking) : null,
        gradeListening: form.lessonType === 'AVALIACAO' && form.gradeListening !== '' ? Number(form.gradeListening) : null,
        gradeUnderstanding: form.lessonType === 'AVALIACAO' && form.gradeUnderstanding !== '' ? Number(form.gradeUnderstanding) : null,
      }
    } else {
      url = '/api/professor/lesson-records'
      method = 'POST'
      payload = {
        lessonId: selectedLesson.id,
        status: (selectedLesson.status === 'CANCELLED' || selectedLesson.status === 'REPOSICAO' ? selectedLesson.status : 'CONFIRMED') as 'CONFIRMED' | 'CANCELLED' | 'REPOSICAO',
        presence: form.presence,
        ...(isGroupLesson && studentsPresence.length > 0 ? { studentsPresence } : {}),
        lessonType: form.lessonType,
        curso: (selectedLesson.enrollment?.curso || form.curso || null),
        tempoAulaMinutos: selectedLesson.durationMinutes ?? null,
        book: form.book || null,
        lastPage: form.lastPage || null,
        assignedHomework: form.assignedHomework || null,
        homeworkDone: form.homeworkDone || null,
        conversationDescription: form.lessonType === 'CONVERSAÇÃO' ? (form.conversationDescription || null) : null,
        notes: form.notes || null,
        notesForStudent: form.notesForStudent || null,
        notesForParents: form.notesForParents || null,
        gradeGrammar: form.lessonType === 'AVALIACAO' && form.gradeGrammar !== '' ? Number(form.gradeGrammar) : null,
        gradeSpeaking: form.lessonType === 'AVALIACAO' && form.gradeSpeaking !== '' ? Number(form.gradeSpeaking) : null,
        gradeListening: form.lessonType === 'AVALIACAO' && form.gradeListening !== '' ? Number(form.gradeListening) : null,
        gradeUnderstanding: form.lessonType === 'AVALIACAO' && form.gradeUnderstanding !== '' ? Number(form.gradeUnderstanding) : null,
      }
    }

    closeModal()
    setRegisteringLessonId(lessonIdToRegister)

    fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(payload),
    })
      .then((res) => res.json())
      .then((json) => {
        if (!json.ok) {
          setToast({ message: json.message || 'Erro ao salvar', type: 'error' })
          return
        }
        setToast({ message: editingRecordId ? 'Registro atualizado' : 'Registro de aula criado', type: 'success' })
        fetchData()
      })
      .catch(() => setToast({ message: 'Erro ao salvar', type: 'error' }))
      .finally(() => setRegisteringLessonId(null))
  }

  const hasPeriod = periodStart != null && periodEnd != null
  const periodLabel = hasPeriod
    ? `${periodStart.split('-').reverse().join('/')} – ${periodEnd.split('-').reverse().join('/')}`
    : null

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
        <ClipboardList className="w-7 h-7 text-brand-orange" />
        {t('professor.registerClasses.title')}
      </h1>

      {/* Cubos de resumo */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
          <div className="flex items-center gap-2 text-gray-500 mb-1">
            <BookOpen className="w-5 h-5 shrink-0" />
            <span className="text-sm font-medium">{t('professor.registerClasses.stats.registered')}</span>
          </div>
          <p className="text-xl font-bold text-gray-900 tabular-nums">{stats.totalAulasRegistradas}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
          <div className="flex items-center gap-2 text-gray-500 mb-1">
            <Clock className="w-5 h-5 shrink-0" />
            <span className="text-sm font-medium">{t('professor.registerClasses.stats.hours')}</span>
          </div>
          <p className="text-xl font-bold text-gray-900 tabular-nums">
            {typeof stats.totalHorasRegistradas === 'number' ? stats.totalHorasRegistradas.toFixed(2) : '0,00'}
          </p>
        </div>
        <div className={`rounded-xl border-2 p-4 shadow-sm ${periodPaid ? 'bg-green-50 border-green-300' : 'bg-white border-gray-200'}`}>
          <div className={`flex items-center gap-2 mb-1 ${periodPaid ? 'text-green-700' : 'text-gray-500'}`}>
            <Wallet className="w-5 h-5 shrink-0" />
            <span className="text-sm font-medium">{periodPaid ? t('professor.registerClasses.stats.received') : t('professor.registerClasses.stats.toReceive')}</span>
          </div>
          <p className={`text-xl font-bold tabular-nums ${periodPaid ? 'text-green-800' : 'text-gray-900'}`}>{valorFormatado}</p>
        </div>
        <button
          type="button"
          onClick={() => registrosEmAberto > 0 && setShowPendingList(true)}
          className={`rounded-xl border-2 p-4 text-left w-full transition-colors ${
            registrosEmAberto > 0
              ? 'cursor-pointer bg-red-500 border-red-600 text-white shadow-lg shadow-red-300 hover:bg-red-600 hover:border-red-700 hover:shadow-xl hover:shadow-red-400 animate-[pulse_2s_ease-in-out_infinite]'
              : 'cursor-default bg-white border-gray-200 opacity-90'
          }`}
        >
          <div className={`flex items-center gap-2 mb-1 ${registrosEmAberto > 0 ? 'text-red-100' : 'text-gray-500'}`}>
            <FileEdit className="w-5 h-5 shrink-0" />
            <span className="text-sm font-semibold">{t('professor.registerClasses.stats.pending')}</span>
          </div>
          <p className={`text-2xl font-bold tabular-nums ${registrosEmAberto > 0 ? 'text-white' : 'text-gray-900'}`}>{registrosEmAberto}</p>
        </button>
      </div>

      {/* Navegação entre períodos (meses) */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={goPrevMonth}
            className="flex items-center gap-1 px-3 py-2 rounded-lg border border-gray-200 bg-white text-gray-700 hover:bg-gray-50 text-sm font-medium"
            aria-label={t('professor.calendar.prev')}
          >
            <ChevronLeft className="w-5 h-5" />
            {t('professor.calendar.prev')}
          </button>
          <span className="min-w-[140px] text-center font-medium text-gray-900 capitalize">
            {monthYearLabel}
          </span>
          <button
            type="button"
            onClick={goNextMonth}
            className="flex items-center gap-1 px-3 py-2 rounded-lg border border-gray-200 bg-white text-gray-700 hover:bg-gray-50 text-sm font-medium"
            aria-label={t('professor.calendar.next')}
          >
            {t('professor.calendar.next')}
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>
        {isCurrentMonth && (
          <span className="text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded">
            {t('professor.registerClasses.currentMonth')}
          </span>
        )}
      </div>

      {hasPeriod && (
        <p className="text-sm text-gray-600">
          <span className="font-medium">{t('professor.registerClasses.period')}:</span> {periodLabel}
        </p>
      )}
      {!hasPeriod && !loading && (
        <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          {t('professor.registerClasses.noPeriod')}
        </p>
      )}

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <p className="text-gray-600 px-4 pt-4 pb-2 text-sm">
          {t('professor.registerClasses.clickToRegister')}
        </p>
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-12 text-gray-500">
            <Loader2 className="w-6 h-6 animate-spin" />
            <span>{t('professor.calendar.loading')}</span>
          </div>
        ) : error ? (
          <div className="px-4 py-8 text-center text-red-600">{error}</div>
        ) : lessons.length === 0 ? (
          <div className="px-4 py-8 text-center text-gray-500">
            {t('professor.registerClasses.noLessons')}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50 text-gray-600 text-sm font-medium">
                  <th className="px-4 py-3">{t('professor.registerClasses.date')}</th>
                  <th className="px-4 py-3">{t('professor.registerClasses.time')}</th>
                  <th className="px-4 py-3">{t('professor.registerClasses.student')}</th>
                  <th className="px-4 py-3 w-28">{t('professor.registerClasses.status')}</th>
                </tr>
              </thead>
              <tbody>
                {lessons.map((lesson) => {
                  const hasRecord = !!lesson.record?.id
                  const isCancelled = lesson.status === 'CANCELLED'
                  const isHoliday = holidays.has(toDateKeyInTZ(lesson.startAt))
                  const lessonStartMs = new Date(lesson.startAt).getTime()
                  const isFuture = lessonStartMs > Date.now()
                  const isInPaidPeriod =
                    !!paidPeriodRange &&
                    lessonStartMs >= paidPeriodRange.start &&
                    lessonStartMs <= paidPeriodRange.end
                  const clickable =
                    !hasRecord && !isCancelled && !isHoliday && !isFuture && (!periodPaid || !isInPaidPeriod)
                  return (
                    <tr
                      key={lesson.id}
                      onClick={() => clickable && handleLessonClick(lesson)}
                      className={`border-b border-gray-100 ${
                        clickable
                          ? 'cursor-pointer hover:bg-brand-orange/5 transition-colors'
                          : 'bg-gray-50/50'
                      }`}
                    >
                      <td className="px-4 py-3 text-gray-900 whitespace-nowrap">
                        {formatDateOnly(lesson.startAt, dateLocale)}
                      </td>
                      <td className="px-4 py-3 text-gray-700 whitespace-nowrap">
                        {formatTimeInTZ(lesson.startAt, dateLocale)}
                      </td>
                      <td className="px-4 py-3 text-gray-900 min-w-0 max-w-xs truncate" title={getLessonStudentLabel(lesson)}>
                        {getLessonStudentLabel(lesson)}
                      </td>
                      <td className="px-4 py-3">
                        {registeringLessonId === lesson.id ? (
                          <span className="inline-flex items-center gap-2 text-blue-700 text-sm">
                            <Loader2 className="w-4 h-4 shrink-0 animate-spin" />
                            {t('professor.registerClasses.registeringInBackground')}
                          </span>
                        ) : hasRecord ? (
                          <span className="inline-flex flex-wrap items-center gap-2">
                            <span className="inline-flex items-center gap-1 text-green-700 text-sm">
                              <CheckCircle className="w-4 h-4 shrink-0" />
                              {t('professor.registerClasses.registered')}
                            </span>
                            {lesson.record?.criadoEm && lesson.record?.atualizadoEm && new Date(lesson.record.atualizadoEm).getTime() > new Date(lesson.record.criadoEm).getTime() && (
                              <span className="rounded bg-amber-100 px-1.5 py-0.5 text-xs font-medium text-amber-800">
                                {t('professor.registerClasses.edited')}
                              </span>
                            )}
                            {!periodPaid || !isInPaidPeriod ? (
                            <button
                              type="button"
                              onClick={(e) => handleEditClick(e, lesson)}
                              className="inline-flex items-center gap-1 rounded border border-gray-300 bg-white px-2 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50"
                            >
                              <Pencil className="w-3 h-3" />
                              {t('professor.registerClasses.edit')}
                            </button>
                            ) : null}
                          </span>
                        ) : isCancelled ? (
                          <span className="text-gray-400 text-sm">—</span>
                        ) : isHoliday ? (
                          <span className="inline-flex items-center gap-1 text-amber-800 text-sm">
                            <CalendarX className="w-4 h-4 shrink-0" />
                            {t('professor.registerClasses.holiday')}
                          </span>
                        ) : isFuture ? (
                          <span className="inline-flex items-center gap-1 text-gray-500 text-sm">
                            <Clock className="w-4 h-4 shrink-0" />
                            {t('professor.registerClasses.notYetAvailable')}
                          </span>
                        ) : periodPaid && isInPaidPeriod ? (
                          <span className="text-gray-400 text-sm">—</span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-amber-700 text-sm">
                            <Circle className="w-4 h-4 shrink-0" />
                            {t('professor.registerClasses.pending')}
                          </span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Modal
        isOpen={modalOpen}
        onClose={closeModal}
        title={editingRecordId ? t('professor.registerClasses.editRecord') : t('professor.calendar.modalRegister')}
        size="xl"
        footer={
          <>
            <Button variant="outline" onClick={closeModal} disabled={saving}>
              {t('common.cancel')}
            </Button>
            {!editingRecordId && ultimaRecord && (
              <Button variant="outline" onClick={handlePreencherUltima} disabled={saving}>
                {t('professor.calendar.fillFromLast')}
              </Button>
            )}
            <Button variant="primary" onClick={() => void handleSubmit({ preventDefault: () => {} } as React.FormEvent)} disabled={saving || (!editingRecordId && (selectedLessonIsHoliday || selectedLessonIsFuture))}>
              {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
              {saving ? t('professor.calendar.saving') : editingRecordId ? t('professor.registerClasses.saveRecord') : t('professor.calendar.createRecord')}
            </Button>
          </>
        }
      >
        {selectedLesson && (
          <form onSubmit={handleSubmit} className="space-y-4 max-h-[60vh] overflow-y-auto pr-2">
            {editingRecordId && loadingRecord && (
              <div className="flex items-center justify-center gap-2 rounded-lg border border-gray-200 bg-gray-50 py-8 text-gray-600">
                <Loader2 className="w-5 h-5 animate-spin" />
                <span>Carregando registro...</span>
              </div>
            )}
            {!(editingRecordId && loadingRecord) && (
              <>
            {selectedLessonIsHoliday && (
              <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm font-semibold text-amber-800">
                {t('professor.calendar.noWorkOnHolidays')}
              </div>
            )}
            {selectedLessonIsFuture && (
              <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm font-semibold text-amber-800">
                {t('professor.calendar.noFutureLessonRecord')}
              </div>
            )}
            <p className="text-sm text-gray-600">
              {t('professor.calendar.modalClass')}: <strong>{formatDateTimeInTZ(selectedLesson.startAt, dateLocale)}</strong> — {getLessonStudentLabel(selectedLesson)}
            </p>

            {!isGroupLesson && (
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">{t('professor.calendar.studentPresence')} <span className="text-red-500">*</span></label>
                <select value={form.presence} onChange={(e) => setForm({ ...form, presence: e.target.value as FormPresence })} className="input w-full">
                  <option value="PRESENTE">{t('professor.calendar.presencePresent')}</option>
                  <option value="NAO_COMPARECEU">{t('professor.calendar.presenceAbsent')}</option>
                  <option value="ATRASADO">{t('professor.calendar.presenceLate')}</option>
                </select>
              </div>
            )}

            {isGroupLesson && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 space-y-3">
                <p className="text-sm font-semibold text-amber-800">{t('professor.calendar.groupClass')}: {selectedLesson.enrollment?.nomeGrupo?.trim()}</p>
                {loadingGroup && groupMembers.length === 0 ? (
                  <p className="text-sm text-amber-700">{t('professor.calendar.loadingGroup')}</p>
                ) : (
                  <div className="space-y-2">
                    <p className="text-xs text-amber-700 mb-2">{t('professor.calendar.presencePerStudent')} <span className="text-red-500">*</span></p>
                    {(groupMembers.length > 0 ? groupMembers : studentsPresence.map((s) => ({ id: s.enrollmentId, nome: s.enrollmentId }))).map((member) => {
                      const current = studentsPresence.find((s) => s.enrollmentId === member.id)
                      const value = current?.presence ?? 'PRESENTE'
                      return (
                        <div key={member.id} className="flex items-center gap-3">
                          <span className="text-sm font-medium text-gray-800 min-w-[140px]">{member.nome}</span>
                          <select
                            value={value}
                            onChange={(e) => {
                              const presence = e.target.value as 'PRESENTE' | 'NAO_COMPARECEU' | 'ATRASADO'
                              setStudentsPresence((prev) => {
                                const next = prev.filter((s) => s.enrollmentId !== member.id)
                                next.push({ enrollmentId: member.id, presence })
                                return next
                              })
                            }}
                            className="input flex-1 max-w-[180px]"
                          >
                            <option value="PRESENTE">{t('professor.calendar.presencePresent')}</option>
                            <option value="NAO_COMPARECEU">{t('professor.calendar.presenceAbsent')}</option>
                            <option value="ATRASADO">{t('professor.calendar.presenceLate')}</option>
                          </select>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )}

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">{t('professor.calendar.lessonType')} <span className="text-red-500">*</span></label>
              <select value={form.lessonType} onChange={(e) => setForm({ ...form, lessonType: e.target.value as FormLessonType })} className="input w-full" required>
                <option value="NORMAL">{t('professor.calendar.lessonTypeNormal')}</option>
                <option value="CONVERSAÇÃO">{t('professor.calendar.lessonTypeConversation')}</option>
                <option value="REVISAO">{t('professor.calendar.lessonTypeRevisao')}</option>
                <option value="AVALIACAO">{t('professor.calendar.lessonTypeAvaliacao')}</option>
              </select>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Curso</label>
                <select
                  value={selectedLesson.enrollment?.curso ?? form.curso}
                  disabled
                  className="input w-full bg-gray-100 cursor-not-allowed"
                  title="Curso definido pelo cadastro do aluno."
                >
                  <option value="">Selecione</option>
                  <option value="INGLES">Inglês</option>
                  <option value="ESPANHOL">Espanhol</option>
                  <option value="INGLES_E_ESPANHOL">Inglês e Espanhol</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Tempo de aula (min)</label>
                <input type="number" min={1} max={240} value={selectedLesson.durationMinutes ?? ''} readOnly disabled className="input w-full bg-gray-100 cursor-not-allowed" />
              </div>
            </div>

            {form.lessonType === 'CONVERSAÇÃO' && (
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Descrição da aula de conversação</label>
                <textarea value={form.conversationDescription} onChange={(e) => setForm({ ...form, conversationDescription: e.target.value })} className="input w-full min-h-[80px]" placeholder="Descreva o que foi trabalhado..." />
              </div>
            )}

            <div className="rounded-lg border border-blue-200 bg-blue-50 p-3">
              <p className="text-sm text-blue-800"><strong>Importante:</strong> Mesmo que a aula não seja normal, adicione livro e página. Se não trabalhou o livro, repita as últimas infos da última aula.</p>
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">Livro do aluno <span className="text-red-500">*</span></label>
              <input type="text" value={form.book} onChange={(e) => setForm({ ...form, book: e.target.value })} className="input w-full" placeholder="Ex.: Book 1" required aria-required="true" />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">Última página trabalhada <span className="text-red-500">*</span></label>
              <input type="text" value={form.lastPage} onChange={(e) => setForm({ ...form, lastPage: e.target.value })} className="input w-full" placeholder="Ex.: 42" required aria-required="true" />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">Tarefa designada</label>
              <textarea value={form.assignedHomework} onChange={(e) => setForm({ ...form, assignedHomework: e.target.value })} className="input w-full min-h-[60px]" placeholder="Opcional" />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">Última tarefa feita?</label>
              <select value={form.homeworkDone} onChange={(e) => setForm({ ...form, homeworkDone: e.target.value })} className="input w-full">
                <option value="">—</option>
                <option value="SIM">Sim</option>
                <option value="NAO">Não</option>
                <option value="PARCIAL">Parcial</option>
                <option value="NAO_APLICA">Não aplica</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">Obs (observações gerais)</label>
              <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className="input w-full min-h-[60px]" placeholder="Opcional" />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">Obs para os alunos</label>
              <textarea value={form.notesForStudent} onChange={(e) => setForm({ ...form, notesForStudent: e.target.value })} className="input w-full min-h-[60px]" placeholder="Opcional" />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">Obs para os pais</label>
              <textarea value={form.notesForParents} onChange={(e) => setForm({ ...form, notesForParents: e.target.value })} className="input w-full min-h-[60px]" placeholder="Opcional" />
            </div>
            {form.lessonType === 'AVALIACAO' && (
              <div className="space-y-3 pt-3 border-t border-gray-200">
                <p className="text-sm font-semibold text-gray-700">Notas (avaliação)</p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-gray-600 mb-1">Gramática</label>
                    <input type="number" step="0.1" min={0} max={10} value={form.gradeGrammar} onChange={(e) => setForm({ ...form, gradeGrammar: e.target.value })} className="input w-full" />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-600 mb-1">Speaking</label>
                    <input type="number" step="0.1" min={0} max={10} value={form.gradeSpeaking} onChange={(e) => setForm({ ...form, gradeSpeaking: e.target.value })} className="input w-full" />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-600 mb-1">Listening</label>
                    <input type="number" step="0.1" min={0} max={10} value={form.gradeListening} onChange={(e) => setForm({ ...form, gradeListening: e.target.value })} className="input w-full" />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-600 mb-1">Understanding</label>
                    <input type="number" step="0.1" min={0} max={10} value={form.gradeUnderstanding} onChange={(e) => setForm({ ...form, gradeUnderstanding: e.target.value })} className="input w-full" />
                  </div>
                </div>
              </div>
            )}
              </>
            )}
          </form>
        )}
      </Modal>

      <Modal
        isOpen={showPendingList}
        onClose={() => setShowPendingList(false)}
        title={t('professor.registerClasses.pendingList.title')}
        size="md"
      >
        <p className="text-sm text-gray-600 mb-4">
          {t('professor.registerClasses.pendingList.clickToRegister')}
        </p>
        {pendingLessons.length === 0 ? (
          <p className="text-gray-500 py-4">{t('professor.registerClasses.pendingList.empty')}</p>
        ) : (
          <ul className="divide-y divide-gray-100 max-h-[50vh] overflow-y-auto">
            {pendingLessons.map((lesson) => (
              <li key={lesson.id}>
                <button
                  type="button"
                  onClick={() => handleLessonClick(lesson)}
                  className="w-full text-left px-3 py-3 rounded-lg hover:bg-brand-orange/10 transition-colors flex flex-wrap items-center gap-x-4 gap-y-1"
                >
                  <span className="font-medium text-gray-900 tabular-nums">
                    {formatDateOnly(lesson.startAt, dateLocale)} {formatTimeInTZ(lesson.startAt, dateLocale)}
                  </span>
                  <span className="text-gray-700 truncate min-w-0" title={getLessonStudentLabel(lesson)}>
                    {getLessonStudentLabel(lesson)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Modal>

      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}
    </div>
  )
}
