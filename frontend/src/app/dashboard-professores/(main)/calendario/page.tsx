/**
 * Dashboard Professores – Calendário (clique na aula: ver última / registrar aula)
 */

'use client'

import { useState, useMemo, useEffect, useCallback } from 'react'
import { ChevronLeft, ChevronRight, CheckCircle, XCircle, RotateCcw, FileText, ClipboardList, Loader2, ArrowLeft } from 'lucide-react'
import Modal from '@/components/admin/Modal'
import Button from '@/components/ui/Button'
import Toast from '@/components/admin/Toast'
import { useLanguage } from '@/contexts/LanguageContext'

type ViewType = 'month' | 'week' | 'day'
type ModalStep = 'choose' | 'ver-ultima' | 'registrar'

interface Lesson {
  id: string
  enrollmentId: string
  teacherId: string
  status: 'CONFIRMED' | 'CANCELLED' | 'REPOSICAO'
  startAt: string
  durationMinutes: number
  notes: string | null
  enrollment: {
    id: string
    nome: string
    tipoAula: string | null
    nomeGrupo: string | null
    groupMemberNames?: string[]
  }
  teacher: { id: string; nome: string }
  record?: { id: string } | null
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

const DATE_LOCALE_MAP = { 'pt-BR': 'pt-BR', en: 'en-US', es: 'es' } as const

function getStartOfWeek(d: Date): Date {
  const date = new Date(d)
  const day = date.getDay()
  date.setDate(date.getDate() - day)
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
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}

function isSameMonth(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth()
}

function isToday(d: Date): boolean {
  return isSameDay(d, new Date())
}

function formatTime(iso: string): string {
  const d = new Date(iso)
  return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`
}

function formatDateTime(iso: string, dateLocale: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString(dateLocale, { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function getLessonStudentLabel(l: Lesson): string {
  const enr = l.enrollment
  if (enr?.tipoAula === 'GRUPO' && enr?.nomeGrupo?.trim()) {
    const groupName = enr.nomeGrupo.trim()
    const members = enr.groupMemberNames?.length ? enr.groupMemberNames.join(', ') : ''
    return members ? `${groupName} — ${members}` : groupName
  }
  return l.enrollment.nome
}

const statusColor = (s: string) =>
  s === 'CONFIRMED' ? 'bg-green-100 text-green-800 border-green-200' : s === 'CANCELLED' ? 'bg-red-100 text-red-800 border-red-200' : 'bg-amber-100 text-amber-800 border-amber-200'

export default function CalendarioProfessorPage() {
  const { locale, t } = useLanguage()
  const dateLocale = DATE_LOCALE_MAP[locale] ?? 'pt-BR'
  const DIAS_SEMANA = useMemo(
    () => [0, 1, 2, 3, 4, 5, 6].map((d) => new Date(2024, 0, d).toLocaleDateString(dateLocale, { weekday: 'short' })),
    [dateLocale]
  )
  const MESES = useMemo(
    () => [...Array(12)].map((_, i) => new Date(2024, i, 1).toLocaleDateString(dateLocale, { month: 'long' })),
    [dateLocale]
  )
  const statusLabel = (s: string) =>
    s === 'CONFIRMED' ? t('professor.calendar.statusConfirmed') : s === 'CANCELLED' ? t('professor.calendar.statusCancelled') : t('professor.calendar.statusReposicao')
  const getPresenceLabel = (p: string) =>
    p === 'PRESENTE' ? t('professor.calendar.presencePresent') : p === 'NAO_COMPARECEU' ? t('professor.calendar.presenceAbsent') : t('professor.calendar.presenceLate')
  const getLessonTypeLabel = (type: string) =>
    type === 'NORMAL' ? t('professor.calendar.lessonTypeNormal') : type === 'CONVERSAÇÃO' ? t('professor.calendar.lessonTypeConversation') : type === 'REVISAO' ? t('professor.calendar.lessonTypeRevisao') : t('professor.calendar.lessonTypeAvaliacao')
  const getCursoLabel = (c: string) =>
    c === 'INGLES' ? t('professor.calendar.courseEnglish') : c === 'ESPANHOL' ? t('professor.calendar.courseSpanish') : t('professor.calendar.courseBoth')
  const [view, setView] = useState<ViewType>('month')
  const [currentDate, setCurrentDate] = useState(() => new Date())
  const [lessons, setLessons] = useState<Lesson[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [selectedLesson, setSelectedLesson] = useState<Lesson | null>(null)
  const [modalStep, setModalStep] = useState<ModalStep>('choose')
  const [ultimaRecord, setUltimaRecord] = useState<UltimaRecord | null>(null)
  const [ultimaLoading, setUltimaLoading] = useState(false)
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null)

  const emptyForm = {
    status: 'CONFIRMED' as const,
    presence: 'PRESENTE' as const,
    lessonType: 'NORMAL' as const,
    curso: '' as string,
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
  const [form, setForm] = useState(emptyForm)
  const [studentsPresence, setStudentsPresence] = useState<{ enrollmentId: string; presence: string }[]>([])
  const [groupMembers, setGroupMembers] = useState<GroupMember[]>([])
  const [loadingGroup, setLoadingGroup] = useState(false)
  const [saving, setSaving] = useState(false)

  const modalOpen = selectedLesson !== null

  const closeModal = useCallback(() => {
    setSelectedLesson(null)
    setModalStep('choose')
    setUltimaRecord(null)
    setForm(emptyForm)
    setStudentsPresence([])
    setGroupMembers([])
  }, [])

  const openLesson = useCallback((lesson: Lesson) => {
    setSelectedLesson(lesson)
    setModalStep(lesson.status === 'CANCELLED' ? 'ver-ultima' : 'choose')
    setUltimaRecord(null)
  }, [])

  const fetchLessons = useCallback(async () => {
    let start: Date
    let end: Date
    if (view === 'month') {
      start = getStartOfMonth(currentDate)
      end = addMonths(start, 1)
      end.setDate(0)
      end.setHours(23, 59, 59, 999)
    } else if (view === 'week') {
      start = getStartOfWeek(currentDate)
      end = addDays(start, 7)
      end.setSeconds(-1)
    } else {
      start = new Date(currentDate)
      start.setHours(0, 0, 0, 0)
      end = new Date(currentDate)
      end.setHours(23, 59, 59, 999)
    }
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams({ start: start.toISOString(), end: end.toISOString() })
      const res = await fetch(`/api/professor/lessons?${params}`, { credentials: 'include' })
      const json = await res.json()
      if (res.ok && json.ok) setLessons(json.data.lessons || [])
      else setError(json.message || t('professor.calendar.errorLoad'))
    } catch (e) {
      setError(t('professor.calendar.errorLoad'))
    } finally {
      setLoading(false)
    }
  }, [view, currentDate, t])

  useEffect(() => {
    fetchLessons()
  }, [fetchLessons])

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

  const isGroupLesson = selectedLesson?.enrollment?.tipoAula === 'GRUPO' && selectedLesson?.enrollment?.nomeGrupo?.trim()

  useEffect(() => {
    if (modalStep !== 'registrar' || !selectedLesson || !isGroupLesson) {
      if (modalStep !== 'registrar') setGroupMembers([])
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
          setStudentsPresence((prev) => {
            if (prev.length > 0) return prev
            return members.map((m) => ({ enrollmentId: m.id, presence: 'PRESENTE' }))
          })
        } else setGroupMembers([])
      })
      .catch(() => setGroupMembers([]))
      .finally(() => setLoadingGroup(false))
  }, [modalStep, selectedLesson?.enrollment?.nomeGrupo, isGroupLesson])


  const handleVerUltima = () => setModalStep('ver-ultima')
  const handleRegistrar = () => {
    setModalStep('registrar')
    setForm({
      ...emptyForm,
      tempoAulaMinutos: selectedLesson?.durationMinutes ?? '',
    })
    setStudentsPresence([])
  }

  const handlePreencherUltima = () => {
    if (!ultimaRecord) return
    setForm({
      status: ultimaRecord.status as 'CONFIRMED' | 'CANCELLED' | 'REPOSICAO',
      presence: ultimaRecord.presence as 'PRESENTE' | 'NAO_COMPARECEU' | 'ATRASADO',
      lessonType: ultimaRecord.lessonType as 'NORMAL' | 'CONVERSAÇÃO' | 'REVISAO' | 'AVALIACAO',
      curso: ultimaRecord.curso || '',
      tempoAulaMinutos: ultimaRecord.tempoAulaMinutos ?? selectedLesson?.durationMinutes ?? '',
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
      setStudentsPresence(
        ultimaRecord.studentPresences.map((s) => ({ enrollmentId: s.enrollmentId, presence: s.presence }))
      )
    }
    setToast({ message: 'Formulário preenchido com os dados da última aula', type: 'success' })
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedLesson) return
    setSaving(true)
    try {
      const payload = {
        lessonId: selectedLesson.id,
        status: form.status,
        presence: form.presence,
        ...(isGroupLesson && studentsPresence.length > 0 ? { studentsPresence } : {}),
        lessonType: form.lessonType,
        curso: form.curso || null,
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
      const res = await fetch('/api/professor/lesson-records', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload),
      })
      const json = await res.json()
      if (!res.ok || !json.ok) {
        setToast({ message: json.message || 'Erro ao salvar', type: 'error' })
        return
      }
      setToast({ message: 'Registro de aula criado', type: 'success' })
      closeModal()
      fetchLessons()
    } catch {
      setToast({ message: 'Erro ao salvar', type: 'error' })
    } finally {
      setSaving(false)
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
  const timeSlots = useMemo(() => {
    const slots: { hour: number; minute: number }[] = []
    for (let h = 6; h <= 23; h++) {
      slots.push({ hour: h, minute: 0 })
      if (h < 23) slots.push({ hour: h, minute: 30 })
    }
    return slots
  }, [])

  const getLessonsForDay = (day: Date) => lessons.filter((l) => isSameDay(new Date(l.startAt), day))
  const getLessonsForSlot = (day: Date, slotHour: number, slotMinute: number) => {
    const slotStart = new Date(day)
    slotStart.setHours(slotHour, slotMinute, 0, 0)
    const slotEnd = new Date(day)
    slotEnd.setHours(slotMinute === 30 ? slotHour + 1 : slotHour, slotMinute === 30 ? 0 : 30, 0, 0)
    return lessons.filter((l) => {
      const start = new Date(l.startAt)
      return start >= slotStart && start < slotEnd
    })
  }

  const stats = useMemo(() => {
    const confirmed = lessons.filter((l) => l.status === 'CONFIRMED').length
    const cancelled = lessons.filter((l) => l.status === 'CANCELLED').length
    const reposicao = lessons.filter((l) => l.status === 'REPOSICAO').length
    return { confirmed, cancelled, reposicao }
  }, [lessons])

  const formatSlotLabel = (slot: { hour: number; minute: number }) =>
    `${slot.hour.toString().padStart(2, '0')}:${slot.minute.toString().padStart(2, '0')}`

  return (
    <div className="min-w-0">
      <h1 className="text-xl sm:text-2xl font-bold text-gray-900 mb-1 sm:mb-2">{t('professor.calendar.title')}</h1>
      <p className="text-sm sm:text-base text-gray-600 mb-3 sm:mb-4">{t('professor.calendar.subtitle')}</p>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4 mb-3 sm:mb-4">
        <div className="flex rounded-lg border border-gray-200 overflow-hidden bg-white shrink-0">
          <button
            type="button"
            onClick={() => setView('month')}
            className={`px-3 py-2 sm:px-4 text-xs sm:text-sm font-medium min-w-0 ${view === 'month' ? 'bg-brand-orange text-white' : 'text-gray-600 hover:bg-gray-100'}`}
          >
            {t('professor.calendar.viewMonth')}
          </button>
          <button
            type="button"
            onClick={() => setView('week')}
            className={`px-3 py-2 sm:px-4 text-xs sm:text-sm font-medium min-w-0 ${view === 'week' ? 'bg-brand-orange text-white' : 'text-gray-600 hover:bg-gray-100'}`}
          >
            {t('professor.calendar.viewWeek')}
          </button>
          <button
            type="button"
            onClick={() => setView('day')}
            className={`px-3 py-2 sm:px-4 text-xs sm:text-sm font-medium min-w-0 ${view === 'day' ? 'bg-brand-orange text-white' : 'text-gray-600 hover:bg-gray-100'}`}
          >
            {t('professor.calendar.viewDay')}
          </button>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button type="button" onClick={goPrev} className="p-2 rounded border border-gray-200 hover:bg-gray-50 touch-manipulation min-h-[44px] min-w-[44px]" title={t('professor.calendar.prev')} aria-label={t('professor.calendar.prev')}>
            <ChevronLeft className="w-5 h-5" />
          </button>
          <button type="button" onClick={goToday} className="px-3 py-2 sm:px-4 text-sm border border-gray-200 rounded hover:bg-gray-50 touch-manipulation min-h-[44px]">
            {t('professor.calendar.today')}
          </button>
          <button type="button" onClick={goNext} className="p-2 rounded border border-gray-200 hover:bg-gray-50 touch-manipulation min-h-[44px] min-w-[44px]" title={t('professor.calendar.next')} aria-label={t('professor.calendar.next')}>
            <ChevronRight className="w-5 h-5" />
          </button>
          <h2 className="text-base sm:text-lg font-semibold text-gray-800 w-full sm:w-auto order-first sm:order-none">{titleLabel}</h2>
        </div>
      </div>

      {/* Resumo do período */}
      <div className="mb-3 sm:mb-4 grid grid-cols-3 gap-2 sm:gap-3 max-w-md">
        <div className="flex items-center gap-1.5 sm:gap-2 p-2 sm:p-3 bg-white rounded-lg border border-gray-200 min-w-0">
          <CheckCircle className="w-4 h-4 sm:w-5 sm:h-5 text-green-600 shrink-0" />
          <span className="text-xs sm:text-sm font-medium text-gray-700 truncate">{stats.confirmed} {t('professor.calendar.confirmed')}</span>
        </div>
        <div className="flex items-center gap-1.5 sm:gap-2 p-2 sm:p-3 bg-white rounded-lg border border-gray-200 min-w-0">
          <XCircle className="w-4 h-4 sm:w-5 sm:h-5 text-red-600 shrink-0" />
          <span className="text-xs sm:text-sm font-medium text-gray-700 truncate">{stats.cancelled} {t('professor.calendar.cancelled')}</span>
        </div>
        <div className="flex items-center gap-1.5 sm:gap-2 p-2 sm:p-3 bg-white rounded-lg border border-gray-200 min-w-0">
          <RotateCcw className="w-4 h-4 sm:w-5 sm:h-5 text-amber-600 shrink-0" />
          <span className="text-xs sm:text-sm font-medium text-gray-700 truncate">{stats.reposicao} {t('professor.calendar.reposicoes')}</span>
        </div>
      </div>

      {error && <div className="mb-4 p-4 bg-red-50 text-red-800 rounded-lg text-sm">{error}</div>}
      {loading && <div className="mb-4 text-sm text-gray-500">{t('professor.calendar.loading')}</div>}

      {view === 'month' && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-x-auto min-w-0">
          <div className="grid grid-cols-7 min-w-[280px]">
            {DIAS_SEMANA.map((dia, idx) => (
              <div key={dia} className={`py-1.5 sm:py-2 text-center text-[10px] sm:text-xs font-semibold uppercase ${idx === 0 ? 'text-red-700 bg-red-50' : 'text-gray-600'}`}>
                {dia}
              </div>
            ))}
            {monthGrid.map((week, wi) =>
              week.map((day, di) => {
                const otherMonth = !isSameMonth(day, currentDate)
                const dayLessons = getLessonsForDay(day)
                return (
                  <div
                    key={`${wi}-${di}`}
                    className={`min-h-[72px] sm:min-h-[100px] md:min-h-[120px] border-b border-r border-gray-100 p-1 sm:p-2 ${
                      otherMonth ? 'bg-gray-50/50' : di === 0 ? 'bg-red-50' : 'bg-white'
                    } ${di === 6 ? 'border-r-0' : ''}`}
                  >
                    <span
                      className={`inline-flex items-center justify-center w-6 h-6 sm:w-7 sm:h-7 rounded-full text-xs sm:text-sm ${
                        isToday(day) ? 'bg-brand-orange text-white font-semibold' : otherMonth ? 'text-gray-400' : di === 0 ? 'text-red-700' : 'text-gray-800'
                      }`}
                    >
                      {day.getDate()}
                    </span>
                    <div className="mt-0.5 sm:mt-1 space-y-0.5">
                      {dayLessons.slice(0, 3).map((l) => (
                        <button
                          key={l.id}
                          type="button"
                          onClick={() => openLesson(l)}
                          className={`w-full text-left text-[10px] sm:text-xs px-1 sm:px-1.5 py-0.5 rounded border break-words line-clamp-2 cursor-pointer hover:ring-2 hover:ring-brand-orange/50 touch-manipulation min-h-[32px] ${statusColor(l.status)}`}
                          title={`${getLessonStudentLabel(l)} – ${statusLabel(l.status)} ${t('professor.calendar.clickToView')}`}
                        >
                          {getLessonStudentLabel(l)} {formatTime(l.startAt)}
                        </button>
                      ))}
                      {dayLessons.length > 3 && <span className="text-[10px] sm:text-xs text-gray-400">+{dayLessons.length - 3}</span>}
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </div>
      )}

      {view === 'week' && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-x-auto min-w-0">
          <div className="min-w-[600px] sm:min-w-0">
            <div className="grid grid-cols-8 border-b border-gray-200 bg-gray-50">
              <div className="py-2 text-xs font-semibold text-gray-500 border-r border-gray-200 pl-2 w-12 sm:w-14 shrink-0">{t('professor.calendar.time')}</div>
              {Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)).map((d) => (
                <div key={d.toISOString()} className={`py-2 text-center text-xs font-semibold min-w-0 ${d.getDay() === 0 ? 'text-red-700 bg-red-50' : isToday(d) ? 'text-brand-orange bg-orange-50' : 'text-gray-600'}`}>
                  <div className="truncate">{DIAS_SEMANA[d.getDay()]}</div>
                  <div className="font-normal">{d.getDate()}</div>
                </div>
              ))}
            </div>
            <div className="max-h-[60vh] sm:max-h-[70vh] overflow-y-auto overflow-x-auto">
              {timeSlots.map((slot) => (
                <div key={`${slot.hour}-${slot.minute}`} className="grid grid-cols-8 border-b border-gray-100 min-h-[40px]">
                  <div className="py-1 pl-2 text-xs text-gray-500 border-r border-gray-100 w-12 sm:w-14 shrink-0">{formatSlotLabel(slot)}</div>
                  {Array.from({ length: 7 }, (_, i) => {
                    const d = addDays(weekStart, i)
                    const slotLessons = getLessonsForSlot(d, slot.hour, slot.minute)
                    return (
                      <div key={i} className={`border-r border-gray-50 last:border-r-0 p-1 flex flex-col gap-0.5 min-w-0 ${d.getDay() === 0 ? 'bg-red-50' : ''}`}>
                        {slotLessons.map((l) => (
                          <button
                            key={l.id}
                            type="button"
                            onClick={() => openLesson(l)}
                            className={`text-[10px] text-left px-1 py-0.5 rounded border break-words line-clamp-2 cursor-pointer hover:ring-2 hover:ring-brand-orange/50 touch-manipulation ${statusColor(l.status)}`}
                          >
                            {getLessonStudentLabel(l)}
                          </button>
                        ))}
                      </div>
                    )
                  })}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {view === 'day' && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden min-w-0">
          <div className={`border-b border-gray-200 px-3 sm:px-4 py-2 text-sm font-semibold ${currentDate.getDay() === 0 ? 'bg-red-50 text-red-700' : 'bg-gray-50 text-gray-700'}`}>
            {DIAS_SEMANA[currentDate.getDay()]} – {currentDate.getDate()} {MESES[currentDate.getMonth()]}
          </div>
          <div className={`max-h-[65vh] sm:max-h-[70vh] overflow-y-auto overflow-x-hidden ${currentDate.getDay() === 0 ? 'bg-red-50/30' : ''}`}>
            {timeSlots.map((slot) => {
              const slotLessons = getLessonsForSlot(currentDate, slot.hour, slot.minute)
              return (
                <div key={`${slot.hour}-${slot.minute}`} className="flex border-b border-gray-100 min-h-[52px] sm:min-h-[48px]">
                  <div className="w-14 sm:w-16 shrink-0 py-2 sm:py-1.5 pl-2 text-xs text-gray-500 border-r border-gray-100">{formatSlotLabel(slot)}</div>
                  <div className="flex-1 min-w-0 p-2 flex flex-col gap-1">
                    {slotLessons.map((l) => (
                      <button
                        key={l.id}
                        type="button"
                        onClick={() => openLesson(l)}
                        className={`text-sm text-left px-2 py-2 sm:py-1 rounded border w-full max-w-full break-words cursor-pointer hover:ring-2 hover:ring-brand-orange/50 touch-manipulation ${statusColor(l.status)}`}
                      >
                        {getLessonStudentLabel(l)} – {statusLabel(l.status)} ({formatTime(l.startAt)})
                      </button>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      <Modal
        isOpen={modalOpen}
        onClose={closeModal}
        title={
          modalStep === 'choose'
            ? t('professor.calendar.modalClass')
            : modalStep === 'ver-ultima'
              ? t('professor.calendar.modalLastClass')
              : t('professor.calendar.modalRegister')
        }
        size={modalStep === 'registrar' ? 'xl' : 'md'}
        footer={
          modalStep === 'choose' ? (
            <div className="flex flex-col sm:flex-row gap-2 w-full">
              <Button variant="outline" onClick={handleVerUltima} className="flex-1" disabled={ultimaLoading}>
                {ultimaLoading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <FileText className="w-4 h-4 mr-2" />}
                {t('professor.calendar.viewLastClass')}
              </Button>
              {!selectedLesson?.record && selectedLesson?.status !== 'CANCELLED' && (
                <Button variant="primary" onClick={handleRegistrar} className="flex-1">
                  <ClipboardList className="w-4 h-4 mr-2" />
                  {t('professor.calendar.registerClass')}
                </Button>
              )}
            </div>
          ) : modalStep === 'ver-ultima' ? (
            <Button variant="outline" onClick={() => setModalStep('choose')}>
              <ArrowLeft className="w-4 h-4 mr-2" />
              {t('professor.calendar.back')}
            </Button>
          ) : (
            <>
              <Button variant="outline" onClick={() => setModalStep('choose')} disabled={saving}>
                {t('common.cancel')}
              </Button>
              {ultimaRecord && (
                <Button variant="outline" onClick={handlePreencherUltima} disabled={saving}>
                  {t('professor.calendar.fillFromLast')}
                </Button>
              )}
              <Button variant="primary" onClick={handleSubmit} disabled={saving}>
                {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                {saving ? t('professor.calendar.saving') : t('professor.calendar.createRecord')}
              </Button>
            </>
          )
        }
      >
        {modalStep === 'choose' && selectedLesson && (
          <div className="space-y-3">
            <p className="text-gray-600">
              <strong>{getLessonStudentLabel(selectedLesson)}</strong>
            </p>
            <p className="text-sm text-gray-600">
              {formatDateTime(selectedLesson.startAt, dateLocale)} — {selectedLesson.durationMinutes} min
            </p>
            <p className="text-sm">
              {t('professor.calendar.status')}: <span className={statusColor(selectedLesson.status)}>{statusLabel(selectedLesson.status)}</span>
            </p>
            {selectedLesson.record && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                {t('professor.calendar.hasRecordNotice')}
              </div>
            )}
          </div>
        )}

        {modalStep === 'ver-ultima' && (
          <div className="space-y-3">
            {ultimaLoading ? (
              <div className="flex items-center gap-2 text-gray-500">
                <Loader2 className="w-5 h-5 animate-spin" />
                {t('professor.calendar.loadingLastClass')}
              </div>
            ) : ultimaRecord ? (
              <div className="space-y-3 text-sm">
                <p className="text-gray-600">
                  {t('professor.calendar.classOf')} <strong>{formatDateTime(ultimaRecord.lesson.startAt, dateLocale)}</strong> — {ultimaRecord.lesson.enrollment?.nome ?? ultimaRecord.lesson.enrollment?.nomeGrupo ?? '—'}
                </p>
                <p><strong>{t('professor.calendar.status')}:</strong> {statusLabel(ultimaRecord.status)}</p>
                <p><strong>{t('professor.calendar.presence')}:</strong> {getPresenceLabel(ultimaRecord.presence)}</p>
                <p><strong>{t('professor.calendar.type')}:</strong> {getLessonTypeLabel(ultimaRecord.lessonType)}</p>
                {ultimaRecord.curso && <p><strong>{t('professor.calendar.course')}:</strong> {getCursoLabel(ultimaRecord.curso)}</p>}
                {ultimaRecord.tempoAulaMinutos != null && <p><strong>{t('professor.calendar.timeMin')}:</strong> {ultimaRecord.tempoAulaMinutos}</p>}
                {ultimaRecord.book && <p><strong>{t('professor.calendar.book')}:</strong> {ultimaRecord.book}</p>}
                {ultimaRecord.lastPage && <p><strong>{t('professor.calendar.lastPage')}:</strong> {ultimaRecord.lastPage}</p>}
                {ultimaRecord.assignedHomework && <p><strong>{t('professor.calendar.task')}:</strong> {ultimaRecord.assignedHomework}</p>}
                {ultimaRecord.notes && <p><strong>{t('professor.calendar.obs')}:</strong> {ultimaRecord.notes}</p>}
                {ultimaRecord.studentPresences?.length ? (
                  <p><strong>{t('professor.calendar.presenceByStudent')}:</strong> {ultimaRecord.studentPresences.map((s) => `${s.enrollment?.nome ?? s.enrollmentId}: ${getPresenceLabel(s.presence)}`).join('; ')}</p>
                ) : null}
              </div>
            ) : (
              <p className="text-gray-500">{t('professor.calendar.noPreviousRecord')}</p>
            )}
          </div>
        )}

        {modalStep === 'registrar' && selectedLesson && (
          <form onSubmit={handleSubmit} className="space-y-4 max-h-[60vh] overflow-y-auto pr-2">
            <p className="text-sm text-gray-600">
              {t('professor.calendar.modalClass')}: <strong>{formatDateTime(selectedLesson.startAt, dateLocale)}</strong> — {getLessonStudentLabel(selectedLesson)}
            </p>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">{t('professor.calendar.classStatus')}</label>
              <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as typeof form.status })} className="input w-full">
                <option value="CONFIRMED">{t('professor.calendar.statusConfirmed')}</option>
                <option value="CANCELLED">{t('professor.calendar.statusCancelled')}</option>
                <option value="REPOSICAO">{t('professor.calendar.statusReposicao')}</option>
              </select>
            </div>

            {!isGroupLesson && (
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">{t('professor.calendar.studentPresence')}</label>
                <select value={form.presence} onChange={(e) => setForm({ ...form, presence: e.target.value as typeof form.presence })} className="input w-full">
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
                    <p className="text-xs text-amber-700 mb-2">{t('professor.calendar.presencePerStudent')}:</p>
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
              <label className="block text-sm font-semibold text-gray-700 mb-1">{t('professor.calendar.lessonType')}</label>
              <select value={form.lessonType} onChange={(e) => setForm({ ...form, lessonType: e.target.value as typeof form.lessonType })} className="input w-full">
                <option value="NORMAL">{t('professor.calendar.lessonTypeNormal')}</option>
                <option value="CONVERSAÇÃO">{t('professor.calendar.lessonTypeConversation')}</option>
                <option value="REVISAO">{t('professor.calendar.lessonTypeRevisao')}</option>
                <option value="AVALIACAO">{t('professor.calendar.lessonTypeAvaliacao')}</option>
              </select>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Curso</label>
                <select value={form.curso} onChange={(e) => setForm({ ...form, curso: e.target.value })} className="input w-full">
                  <option value="">Selecione</option>
                  <option value="INGLES">Inglês</option>
                  <option value="ESPANHOL">Espanhol</option>
                  <option value="INGLES_E_ESPANHOL">Inglês e Espanhol</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Tempo de aula (min)</label>
                <input
                  type="number"
                  min={1}
                  max={240}
                  value={selectedLesson?.durationMinutes ?? ''}
                  readOnly
                  disabled
                  className="input w-full bg-gray-100 cursor-not-allowed"
                  title="O tempo de aula é definido no cadastro da aula. Alterações apenas no painel admin."
                />
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
              <label className="block text-sm font-semibold text-gray-700 mb-1">Livro do aluno</label>
              <input type="text" value={form.book} onChange={(e) => setForm({ ...form, book: e.target.value })} className="input w-full" placeholder="Ex.: Book 1" />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">Última página trabalhada</label>
              <input type="text" value={form.lastPage} onChange={(e) => setForm({ ...form, lastPage: e.target.value })} className="input w-full" placeholder="Ex.: 42" />
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
          </form>
        )}

      </Modal>

      {toast && (
        <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />
      )}
    </div>
  )
}
