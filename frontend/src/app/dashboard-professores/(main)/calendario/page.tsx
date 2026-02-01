/**
 * Dashboard Professores – Calendário (clique na aula: ver última / registrar aula)
 */

'use client'

import { useState, useMemo, useEffect, useCallback } from 'react'
import { ChevronLeft, ChevronRight, CheckCircle, XCircle, RotateCcw, FileText, ClipboardList, Loader2, ArrowLeft } from 'lucide-react'
import Modal from '@/components/admin/Modal'
import Button from '@/components/ui/Button'
import Toast from '@/components/admin/Toast'

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

const STATUS_LABELS: Record<string, string> = { CONFIRMED: 'Confirmada', CANCELLED: 'Cancelada', REPOSICAO: 'Reposição' }
const PRESENCE_LABELS: Record<string, string> = { PRESENTE: 'Presente', NAO_COMPARECEU: 'Não compareceu', ATRASADO: 'Atrasado' }
const LESSON_TYPE_LABELS: Record<string, string> = { NORMAL: 'Normal', CONVERSAÇÃO: 'Só conversação', REVISAO: 'Revisão', AVALIACAO: 'Avaliação' }
const CURSO_LABELS: Record<string, string> = { INGLES: 'Inglês', ESPANHOL: 'Espanhol', INGLES_E_ESPANHOL: 'Inglês e Espanhol' }

const DIAS_SEMANA = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']
const MESES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
]

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

function formatDateTime(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
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

const statusLabel = (s: string) => (s === 'CONFIRMED' ? 'Confirmada' : s === 'CANCELLED' ? 'Cancelada' : 'Reposição')
const statusColor = (s: string) =>
  s === 'CONFIRMED' ? 'bg-green-100 text-green-800 border-green-200' : s === 'CANCELLED' ? 'bg-red-100 text-red-800 border-red-200' : 'bg-amber-100 text-amber-800 border-amber-200'

export default function CalendarioProfessorPage() {
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
    setModalStep('choose')
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
      else setError(json.message || 'Erro ao carregar aulas')
    } catch (e) {
      setError('Erro ao carregar aulas')
    } finally {
      setLoading(false)
    }
  }, [view, currentDate])

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

  useEffect(() => {
    if (modalStep !== 'registrar' || !selectedLesson) return
    setForm((prev) => ({
      ...prev,
      tempoAulaMinutos: selectedLesson.durationMinutes ?? prev.tempoAulaMinutos,
    }))
  }, [modalStep, selectedLesson?.id, selectedLesson?.durationMinutes])

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
        tempoAulaMinutos: form.tempoAulaMinutos !== '' ? Number(form.tempoAulaMinutos) : null,
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
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-2">Calendário</h1>
      <p className="text-gray-600 mb-4">Suas aulas. Apenas visualização.</p>

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-4">
        <div className="flex rounded-lg border border-gray-200 overflow-hidden bg-white">
          <button
            type="button"
            onClick={() => setView('month')}
            className={`px-4 py-2 text-sm font-medium ${view === 'month' ? 'bg-brand-orange text-white' : 'text-gray-600 hover:bg-gray-100'}`}
          >
            Mês
          </button>
          <button
            type="button"
            onClick={() => setView('week')}
            className={`px-4 py-2 text-sm font-medium ${view === 'week' ? 'bg-brand-orange text-white' : 'text-gray-600 hover:bg-gray-100'}`}
          >
            Semana
          </button>
          <button
            type="button"
            onClick={() => setView('day')}
            className={`px-4 py-2 text-sm font-medium ${view === 'day' ? 'bg-brand-orange text-white' : 'text-gray-600 hover:bg-gray-100'}`}
          >
            Dia
          </button>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={goPrev} className="p-2 rounded border border-gray-200 hover:bg-gray-50" title="Anterior">
            <ChevronLeft className="w-5 h-5" />
          </button>
          <button type="button" onClick={goToday} className="px-4 py-2 text-sm border border-gray-200 rounded hover:bg-gray-50">
            Hoje
          </button>
          <button type="button" onClick={goNext} className="p-2 rounded border border-gray-200 hover:bg-gray-50" title="Próximo">
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>
        <h2 className="text-lg font-semibold text-gray-800">{titleLabel}</h2>
      </div>

      {/* Resumo do período */}
      <div className="mb-4 grid grid-cols-3 gap-3 max-w-md">
        <div className="flex items-center gap-2 p-3 bg-white rounded-lg border border-gray-200">
          <CheckCircle className="w-5 h-5 text-green-600 shrink-0" />
          <span className="text-sm font-medium text-gray-700">{stats.confirmed} confirmadas</span>
        </div>
        <div className="flex items-center gap-2 p-3 bg-white rounded-lg border border-gray-200">
          <XCircle className="w-5 h-5 text-red-600 shrink-0" />
          <span className="text-sm font-medium text-gray-700">{stats.cancelled} canceladas</span>
        </div>
        <div className="flex items-center gap-2 p-3 bg-white rounded-lg border border-gray-200">
          <RotateCcw className="w-5 h-5 text-amber-600 shrink-0" />
          <span className="text-sm font-medium text-gray-700">{stats.reposicao} reposições</span>
        </div>
      </div>

      {error && <div className="mb-4 p-4 bg-red-50 text-red-800 rounded-lg text-sm">{error}</div>}
      {loading && <div className="mb-4 text-sm text-gray-500">Carregando...</div>}

      {view === 'month' && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="grid grid-cols-7 border-b border-gray-200 bg-gray-50">
            {DIAS_SEMANA.map((dia, idx) => (
              <div key={dia} className={`py-2 text-center text-xs font-semibold uppercase ${idx === 0 ? 'text-red-700 bg-red-50' : 'text-gray-600'}`}>
                {dia}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7">
            {monthGrid.map((week, wi) =>
              week.map((day, di) => {
                const otherMonth = !isSameMonth(day, currentDate)
                const dayLessons = getLessonsForDay(day)
                return (
                  <div
                    key={`${wi}-${di}`}
                    className={`min-h-[100px] sm:min-h-[120px] border-b border-r border-gray-100 p-2 ${
                      otherMonth ? 'bg-gray-50/50' : di === 0 ? 'bg-red-50' : 'bg-white'
                    } ${di === 6 ? 'border-r-0' : ''}`}
                  >
                    <span
                      className={`inline-flex items-center justify-center w-7 h-7 rounded-full text-sm ${
                        isToday(day) ? 'bg-brand-orange text-white font-semibold' : otherMonth ? 'text-gray-400' : di === 0 ? 'text-red-700' : 'text-gray-800'
                      }`}
                    >
                      {day.getDate()}
                    </span>
                    <div className="mt-1 space-y-0.5">
                      {dayLessons.slice(0, 3).map((l) => (
                        <button
                          key={l.id}
                          type="button"
                          onClick={() => openLesson(l)}
                          className={`w-full text-left text-xs px-1.5 py-0.5 rounded border break-words line-clamp-2 cursor-pointer hover:ring-2 hover:ring-brand-orange/50 ${statusColor(l.status)}`}
                          title={`${getLessonStudentLabel(l)} – ${statusLabel(l.status)} (clique para ver opções)`}
                        >
                          {getLessonStudentLabel(l)} {formatTime(l.startAt)}
                        </button>
                      ))}
                      {dayLessons.length > 3 && <span className="text-xs text-gray-400">+{dayLessons.length - 3}</span>}
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </div>
      )}

      {view === 'week' && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="grid grid-cols-8 border-b border-gray-200 bg-gray-50">
            <div className="py-2 text-xs font-semibold text-gray-500 border-r border-gray-200 pl-2">Horário</div>
            {Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)).map((d) => (
              <div key={d.toISOString()} className={`py-2 text-center text-xs font-semibold ${d.getDay() === 0 ? 'text-red-700 bg-red-50' : isToday(d) ? 'text-brand-orange bg-orange-50' : 'text-gray-600'}`}>
                <div>{DIAS_SEMANA[d.getDay()]}</div>
                <div className="font-normal">{d.getDate()}</div>
              </div>
            ))}
          </div>
          <div className="max-h-[70vh] overflow-y-auto">
            {timeSlots.map((slot) => (
              <div key={`${slot.hour}-${slot.minute}`} className="grid grid-cols-8 border-b border-gray-100 min-h-[40px]">
                <div className="py-1 pl-2 text-xs text-gray-500 border-r border-gray-100">{formatSlotLabel(slot)}</div>
                {Array.from({ length: 7 }, (_, i) => {
                  const d = addDays(weekStart, i)
                  const slotLessons = getLessonsForSlot(d, slot.hour, slot.minute)
                  return (
                    <div key={i} className={`border-r border-gray-50 last:border-r-0 p-1 flex flex-col gap-0.5 ${d.getDay() === 0 ? 'bg-red-50' : ''}`}>
                      {slotLessons.map((l) => (
                        <button
                          key={l.id}
                          type="button"
                          onClick={() => openLesson(l)}
                          className={`text-[10px] text-left px-1 py-0.5 rounded border break-words line-clamp-2 cursor-pointer hover:ring-2 hover:ring-brand-orange/50 ${statusColor(l.status)}`}
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
      )}

      {view === 'day' && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className={`border-b border-gray-200 px-4 py-2 text-sm font-semibold ${currentDate.getDay() === 0 ? 'bg-red-50 text-red-700' : 'bg-gray-50 text-gray-700'}`}>
            {DIAS_SEMANA[currentDate.getDay()]} – {currentDate.getDate()} {MESES[currentDate.getMonth()]}
          </div>
          <div className={`max-h-[70vh] overflow-y-auto ${currentDate.getDay() === 0 ? 'bg-red-50/30' : ''}`}>
            {timeSlots.map((slot) => {
              const slotLessons = getLessonsForSlot(currentDate, slot.hour, slot.minute)
              return (
                <div key={`${slot.hour}-${slot.minute}`} className="flex border-b border-gray-100 min-h-[48px]">
                  <div className="w-16 shrink-0 py-1.5 pl-2 text-xs text-gray-500 border-r border-gray-100">{formatSlotLabel(slot)}</div>
                  <div className="flex-1 p-2 flex flex-col gap-1">
                    {slotLessons.map((l) => (
                      <button
                        key={l.id}
                        type="button"
                        onClick={() => openLesson(l)}
                        className={`text-sm text-left px-2 py-1 rounded border w-fit max-w-full break-words cursor-pointer hover:ring-2 hover:ring-brand-orange/50 ${statusColor(l.status)}`}
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
            ? 'Aula'
            : modalStep === 'ver-ultima'
              ? 'Informações da última aula'
              : 'Registrar aula'
        }
        size={modalStep === 'registrar' ? 'xl' : 'md'}
        footer={
          modalStep === 'choose' ? (
            <div className="flex flex-col sm:flex-row gap-2 w-full">
              <Button variant="outline" onClick={handleVerUltima} className="flex-1" disabled={ultimaLoading}>
                {ultimaLoading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <FileText className="w-4 h-4 mr-2" />}
                Ver informações da última aula
              </Button>
              <Button variant="primary" onClick={handleRegistrar} className="flex-1">
                <ClipboardList className="w-4 h-4 mr-2" />
                Registrar aula
              </Button>
            </div>
          ) : modalStep === 'ver-ultima' ? (
            <Button variant="outline" onClick={() => setModalStep('choose')}>
              <ArrowLeft className="w-4 h-4 mr-2" />
              Voltar
            </Button>
          ) : (
            <>
              <Button variant="outline" onClick={() => setModalStep('choose')} disabled={saving}>
                Cancelar
              </Button>
              {ultimaRecord && (
                <Button variant="outline" onClick={handlePreencherUltima} disabled={saving}>
                  Preencher com dados da última aula
                </Button>
              )}
              <Button variant="primary" onClick={handleSubmit} disabled={saving}>
                {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                {saving ? 'Salvando...' : 'Criar registro'}
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
              {formatDateTime(selectedLesson.startAt)} — {selectedLesson.durationMinutes} min
            </p>
            <p className="text-sm">
              Status: <span className={statusColor(selectedLesson.status)}>{statusLabel(selectedLesson.status)}</span>
            </p>
          </div>
        )}

        {modalStep === 'ver-ultima' && (
          <div className="space-y-3">
            {ultimaLoading ? (
              <div className="flex items-center gap-2 text-gray-500">
                <Loader2 className="w-5 h-5 animate-spin" />
                Carregando última aula...
              </div>
            ) : ultimaRecord ? (
              <div className="space-y-3 text-sm">
                <p className="text-gray-600">
                  Aula de <strong>{formatDateTime(ultimaRecord.lesson.startAt)}</strong> — {ultimaRecord.lesson.enrollment?.nome ?? ultimaRecord.lesson.enrollment?.nomeGrupo ?? '—'}
                </p>
                <p><strong>Status:</strong> {STATUS_LABELS[ultimaRecord.status] ?? ultimaRecord.status}</p>
                <p><strong>Presença:</strong> {PRESENCE_LABELS[ultimaRecord.presence] ?? ultimaRecord.presence}</p>
                <p><strong>Tipo:</strong> {LESSON_TYPE_LABELS[ultimaRecord.lessonType] ?? ultimaRecord.lessonType}</p>
                {ultimaRecord.curso && <p><strong>Curso:</strong> {CURSO_LABELS[ultimaRecord.curso] ?? ultimaRecord.curso}</p>}
                {ultimaRecord.tempoAulaMinutos != null && <p><strong>Tempo (min):</strong> {ultimaRecord.tempoAulaMinutos}</p>}
                {ultimaRecord.book && <p><strong>Livro:</strong> {ultimaRecord.book}</p>}
                {ultimaRecord.lastPage && <p><strong>Última página:</strong> {ultimaRecord.lastPage}</p>}
                {ultimaRecord.assignedHomework && <p><strong>Tarefa:</strong> {ultimaRecord.assignedHomework}</p>}
                {ultimaRecord.notes && <p><strong>Obs:</strong> {ultimaRecord.notes}</p>}
                {ultimaRecord.studentPresences?.length ? (
                  <p><strong>Presença por aluno:</strong> {ultimaRecord.studentPresences.map((s) => `${s.enrollment?.nome ?? s.enrollmentId}: ${PRESENCE_LABELS[s.presence] ?? s.presence}`).join('; ')}</p>
                ) : null}
              </div>
            ) : (
              <p className="text-gray-500">Nenhum registro de aula anterior para este aluno/grupo.</p>
            )}
          </div>
        )}

        {modalStep === 'registrar' && selectedLesson && (
          <form onSubmit={handleSubmit} className="space-y-4 max-h-[60vh] overflow-y-auto pr-2">
            <p className="text-sm text-gray-600">
              Aula: <strong>{formatDateTime(selectedLesson.startAt)}</strong> — {getLessonStudentLabel(selectedLesson)}
            </p>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">Status da aula</label>
              <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as typeof form.status })} className="input w-full">
                <option value="CONFIRMED">Confirmada</option>
                <option value="CANCELLED">Cancelada</option>
                <option value="REPOSICAO">Reposição</option>
              </select>
            </div>

            {!isGroupLesson && (
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Presença do aluno</label>
                <select value={form.presence} onChange={(e) => setForm({ ...form, presence: e.target.value as typeof form.presence })} className="input w-full">
                  <option value="PRESENTE">Presente</option>
                  <option value="NAO_COMPARECEU">Não compareceu</option>
                  <option value="ATRASADO">Atrasado</option>
                </select>
              </div>
            )}

            {isGroupLesson && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 space-y-3">
                <p className="text-sm font-semibold text-amber-800">Aula em grupo: {selectedLesson.enrollment?.nomeGrupo?.trim()}</p>
                {loadingGroup && groupMembers.length === 0 ? (
                  <p className="text-sm text-amber-700">Carregando alunos do grupo...</p>
                ) : (
                  <div className="space-y-2">
                    <p className="text-xs text-amber-700 mb-2">Presença de cada aluno:</p>
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
                            <option value="PRESENTE">Presente</option>
                            <option value="NAO_COMPARECEU">Não compareceu</option>
                            <option value="ATRASADO">Atrasado</option>
                          </select>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )}

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">Tipo de aula</label>
              <select value={form.lessonType} onChange={(e) => setForm({ ...form, lessonType: e.target.value as typeof form.lessonType })} className="input w-full">
                <option value="NORMAL">Normal</option>
                <option value="CONVERSAÇÃO">Só conversação</option>
                <option value="REVISAO">Revisão</option>
                <option value="AVALIACAO">Avaliação</option>
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
                <input type="number" min={1} max={240} value={form.tempoAulaMinutos === '' ? '' : form.tempoAulaMinutos} onChange={(e) => setForm({ ...form, tempoAulaMinutos: e.target.value === '' ? '' : Number(e.target.value) })} className="input w-full" placeholder="Preenchido pela aula" />
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
