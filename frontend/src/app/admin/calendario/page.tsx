/**
 * Página Admin: Calendário
 *
 * Aulas com aluno, professor e status (confirmada, cancelada, reposição).
 * Cubos: total confirmadas, canceladas, reposições, alunos com frequência incorreta (segunda a sábado).
 */

'use client'

import { useState, useMemo, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import AdminLayout from '@/components/admin/AdminLayout'
import Modal from '@/components/admin/Modal'
import Button from '@/components/ui/Button'
import Toast from '@/components/admin/Toast'
import { ChevronLeft, ChevronRight, CheckCircle, XCircle, RotateCcw, AlertTriangle, Trash2, Loader2, CalendarOff, Users } from 'lucide-react'

type ViewType = 'month' | 'week' | 'day'

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
    frequenciaSemanal: number | null
    curso?: string | null
    status?: string
    pausedAt?: string | null
    activationDate?: string | null
  }
  teacher: { id: string; nome: string }
}

interface Stats {
  confirmed: number
  cancelled: number
  reposicao: number
  wrongFrequencyCount: number
  confirmedList: { id: string; studentName: string; teacherName: string; startAt: string }[]
  cancelledList: { id: string; studentName: string; teacherName: string; startAt: string }[]
  reposicaoList: { id: string; studentName: string; teacherName: string; startAt: string }[]
  wrongFrequencyList: {
    enrollmentId: string
    studentName: string
    expected: number
    actual: number
    expectedMinutes?: number
    actualMinutes?: number
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
  const d = new Date(iso)
  return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`
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
  return l.enrollment.nome
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
  const router = useRouter()
  const [view, setView] = useState<ViewType>('month')
  const [currentDate, setCurrentDate] = useState(() => new Date())
  const [lessons, setLessons] = useState<Lesson[]>([])
  const [stats, setStats] = useState<Stats | null>(null)
  const [enrollments, setEnrollments] = useState<{
    id: string
    nome: string
    frequenciaSemanal: number | null
    tipoAula: string | null
    nomeGrupo: string | null
    curso: string | null
  }[]>([])
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
    status: 'CONFIRMED' as 'CONFIRMED' | 'CANCELLED' | 'REPOSICAO',
    startAt: '',
    durationMinutes: 60,
    notes: '',
    repeatEnabled: false,
    repeatWeeks: 4,
  })
  const [deleteLessonModalOpen, setDeleteLessonModalOpen] = useState(false)
  const [savingLesson, setSavingLesson] = useState(false)
  const [deletingLesson, setDeletingLesson] = useState(false)
  const [enrollmentIdsWithFullWeek, setEnrollmentIdsWithFullWeek] = useState<string[]>([])
  const [listModal, setListModal] = useState<{
    title: string
    type: 'confirmed' | 'cancelled' | 'reposicao' | 'wrongFrequency' | 'teacherErrors'
  } | null>(null)
  const [holidays, setHolidays] = useState<Set<string>>(new Set())
  const [holidayLoading, setHolidayLoading] = useState<string | null>(null)
  const [selectedTeacherId, setSelectedTeacherId] = useState<string | null>(null)
  const [teacherFilterOpen, setTeacherFilterOpen] = useState(false)
  const [teacherAvailabilities, setTeacherAvailabilities] = useState<Record<string, boolean> | null>(null)
  const [teacherConflicts, setTeacherConflicts] = useState<Record<string, string>>({})
  const [idiomaErrorModalOpen, setIdiomaErrorModalOpen] = useState(false)
  const [lessonProfessorDropdownOpen, setLessonProfessorDropdownOpen] = useState(false)
  const [lessonAlunoDropdownOpen, setLessonAlunoDropdownOpen] = useState(false)
  const [lessonAlunoSearch, setLessonAlunoSearch] = useState('')
  const [lessonProfessorSearch, setLessonProfessorSearch] = useState('')
  const [lessonStatusDropdownOpen, setLessonStatusDropdownOpen] = useState(false)
  const [lessonStatusSearch, setLessonStatusSearch] = useState('')

  const weekStartForStats = useMemo(() => getMonday(currentDate), [currentDate])

  const activeTeachers = useMemo(
    () => teachers.filter((t) => t.status === 'ACTIVE'),
    [teachers]
  )
  const selectedTeacher = selectedTeacherId
    ? activeTeachers.find((t) => t.id === selectedTeacherId)
    : null

  // Opções para o select de aluno: grupos ou aluno individual; exclui quem já tem frequência correta na semana
  const studentOptions = useMemo(() => {
    const fullSet = new Set(enrollmentIdsWithFullWeek)
    const list: { value: string; label: string }[] = []
    const groupKeys = new Set<string>()
    for (const e of enrollments) {
      if (fullSet.has(e.id)) continue
      if (e.tipoAula === 'GRUPO' && e.nomeGrupo?.trim()) {
        const key = e.nomeGrupo.trim()
        if (groupKeys.has(key)) continue
        groupKeys.add(key)
        const members = enrollments
          .filter((x) => x.tipoAula === 'GRUPO' && x.nomeGrupo?.trim() === key)
          .map((x) => x.nome)
        const freq = enrollments.find((x) => x.tipoAula === 'GRUPO' && x.nomeGrupo?.trim() === key)?.frequenciaSemanal
        const freqLabel = freq != null ? ` (${freq}x/sem)` : ''
        list.push({
          value: enrollments.find((x) => x.tipoAula === 'GRUPO' && x.nomeGrupo?.trim() === key)!.id,
          label: `${key} — ${members.join(', ')}${freqLabel}`,
        })
      } else {
        const freqLabel = e.frequenciaSemanal != null ? ` (${e.frequenciaSemanal}x/sem)` : ''
        list.push({ value: e.id, label: `${e.nome}${freqLabel}` })
      }
    }
    return list
  }, [enrollments, enrollmentIdsWithFullWeek])

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
      if (json.ok) setLessons(json.data.lessons || [])
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

  const fetchEnrollmentsAndTeachers = useCallback(async () => {
    try {
      const [enrRes, teaRes] = await Promise.all([
        fetch('/api/admin/enrollments', { credentials: 'include' }),
        fetch('/api/admin/teachers', { credentials: 'include' }),
      ])
      if (enrRes.ok) {
        const j = await enrRes.json()
        setEnrollments((j.data?.enrollments || []).map((e: {
          id: string
          nome: string
          frequenciaSemanal?: number | null
          tipoAula?: string | null
          nomeGrupo?: string | null
          curso?: string | null
        }) => ({
          id: e.id,
          nome: e.nome,
          frequenciaSemanal: e.frequenciaSemanal ?? null,
          tipoAula: e.tipoAula ?? null,
          nomeGrupo: e.nomeGrupo ?? null,
          curso: e.curso ?? null,
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
      return
    }
    const refDate = lessonForm.startAt ? new Date(lessonForm.startAt) : new Date()
    if (Number.isNaN(refDate.getTime())) return
    const weekStart = getMonday(refDate)
    fetch(`/api/admin/lessons/enrollments-with-full-week?weekStart=${weekStart.toISOString()}`, {
      credentials: 'include',
    })
      .then((r) => r.json())
      .then((j) => {
        if (j.ok && Array.isArray(j.data?.enrollmentIds)) {
          setEnrollmentIdsWithFullWeek(j.data.enrollmentIds)
        } else {
          setEnrollmentIdsWithFullWeek([])
        }
      })
      .catch(() => setEnrollmentIdsWithFullWeek([]))
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
      }
    } catch (e) {
      console.error(e)
    }
  }, [getHolidaysRange])

  const toggleHoliday = useCallback(async (date: Date) => {
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
        setToast({ message: 'Feriado removido', type: 'success' })
      } else {
        const res = await fetch('/api/admin/holidays', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ date: key }),
        })
        const json = await res.json()
        if (!res.ok || !json.ok) {
          setToast({ message: json.message || 'Erro ao definir feriado', type: 'error' })
          return
        }
        setToast({ message: 'Feriado definido', type: 'success' })
      }
      await fetchHolidays()
    } catch (e) {
      setToast({ message: 'Erro ao alterar feriado', type: 'error' })
    } finally {
      setHolidayLoading(null)
    }
  }, [holidays, fetchHolidays])

  useEffect(() => {
    setLoading(true)
    Promise.all([fetchLessons(), fetchStats(), fetchEnrollmentsAndTeachers(), fetchHolidays()]).finally(() =>
      setLoading(false)
    )
  }, [fetchLessons, fetchStats, fetchEnrollmentsAndTeachers, fetchHolidays])

  useEffect(() => {
    if (!lessonModalOpen || !lessonForm.startAt?.trim()) {
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
    const url = `/api/admin/teachers/check-availability?datetime=${encodeURIComponent(iso)}&durationMinutes=${duration}${excludeId ? `&excludeLessonId=${encodeURIComponent(excludeId)}` : ''}`
    let cancelled = false
    fetch(url, { credentials: 'include' })
      .then((r) => r.json())
      .then((j) => {
        if (!cancelled && j.ok) {
          if (j.data?.availabilities) setTeacherAvailabilities(j.data.availabilities)
          else setTeacherAvailabilities(null)
          if (j.data?.conflicts) setTeacherConflicts(j.data.conflicts)
          else setTeacherConflicts({})
        } else if (!cancelled) {
          setTeacherAvailabilities(null)
          setTeacherConflicts({})
        }
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
  }, [lessonModalOpen, lessonForm.startAt, lessonForm.durationMinutes, editingLesson?.id])

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
    setLessonForm({
      enrollmentId: '',
      teacherId: '',
      status: 'CONFIRMED',
      startAt: toDatetimeLocal(start),
      durationMinutes: 60,
      notes: '',
      repeatEnabled: false,
      repeatWeeks: 4,
    })
    setLessonModalOpen(true)
  }

  const openEditLesson = (lesson: Lesson) => {
    setEditingLesson(lesson)
    const start = new Date(lesson.startAt)
    setLessonForm({
      enrollmentId: lesson.enrollmentId,
      teacherId: lesson.teacherId,
      status: lesson.status,
      startAt: toDatetimeLocal(start),
      durationMinutes: lesson.durationMinutes,
      notes: lesson.notes || '',
      repeatEnabled: false,
      repeatWeeks: 4,
    })
    setLessonModalOpen(true)
  }

  const handleSaveLesson = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!lessonForm.enrollmentId || !lessonForm.teacherId) {
      setToast({ message: 'Selecione aluno e professor', type: 'error' })
      return
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
    if (curso === 'INGLES_E_ESPANHOL' && (!ensina.includes('INGLES') || !ensina.includes('ESPANHOL'))) {
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
          }),
        })
        const json = await res.json()
        if (!res.ok || !json.ok) {
          setToast({ message: json.message || 'Erro ao atualizar', type: 'error' })
          return
        }
        setToast({ message: 'Aula atualizada', type: 'success' })
      } else {
        const repeatWeeks = lessonForm.repeatEnabled ? Math.min(52, Math.max(1, lessonForm.repeatWeeks)) : 1
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
            repeatWeeks,
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
      fetchLessons()
      fetchStats()
    } catch (err) {
      setToast({ message: 'Erro ao salvar', type: 'error' })
    } finally {
      setSavingLesson(false)
    }
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

  // Slots de 30 em 30 min, das 6h às 23h
  const timeSlots = useMemo(() => {
    const slots: { hour: number; minute: number }[] = []
    for (let h = 6; h <= 23; h++) {
      slots.push({ hour: h, minute: 0 })
      if (h < 23) slots.push({ hour: h, minute: 30 })
    }
    return slots
  }, [])

  const formatSlotLabel = (slot: { hour: number; minute: number }) =>
    `${slot.hour.toString().padStart(2, '0')}:${slot.minute.toString().padStart(2, '0')}`

  const getLessonsForDay = (day: Date) =>
    lessons.filter((l) => isSameDay(new Date(l.startAt), day))

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

  const statusLabel = (s: string) =>
    s === 'CONFIRMED' ? 'Confirmada' : s === 'CANCELLED' ? 'Cancelada' : 'Reposição'

  const isPaused = (lesson: Lesson): boolean => {
    if (lesson.enrollment.status !== 'PAUSED' || !lesson.enrollment.pausedAt) return false
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
    // Se o aluno está pausado, usar cor diferente (azul/roxo claro)
    if (lesson && isPaused(lesson)) {
      return 'bg-blue-100 text-blue-800 border-blue-200'
    }
    return s === 'CONFIRMED'
      ? 'bg-green-100 text-green-800 border-green-200'
      : s === 'CANCELLED'
        ? 'bg-red-100 text-red-800 border-red-200'
        : 'bg-amber-100 text-amber-800 border-amber-200'
  }

  return (
    <AdminLayout>
      <div>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-4">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 mb-2">Calendário</h1>
            <p className="text-sm text-gray-600">Aulas por mês, semana ou dia (segunda a sábado = frequência)</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <button
                type="button"
                onClick={() => setTeacherFilterOpen((v) => !v)}
                className="flex items-center gap-2 px-4 py-2 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 text-sm font-medium text-gray-700"
                title="Filtrar calendário por professor"
              >
                <Users className="w-4 h-4 text-gray-500" />
                {selectedTeacher ? selectedTeacher.nome : 'Todos os professores'}
              </button>
              {teacherFilterOpen && (
                <>
                  <div
                    className="fixed inset-0 z-10"
                    aria-hidden
                    onClick={() => setTeacherFilterOpen(false)}
                  />
                  <div className="absolute left-0 top-full mt-1 z-20 min-w-[220px] py-1 bg-white rounded-lg border border-gray-200 shadow-lg max-h-[280px] overflow-y-auto">
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedTeacherId(null)
                        setTeacherFilterOpen(false)
                      }}
                      className={`w-full text-left px-4 py-2 text-sm ${!selectedTeacherId ? 'bg-brand-orange/10 text-brand-orange font-medium' : 'text-gray-700 hover:bg-gray-100'}`}
                    >
                      Todos os professores
                    </button>
                    {activeTeachers.map((t) => (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => {
                          setSelectedTeacherId(t.id)
                          setTeacherFilterOpen(false)
                        }}
                        className={`w-full text-left px-4 py-2 text-sm ${selectedTeacherId === t.id ? 'bg-brand-orange/10 text-brand-orange font-medium' : 'text-gray-700 hover:bg-gray-100'}`}
                      >
                        {t.nome}
                      </button>
                    ))}
                    {activeTeachers.length === 0 && (
                      <p className="px-4 py-2 text-sm text-gray-500">Nenhum professor ativo</p>
                    )}
                  </div>
                </>
              )}
            </div>
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
            <div className="flex items-center gap-1">
              <Button variant="outline" size="sm" onClick={goPrev} className="p-2" title="Anterior">
                <ChevronLeft className="w-5 h-5" />
              </Button>
              <Button variant="outline" size="sm" onClick={goToday} className="min-w-[100px]">
                Hoje
              </Button>
              <Button variant="outline" size="sm" onClick={goNext} className="p-2" title="Próximo">
                <ChevronRight className="w-5 h-5" />
              </Button>
            </div>
            <h2 className="text-lg font-semibold text-gray-800 min-w-[200px] text-center sm:text-left">
              {titleLabel}
            </h2>
          </div>
        </div>

        {/* Cubos: semana segunda a sábado */}
        <div className="mb-6 grid grid-cols-2 md:grid-cols-5 gap-4">
          <button
            type="button"
            onClick={() => setListModal({ title: 'Aulas confirmadas', type: 'confirmed' })}
            className="flex items-center gap-3 p-4 bg-white rounded-xl border border-gray-200 shadow-sm hover:shadow-md transition-shadow text-left"
          >
            <div className="p-2 rounded-lg bg-green-100">
              <CheckCircle className="w-6 h-6 text-green-600" />
            </div>
            <div>
              <p className="text-sm font-medium text-gray-500">Confirmadas</p>
              <p className="text-2xl font-bold text-gray-900">{stats?.confirmed ?? 0}</p>
            </div>
          </button>
          <button
            type="button"
            onClick={() => setListModal({ title: 'Aulas canceladas', type: 'cancelled' })}
            className="flex items-center gap-3 p-4 bg-white rounded-xl border border-gray-200 shadow-sm hover:shadow-md transition-shadow text-left"
          >
            <div className="p-2 rounded-lg bg-red-100">
              <XCircle className="w-6 h-6 text-red-600" />
            </div>
            <div>
              <p className="text-sm font-medium text-gray-500">Canceladas</p>
              <p className="text-2xl font-bold text-gray-900">{stats?.cancelled ?? 0}</p>
            </div>
          </button>
          <button
            type="button"
            onClick={() => setListModal({ title: 'Reposições', type: 'reposicao' })}
            className="flex items-center gap-3 p-4 bg-white rounded-xl border border-gray-200 shadow-sm hover:shadow-md transition-shadow text-left"
          >
            <div className="p-2 rounded-lg bg-amber-100">
              <RotateCcw className="w-6 h-6 text-amber-600" />
            </div>
            <div>
              <p className="text-sm font-medium text-gray-500">Reposições</p>
              <p className="text-2xl font-bold text-gray-900">{stats?.reposicao ?? 0}</p>
            </div>
          </button>
          <button
            type="button"
            onClick={() => setListModal({ title: 'Alunos ativos com total de aulas incorreto na semana', type: 'wrongFrequency' })}
            className="flex items-center gap-3 p-4 bg-white rounded-xl border border-gray-200 shadow-sm hover:shadow-md transition-shadow text-left"
          >
            <div className="p-2 rounded-lg bg-orange-100">
              <AlertTriangle className="w-6 h-6 text-orange-600" />
            </div>
            <div>
              <p className="text-sm font-medium text-gray-500">Freq. incorreta (ativos)</p>
              <p className="text-2xl font-bold text-gray-900">{stats?.wrongFrequencyCount ?? 0}</p>
              <p className="text-xs text-gray-400 mt-0.5">Total de aulas na semana (seg–sáb) vs. frequência cadastrada</p>
            </div>
          </button>
          <button
            type="button"
            onClick={() => setListModal({ title: 'Erros professores', type: 'teacherErrors' })}
            className="flex items-center gap-3 p-4 bg-white rounded-xl border border-gray-200 shadow-sm hover:shadow-md transition-shadow text-left"
          >
            <div className="p-2 rounded-lg bg-red-100">
              <AlertTriangle className="w-6 h-6 text-red-600" />
            </div>
            <div>
              <p className="text-sm font-medium text-gray-500">Erros professores</p>
              <p className="text-2xl font-bold text-gray-900">{stats?.teacherErrorsCount ?? 0}</p>
              <p className="text-xs text-gray-400 mt-0.5">Sobreposição ou professor inativo com aula</p>
            </div>
          </button>
        </div>

        {selectedTeacher && (
          <p className="mb-2 text-sm text-gray-600">
            Exibindo apenas aulas de <strong>{selectedTeacher.nome}</strong>. Altere em &quot;Ver por professor&quot; para ver todos.
          </p>
        )}

        {loading && (
          <div className="mb-4 text-sm text-gray-500">Carregando...</div>
        )}

        {/* Visualização mensal */}
        {view === 'month' && (
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="grid grid-cols-7 border-b border-gray-200 bg-gray-50">
              {DIAS_SEMANA.map((dia, idx) => (
                <div
                  key={dia}
                  className={`py-2 text-center text-xs font-semibold uppercase ${idx === 0 ? 'text-red-700 bg-red-50' : 'text-gray-600'}`}
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
                  const isSunday = day.getDay() === 0
                  const showDayActions = !otherMonth && !isSunday
                  return (
                    <div
                      key={`${wi}-${di}`}
                      className={`min-h-[100px] sm:min-h-[120px] border-b border-r border-gray-100 p-2 ${
                        otherMonth ? 'bg-gray-50/50' : isHoliday ? 'bg-amber-50' : di === 0 ? 'bg-red-50' : 'bg-white'
                      } ${di === 6 ? 'border-r-0' : ''}`}
                    >
                      <div className="flex items-center justify-between">
                        <span
                          className={`inline-flex items-center justify-center w-7 h-7 rounded-full text-sm ${
                            today ? 'bg-brand-orange text-white font-semibold' : otherMonth ? 'text-gray-400' : di === 0 ? 'text-red-700' : 'text-gray-800'
                          }`}
                        >
                          {day.getDate()}
                        </span>
                        {showDayActions && !isHoliday && (
                          <button
                            type="button"
                            onClick={() => openNewLesson(day)}
                            className="text-xs text-brand-orange hover:underline"
                          >
                            + Aula
                          </button>
                        )}
                      </div>
                      {showDayActions && (
                        <div className="mt-0.5">
                          <button
                            type="button"
                            onClick={() => toggleHoliday(day)}
                            disabled={holidayLoading === toDateKey(day)}
                            className={`text-[10px] flex items-center gap-0.5 ${isHoliday ? 'text-amber-700 hover:underline' : 'text-gray-500 hover:text-amber-600 hover:underline'}`}
                            title={isHoliday ? 'Cancelar feriado' : 'Definir feriado'}
                          >
                            {holidayLoading === toDateKey(day) ? (
                              <Loader2 className="w-3 h-3 animate-spin" />
                            ) : (
                              <CalendarOff className="w-3 h-3" />
                            )}
                            {isHoliday ? 'Cancelar feriado' : 'Definir feriado'}
                          </button>
                        </div>
                      )}
                      <div className="mt-1 space-y-0.5">
                        {dayLessons.slice(0, 3).map((l) => (
                          <button
                            key={l.id}
                            type="button"
                            onClick={() => openEditLesson(l)}
                            className={`block w-full text-left text-xs px-1.5 py-0.5 rounded border break-words line-clamp-2 ${statusColor(l.status, l)}`}
                            title={`${getLessonStudentLabel(l, enrollments)} – ${l.teacher.nome} – ${statusLabel(l.status)}${isPaused(l) ? ' (Aluno Pausado)' : ''}`}
                          >
                            {getLessonStudentLabel(l, enrollments)} – {l.teacher.nome} {formatTime(l.startAt)}
                            {isPaused(l) && <span className="ml-1 text-[10px]">⏸️</span>}
                          </button>
                        ))}
                        {dayLessons.length > 3 && (
                          <span className="text-xs text-gray-400">+{dayLessons.length - 3}</span>
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
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="grid grid-cols-8 border-b border-gray-200 bg-gray-50">
              <div className="py-2 text-xs font-semibold text-gray-500 border-r border-gray-200 pl-2">Horário</div>
              {Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)).map((d) => {
                const isSunday = d.getDay() === 0
                const isHoliday = holidays.has(toDateKey(d))
                return (
                  <div
                    key={d.toISOString()}
                    className={`py-2 text-center text-xs font-semibold ${isSunday ? 'text-red-700 bg-red-50' : isHoliday ? 'text-amber-700 bg-amber-50' : isToday(d) ? 'text-brand-orange bg-orange-50' : 'text-gray-600'}`}
                  >
                    <div>{DIAS_SEMANA[d.getDay()]}</div>
                    <div className="font-normal">{d.getDate()}</div>
                    {!isSunday && (
                      <button
                        type="button"
                        onClick={() => toggleHoliday(d)}
                        disabled={holidayLoading === toDateKey(d)}
                        className="mt-1 text-[10px] text-gray-500 hover:text-amber-600 hover:underline flex items-center justify-center gap-0.5 w-full"
                        title={isHoliday ? 'Cancelar feriado' : 'Definir feriado'}
                      >
                        {holidayLoading === toDateKey(d) ? <Loader2 className="w-3 h-3 animate-spin" /> : <CalendarOff className="w-3 h-3" />}
                        {isHoliday ? 'Cancelar feriado' : 'Feriado'}
                      </button>
                    )}
                  </div>
                )
              })}
            </div>
            <div className="max-h-[70vh] overflow-y-auto">
              {timeSlots.map((slot) => (
                <div key={`${slot.hour}-${slot.minute}`} className="grid grid-cols-8 border-b border-gray-100 min-h-[40px]">
                  <div className="py-1 pl-2 text-xs text-gray-500 border-r border-gray-100">
                    {formatSlotLabel(slot)}
                  </div>
                  {Array.from({ length: 7 }, (_, i) => {
                    const d = addDays(weekStart, i)
                    const isSunday = d.getDay() === 0
                    const isHoliday = holidays.has(toDateKey(d))
                    const slotLessons = getLessonsForSlot(d, slot.hour, slot.minute)
                    return (
                      <div
                        key={i}
                        className={`border-r border-gray-50 last:border-r-0 p-1 flex flex-col gap-0.5 ${isSunday ? 'bg-red-50' : isHoliday ? 'bg-amber-50' : ''}`}
                      >
                        {!isSunday && !isHoliday && (
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
                        {slotLessons.map((l) => (
                          <button
                            key={l.id}
                            type="button"
                            onClick={() => openEditLesson(l)}
                            className={`text-[10px] text-left px-1 py-0.5 rounded border break-words line-clamp-2 ${statusColor(l.status, l)}`}
                            title={`${getLessonStudentLabel(l, enrollments)} – ${l.teacher.nome} – ${statusLabel(l.status)}${isPaused(l) ? ' (Aluno Pausado)' : ''}`}
                          >
                            {getLessonStudentLabel(l, enrollments)} – {l.teacher.nome}
                            {isPaused(l) && <span className="ml-1 text-[9px]">⏸️</span>}
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

        {/* Visualização do dia */}
        {view === 'day' && (
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <div
              className={`border-b border-gray-200 px-4 py-2 text-sm font-semibold flex items-center justify-between flex-wrap gap-2 ${
                currentDate.getDay() === 0 ? 'bg-red-50 text-red-700' : holidays.has(toDateKey(currentDate)) ? 'bg-amber-50 text-amber-800' : 'bg-gray-50 text-gray-700'
              }`}
            >
              <span>{DIAS_SEMANA[currentDate.getDay()]} – {currentDate.getDate()} {MESES[currentDate.getMonth()]}</span>
              {currentDate.getDay() !== 0 && (
                <button
                  type="button"
                  onClick={() => toggleHoliday(currentDate)}
                  disabled={holidayLoading === toDateKey(currentDate)}
                  className="text-xs font-normal flex items-center gap-1 text-gray-600 hover:text-amber-700 hover:underline"
                  title={holidays.has(toDateKey(currentDate)) ? 'Cancelar feriado' : 'Definir feriado'}
                >
                  {holidayLoading === toDateKey(currentDate) ? <Loader2 className="w-3 h-3 animate-spin" /> : <CalendarOff className="w-3 h-3" />}
                  {holidays.has(toDateKey(currentDate)) ? 'Cancelar feriado' : 'Definir feriado'}
                </button>
              )}
            </div>
            <div className={`max-h-[70vh] overflow-y-auto ${currentDate.getDay() === 0 ? 'bg-red-50/30' : holidays.has(toDateKey(currentDate)) ? 'bg-amber-50/30' : ''}`}>
              {timeSlots.map((slot) => {
                const slotLessons = getLessonsForSlot(currentDate, slot.hour, slot.minute)
                const isSunday = currentDate.getDay() === 0
                const isHoliday = holidays.has(toDateKey(currentDate))
                return (
                  <div key={`${slot.hour}-${slot.minute}`} className="flex border-b border-gray-100 min-h-[48px]">
                    <div className="w-16 shrink-0 py-1.5 pl-2 text-xs text-gray-500 border-r border-gray-100">
                      {formatSlotLabel(slot)}
                    </div>
                    <div className="flex-1 p-2 flex flex-col gap-1">
                      {!isSunday && !isHoliday && (
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
                      {slotLessons.map((l) => (
                        <button
                          key={l.id}
                          type="button"
                          onClick={() => openEditLesson(l)}
                          className={`text-sm text-left px-2 py-1 rounded border w-fit max-w-full break-words line-clamp-2 ${statusColor(l.status, l)}`}
                          title={`${getLessonStudentLabel(l, enrollments)} – ${l.teacher.nome} – ${statusLabel(l.status)}${isPaused(l) ? ' (Aluno Pausado)' : ''}`}
                        >
                          {getLessonStudentLabel(l, enrollments)} – {l.teacher.nome} – {statusLabel(l.status)} ({formatTime(l.startAt)})
                          {isPaused(l) && <span className="ml-1">⏸️</span>}
                        </button>
                      ))}
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
          }}
          title={editingLesson ? 'Editar aula' : 'Nova aula'}
          size="md"
          footer={
            <>
              {editingLesson && (
                <Button
                  variant="outline"
                  onClick={openDeleteLessonModal}
                  className="mr-auto text-red-600 border-red-200 hover:bg-red-50"
                  disabled={savingLesson}
                >
                  <Trash2 className="w-4 h-4 mr-1" />
                  Excluir aula
                </Button>
              )}
              <Button
                variant="outline"
                onClick={() => {
                  setLessonModalOpen(false)
                  setLessonProfessorDropdownOpen(false)
                  setLessonAlunoDropdownOpen(false)
                  setLessonStatusDropdownOpen(false)
                }}
                disabled={savingLesson}
              >
                Cancelar
              </Button>
              <Button variant="primary" onClick={handleSaveLesson} disabled={savingLesson}>
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
                              setLessonForm({ ...lessonForm, enrollmentId: opt.value })
                              setLessonAlunoSearch('')
                              setLessonAlunoDropdownOpen(false)
                            }}
                            className="w-full text-left px-3 py-2 text-sm hover:bg-gray-100"
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
              const STATUS_OPCOES = [
                { value: 'CONFIRMED' as const, label: 'Confirmada' },
                { value: 'CANCELLED' as const, label: 'Cancelada' },
                { value: 'REPOSICAO' as const, label: 'Reposição' },
              ]
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
                          : STATUS_OPCOES.find((o) => o.value === lessonForm.status)?.label ?? ''
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
                                setLessonForm({ ...lessonForm, status: opt.value })
                                setLessonStatusSearch('')
                                setLessonStatusDropdownOpen(false)
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
                onChange={(e) => setLessonForm({ ...lessonForm, durationMinutes: Number(e.target.value) || 60 })}
                className="input w-full"
              />
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
            {!editingLesson && (
              <div className="space-y-2 pt-2 border-t border-gray-200">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={lessonForm.repeatEnabled}
                    onChange={(e) => setLessonForm({ ...lessonForm, repeatEnabled: e.target.checked })}
                    className="rounded border-gray-300"
                  />
                  <span className="text-sm font-medium text-gray-700">Repetir nas próximas semanas (mesmo dia e hora)</span>
                </label>
                {lessonForm.repeatEnabled && (
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-1">Quantas semanas?</label>
                    <select
                      value={lessonForm.repeatWeeks}
                      onChange={(e) => setLessonForm({ ...lessonForm, repeatWeeks: Number(e.target.value) })}
                      className="input w-full max-w-[120px]"
                    >
                      <option value={4}>4 semanas</option>
                      <option value={8}>8 semanas</option>
                      <option value={12}>12 semanas</option>
                      <option value={52}>52 semanas (1 ano)</option>
                    </select>
                  </div>
                )}
              </div>
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
                  'Apenas esta aula'
                )}
              </Button>
              <Button variant="primary" className="bg-red-600 hover:bg-red-700" onClick={() => handleDeleteLesson(true)} disabled={deletingLesson}>
                {deletingLesson ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Excluindo...
                  </>
                ) : (
                  'Esta e todas as aulas futuras (mesmo dia e hora)'
                )}
              </Button>
            </>
          }
        >
          <p className="text-sm text-gray-700">
            Deseja excluir apenas esta aula ou esta aula e todas as futuras no mesmo dia e horário? Aulas que já passaram não serão excluídas.
          </p>
        </Modal>

        {/* Modal lista (ao clicar no cubo) */}
        <Modal
          isOpen={!!listModal}
          onClose={() => setListModal(null)}
          title={listModal?.title ?? ''}
          size="md"
          footer={<Button variant="primary" onClick={() => setListModal(null)}>Fechar</Button>}
        >
          {listModal && stats && (
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
                    <span className="font-medium">{item.studentName}</span> – {item.teacherName} –{' '}
                    {formatTime(item.startAt)}
                  </div>
                ))}
              {listModal.type === 'cancelled' && stats.cancelledList.length === 0 && (
                <p className="text-gray-500 text-sm">Nenhuma aula cancelada nesta semana.</p>
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
                  <div key={item.enrollmentId} className="p-3 rounded-lg border border-orange-200 bg-orange-50 text-sm">
                    <span className="font-medium">{item.studentName}</span>
                    {item.expectedMinutes != null && item.actualMinutes != null ? (
                      <> – cadastro: {item.expectedMinutes} min/sem (ex.: {item.expected}x{item.expectedMinutes / item.expected}min). Nesta semana (seg–sáb): {item.actualMinutes} min.</>
                    ) : (
                      <> – cadastro: {item.expected} aula(s) por semana. Nesta semana (seg–sáb): {item.actual} aula(s).</>
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
          )}
        </Modal>

        {toast && (
          <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />
        )}
      </div>
    </AdminLayout>
  )
}
