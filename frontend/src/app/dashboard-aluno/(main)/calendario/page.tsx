/**
 * Dashboard Aluno – Calendário (suas aulas, somente visualização)
 */

'use client'

import { useState, useMemo, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronLeft, ChevronRight, X, Bell } from 'lucide-react'
import Modal from '@/components/admin/Modal'
import Button from '@/components/ui/Button'
import Toast from '@/components/admin/Toast'
import {
  formatTimeInTZ,
  formatDateTimeInTZ,
  isSameDayInTZ,
  getDateInTZ,
  getTimeInTZ,
  ymdInTZ,
} from '@/lib/datetime'

const DIAS_SEMANA = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']
const MESES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
]

interface Lesson {
  id: string
  enrollmentId: string
  teacherId: string
  status: 'CONFIRMED' | 'CANCELLED' | 'REPOSICAO'
  startAt: string
  durationMinutes: number
  notes: string | null
  enrollment: { id: string; nome: string; tipoAula: string | null; nomeGrupo: string | null; escolaMatricula?: string | null; cancelamentoAntecedenciaHoras?: number | null }
  teacher: { id: string; nome: string }
  requests?: Array<{ id: string; type: string; status: string }>
}

interface TeacherSlot {
  startMinutes: number
  endMinutes: number
  startTime: string
  endTime: string
  date: string
}

interface AvailableDay {
  dayOfWeek: number
  dayName: string
}

interface AvailableDate {
  date: string // YYYY-MM-DD
}

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

function isSameMonth(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth()
}

function isToday(d: Date): boolean {
  return isSameDayInTZ(d, new Date())
}

function toDateKey(d: Date): string {
  return ymdInTZ(d, 'America/Sao_Paulo')
}

const statusLabel: Record<string, string> = {
  CONFIRMED: 'Confirmada',
  CANCELLED: 'Cancelada',
  REPOSICAO: 'Reposição',
}

const statusColor = (status: string, hasPendingRequest?: boolean): string => {
  if (hasPendingRequest) {
    return 'bg-purple-100 text-purple-800 border-purple-200'
  }
  const colors: Record<string, string> = {
    CONFIRMED: 'bg-green-100 text-green-800 border-green-200',
    CANCELLED: 'bg-red-100 text-red-800 border-red-200',
    REPOSICAO: 'bg-amber-100 text-amber-800 border-amber-200',
  }
  return colors[status] || colors.CONFIRMED
}

export default function CalendarioAlunoPage() {
  const router = useRouter()
  const [currentDate, setCurrentDate] = useState(() => new Date())
  const [lessons, setLessons] = useState<Lesson[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedLesson, setSelectedLesson] = useState<Lesson | null>(null)
  const [showRequestModal, setShowRequestModal] = useState(false)
  const [requestType, setRequestType] = useState<'CANCELAMENTO' | 'TROCA_AULA' | null>(null)
  const [availableDays, setAvailableDays] = useState<AvailableDay[]>([])
  const [availableDates, setAvailableDates] = useState<string[]>([]) // Array de datas YYYY-MM-DD
  const [selectedDay, setSelectedDay] = useState<number | null>(null)
  const [selectedDate, setSelectedDate] = useState<string | null>(null) // Data selecionada YYYY-MM-DD
  const [calendarMonth, setCalendarMonth] = useState(() => new Date()) // Mês do calendário
  const [holidays, setHolidays] = useState<Set<string>>(new Set()) // Set de feriados (YYYY-MM-DD)
  const [teacherSlots, setTeacherSlots] = useState<TeacherSlot[]>([])
  const [loadingDays, setLoadingDays] = useState(false)
  const [loadingSlots, setLoadingSlots] = useState(false)
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null)
  const [customDateTime, setCustomDateTime] = useState('')
  const [useCustomTime, setUseCustomTime] = useState(false)
  const [requestNotes, setRequestNotes] = useState('')
  const [submittingRequest, setSubmittingRequest] = useState(false)
  const [showCancelConfirm, setShowCancelConfirm] = useState(false)
  const [cancellingLesson, setCancellingLesson] = useState(false)
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null)
  const [lessonRequests, setLessonRequests] = useState<Array<{
    id: string
    lessonId: string
    type: string
    status: string
    requestedStartAt: string | null
    requestedTeacherId: string | null
    notes: string | null
    adminNotes: string | null
    criadoEm: string
    lesson: {
      startAt: string
      teacher: { nome: string }
    }
    requestedTeacher: { nome: string } | null
  }>>([])
  const [requestsModalOpen, setRequestsModalOpen] = useState(false)

  const periodStart = useMemo(() => getStartOfMonth(currentDate), [currentDate])
  const periodEnd = useMemo(() => {
    const end = addMonths(currentDate, 1)
    end.setDate(0)
    end.setHours(23, 59, 59, 999)
    return end
  }, [currentDate])

  const fetchLessons = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(
        `/api/student/lessons?start=${periodStart.toISOString()}&end=${periodEnd.toISOString()}`,
        { credentials: 'include' }
      )
      if (res.status === 401 || res.status === 403) {
        router.push('/login')
        return
      }
      const json = await res.json()
      if (json.ok && Array.isArray(json.data?.lessons)) {
        console.log('[Calendário Aluno] Carregadas', json.data.lessons.length, 'aulas')
        const lessonsWithRequests = json.data.lessons.filter((l: Lesson) => l.requests && l.requests.length > 0)
        if (lessonsWithRequests.length > 0) {
          console.log('[Calendário Aluno] Aulas com solicitações pendentes:', lessonsWithRequests.map((l: Lesson) => ({ id: l.id, requests: l.requests })))
        }
        setLessons(json.data.lessons)
      } else {
        setLessons([])
      }
    } catch {
      setError('Erro ao carregar aulas')
      setLessons([])
    } finally {
      setLoading(false)
    }
  }, [periodStart, periodEnd, router])

  const fetchLessonRequests = useCallback(async () => {
    try {
      const res = await fetch('/api/student/lesson-requests', { credentials: 'include' })
      if (res.ok) {
        const json = await res.json()
        if (json.ok && json.requests) {
          setLessonRequests(json.requests)
        }
      }
    } catch (e) {
      console.error('Erro ao buscar solicitações:', e)
    }
  }, [])

  useEffect(() => {
    fetchLessons()
  }, [fetchLessons])

  useEffect(() => {
    fetchLessonRequests()
  }, [fetchLessonRequests])

  // Ouvir evento de atualização de aulas (quando solicitação é aprovada)
  useEffect(() => {
    const handleLessonsUpdated = () => {
      fetchLessons()
      fetchLessonRequests()
    }
    window.addEventListener('lessons-updated', handleLessonsUpdated)
    return () => window.removeEventListener('lessons-updated', handleLessonsUpdated)
  }, [fetchLessons, fetchLessonRequests])

  // Buscar feriados para um intervalo (calendário principal e modal de troca)
  const fetchHolidays = useCallback(async (start: Date, end: Date) => {
    const startStr = start.toISOString().split('T')[0]
    const endStr = end.toISOString().split('T')[0]
    try {
      const res = await fetch(`/api/student/holidays?start=${startStr}&end=${endStr}`, {
        credentials: 'include',
      })
      const json = await res.json()
      if (json.ok && Array.isArray(json.data?.holidays)) {
        setHolidays(new Set(json.data.holidays))
      }
    } catch {
      setHolidays(new Set())
    }
  }, [])

  // Feriados no calendário principal (período do mês exibido)
  useEffect(() => {
    fetchHolidays(periodStart, periodEnd)
  }, [periodStart, periodEnd, fetchHolidays])

  // Ao abrir modal de troca: definir mês do calendário e feriados do intervalo de seleção
  useEffect(() => {
    if (showRequestModal && selectedLesson) {
      setCalendarMonth(new Date(selectedLesson.startAt))
      const lessonDate = new Date(selectedLesson.startAt)
      const start = new Date(lessonDate)
      start.setMonth(start.getMonth() - 1)
      const end = new Date(lessonDate)
      end.setMonth(end.getMonth() + 4)
      fetchHolidays(start, end)
    }
  }, [showRequestModal, selectedLesson, fetchHolidays])

  // Buscar datas disponíveis do professor quando abrir modal de troca
  useEffect(() => {
    if (showRequestModal && selectedLesson && requestType === 'TROCA_AULA' && !selectedDate) {
      fetchAvailableDates()
    }
  }, [showRequestModal, selectedLesson, requestType, selectedDate])

  // Buscar horários quando selecionar uma data específica
  useEffect(() => {
    if (showRequestModal && selectedLesson && requestType === 'TROCA_AULA' && selectedDate) {
      fetchTeacherSlotsForDate(selectedDate)
    }
  }, [selectedDate, showRequestModal, selectedLesson, requestType])

  const fetchAvailableDates = useCallback(async () => {
    if (!selectedLesson) return
    setLoadingDays(true)
    setSelectedDate(null)
    setTeacherSlots([])
    try {
      const res = await fetch(`/api/student/teacher-availability?teacherId=${selectedLesson.teacherId}&lessonId=${selectedLesson.id}`, {
        credentials: 'include',
      })
      if (res.ok) {
        const json = await res.json()
        if (json.ok) {
          setAvailableDates(json.availableDates || [])
        } else {
          setError(json.message || 'Erro ao buscar datas disponíveis')
        }
      }
    } catch (err) {
      console.error('Erro ao buscar datas disponíveis do professor:', err)
      setError('Erro ao buscar datas disponíveis')
    } finally {
      setLoadingDays(false)
    }
  }, [selectedLesson])

  const fetchTeacherSlotsForDate = useCallback(async (date: string) => {
    if (!selectedLesson) return
    setLoadingSlots(true)
    setSelectedSlot(null)
    setError(null)
    try {
      const duration = selectedLesson.durationMinutes || 60
      const res = await fetch(
        `/api/student/teacher-availability?teacherId=${selectedLesson.teacherId}&dayOfWeek=${date}&durationMinutes=${duration}&lessonId=${selectedLesson.id}`,
        {
          credentials: 'include',
        }
      )
      if (res.ok) {
        const json = await res.json()
        if (json.ok) {
          setTeacherSlots(json.slots || [])
        } else {
          setError(json.message || 'Erro ao buscar horários')
          setSelectedDate(null) // Limpar seleção se houver erro
        }
      }
    } catch (err) {
      console.error('Erro ao buscar horários do professor:', err)
      setError('Erro ao buscar horários')
    } finally {
      setLoadingSlots(false)
    }
  }, [selectedLesson])

  const handleSubmitRequest = useCallback(async () => {
    if (!selectedLesson || !requestType) return

    setSubmittingRequest(true)
    try {
      let requestedStartAt: string | null = null

      if (requestType === 'TROCA_AULA') {
        if (useCustomTime) {
          if (!customDateTime) {
            setError('Selecione uma data e horário')
            setSubmittingRequest(false)
            return
          }
          requestedStartAt = new Date(customDateTime).toISOString()
        } else if (selectedSlot) {
          // Usar a data do slot selecionado (já vem formatada da API)
          requestedStartAt = selectedSlot
        } else {
          setError('Selecione um horário disponível ou informe um horário personalizado')
          setSubmittingRequest(false)
          return
        }
      }

      const res = await fetch('/api/lesson-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          lessonId: selectedLesson.id,
          type: requestType,
          requestedStartAt,
          notes: requestNotes.trim() || null,
        }),
      })

      const json = await res.json()
      if (res.ok && json.ok) {
        setShowRequestModal(false)
        setSelectedLesson(null)
        setRequestType(null)
        setSelectedDay(null)
        setSelectedDate(null)
        setSelectedSlot(null)
        setCustomDateTime('')
        setUseCustomTime(false)
        setRequestNotes('')
        setAvailableDays([])
        setAvailableDates([])
        setTeacherSlots([])
        setCalendarMonth(new Date())
        setError(null)
        setToast({ message: 'Solicitação enviada com sucesso!', type: 'success' })
        // Aguardar um pouco antes de recarregar para garantir que o banco foi atualizado
        setTimeout(() => {
          fetchLessons()
          fetchLessonRequests()
        }, 500)
      } else {
        setError(json.message || 'Erro ao enviar solicitação')
      }
    } catch (err) {
      setError('Erro ao enviar solicitação')
      console.error(err)
    } finally {
      setSubmittingRequest(false)
    }
  }, [selectedLesson, requestType, selectedSlot, useCustomTime, customDateTime, requestNotes, fetchLessons, fetchLessonRequests])

  const handleCancelLesson = useCallback(async () => {
    if (!selectedLesson) return
    
    setCancellingLesson(true)
    try {
      const res = await fetch(`/api/student/lessons/${selectedLesson.id}/cancel`, {
        method: 'POST',
        credentials: 'include',
      })
      
      const json = await res.json()
      if (res.ok && json.ok) {
        setShowCancelConfirm(false)
        setSelectedLesson(null)
        setToast({ message: 'Aula cancelada com sucesso!', type: 'success' })
        // Disparar evento para atualizar calendários
        window.dispatchEvent(new CustomEvent('lessons-updated'))
        setTimeout(() => {
          fetchLessons()
          fetchLessonRequests()
        }, 500)
      } else {
        setToast({ message: json.message || 'Erro ao cancelar aula', type: 'error' })
      }
    } catch (err) {
      console.error('Erro ao cancelar aula:', err)
      setToast({ message: 'Erro ao cancelar aula', type: 'error' })
    } finally {
      setCancellingLesson(false)
    }
  }, [selectedLesson, fetchLessons])

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

  const getLessonsForDay = (day: Date) => lessons.filter((l) => isSameDayInTZ(l.startAt, day))

  const titleLabel = `${MESES[currentDate.getMonth()]} ${currentDate.getFullYear()}`

  return (
    <div className="min-w-0">
      <h1 className="text-2xl font-bold text-gray-900 mb-1">Calendário</h1>
      <p className="text-sm text-gray-600 mb-1">Suas aulas do mês. Apenas visualização.</p>
      <p className="text-xs text-gray-500 mb-4">Horários exibidos em America/Sao_Paulo (Brasil)</p>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-4">
        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={() => setCurrentDate((d) => addMonths(d, -1))}
            className="p-2 rounded border border-gray-200 hover:bg-gray-50"
            aria-label="Mês anterior"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <button
            type="button"
            onClick={() => setCurrentDate(new Date())}
            className="px-4 py-2 text-sm border border-gray-200 rounded hover:bg-gray-50"
          >
            Hoje
          </button>
          <button
            type="button"
            onClick={() => setCurrentDate((d) => addMonths(d, 1))}
            className="p-2 rounded border border-gray-200 hover:bg-gray-50"
            aria-label="Próximo mês"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
          <h2 className="text-lg font-semibold text-gray-800 min-w-[200px] text-center sm:text-left">
            {titleLabel}
          </h2>
        </div>
      </div>

      {/* Cubo de Status de Solicitações */}
      {lessonRequests.length > 0 && (
        <div className="mb-4">
          <button
            type="button"
            onClick={() => setRequestsModalOpen(true)}
            className="flex items-center gap-3 p-4 bg-white rounded-xl border border-purple-200 shadow-sm hover:shadow-md transition-shadow text-left w-full"
          >
            <div className="p-2 rounded-lg bg-purple-100">
              <Bell className="w-6 h-6 text-purple-600" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-medium text-gray-500">Status de Solicitações</p>
              <p className="text-2xl font-bold text-gray-900">{lessonRequests.length}</p>
              <p className="text-xs text-gray-400 mt-0.5">
                {lessonRequests.filter((r) => r.status === 'PENDING' || r.status === 'TEACHER_REJECTED').length} pendente(s)
              </p>
            </div>
          </button>
        </div>
      )}

      {error && (
        <div className="mb-4 p-4 bg-red-50 text-red-800 rounded-lg text-sm">{error}</div>
      )}
      {loading && <div className="mb-4 text-sm text-gray-500">Carregando...</div>}

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-x-auto min-w-0">
        <div className="grid grid-cols-7 min-w-[280px]">
          {DIAS_SEMANA.map((dia, idx) => (
            <div
              key={dia}
              className={`py-2 text-center text-xs font-semibold uppercase ${
                idx === 0 ? 'text-red-700 bg-red-50' : 'text-gray-600'
              }`}
            >
              {dia}
            </div>
          ))}
          {monthGrid.map((week, wi) =>
            week.map((day, di) => {
              const otherMonth = !isSameMonth(day, currentDate)
              const dayLessons = getLessonsForDay(day)
              const isHoliday = holidays.has(toDateKey(day))
              return (
                <div
                  key={`${wi}-${di}`}
                  className={`min-h-[100px] sm:min-h-[120px] border-b border-r border-gray-100 p-2 ${
                    otherMonth ? 'bg-gray-50/50' : isHoliday ? 'bg-amber-50/80' : day.getDay() === 0 ? 'bg-red-50' : 'bg-white'
                  } ${di === 6 ? 'border-r-0' : ''}`}
                >
                  <span
                    className={`inline-flex items-center justify-center w-7 h-7 rounded-full text-sm ${
                      isToday(day)
                        ? 'bg-brand-orange text-white font-semibold'
                        : otherMonth
                          ? 'text-gray-400'
                          : isHoliday
                            ? 'text-amber-700'
                            : day.getDay() === 0
                              ? 'text-red-700'
                              : 'text-gray-800'
                    }`}
                  >
                    {day.getDate()}
                  </span>
                  {isHoliday && !otherMonth && (
                    <p className="text-[10px] sm:text-xs font-medium text-amber-700 mt-0.5">Feriado</p>
                  )}
                  <div className="mt-1 space-y-0.5">
                    {dayLessons.slice(0, 4).map((l) => (
                      <button
                        key={l.id}
                        type="button"
                        onClick={() => setSelectedLesson(l)}
                        className={`w-full text-left text-xs px-1.5 py-0.5 rounded border break-words line-clamp-2 cursor-pointer hover:ring-2 hover:ring-brand-orange/50 ${statusColor(l.status, l.requests && l.requests.length > 0)}`}
                        title={`Clique para ver detalhes – ${l.teacher.nome} ${formatTimeInTZ(l.startAt, 'pt-BR')}${l.requests && l.requests.length > 0 ? ' (Em processo de troca)' : ''}`}
                      >
                        {l.teacher.nome} {formatTimeInTZ(l.startAt, 'pt-BR')}
                      </button>
                    ))}
                    {dayLessons.length > 4 && (
                      <span className="text-xs text-gray-400">+{dayLessons.length - 4}</span>
                    )}
                  </div>
                </div>
              )
            })
          )}
        </div>
      </div>

      {/* Modal: informações da aula ao clicar */}
      <Modal
        isOpen={!!selectedLesson && !showRequestModal}
        onClose={() => {
          setSelectedLesson(null)
          setShowRequestModal(false)
        }}
        title="Informações da aula"
        size="md"
        footer={
          selectedLesson && selectedLesson.status === 'CONFIRMED' && new Date(selectedLesson.startAt) > new Date() ? (
            selectedLesson.enrollment.tipoAula === 'GRUPO' ? (
              <div className="p-3 bg-gray-100 border border-gray-200 rounded-lg text-sm text-gray-700">
                Aulas em grupo não podem ser canceladas nem trocadas pelo portal. Entre em contato com a gestão para alterações.
              </div>
            ) : (
            <div className="space-y-2">
              <Button
                variant="outline"
                onClick={() => {
                  setShowCancelConfirm(true)
                }}
              >
                Cancelar aula
              </Button>
              {(() => {
                // Verificar se pode reagendar baseado no tempo de antecedência
                const lessonDate = new Date(selectedLesson.startAt)
                const agora = new Date()
                const diffHoras = (lessonDate.getTime() - agora.getTime()) / (1000 * 60 * 60)
                
                const escolaMatricula = selectedLesson.enrollment.escolaMatricula
                const isYoubecome = escolaMatricula === 'YOUBECOME'
                let horasAntecedencia = isYoubecome ? 24 : 6
                const cancelamentoHoras = selectedLesson.enrollment.cancelamentoAntecedenciaHoras
                if (cancelamentoHoras !== null && cancelamentoHoras !== undefined && typeof cancelamentoHoras === 'number') {
                  horasAntecedencia = cancelamentoHoras
                }
                
                const podeReagendar = diffHoras >= horasAntecedencia
                const aulaEmFeriado = holidays.has(toDateKey(new Date(selectedLesson.startAt)))
                
                if (aulaEmFeriado) {
                  return (
                    <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
                      Esta aula está em um feriado e não pode ser reagendada.
                    </div>
                  )
                }
                
                if (!podeReagendar) {
                  return (
                    <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
                      Você só pode reagendar a aula com pelo menos {horasAntecedencia} {horasAntecedencia === 1 ? 'hora' : 'horas'} de antecedência
                    </div>
                  )
                }
                
                return (
                  <Button
                    variant="primary"
                    onClick={() => {
                      setRequestType('TROCA_AULA')
                      setShowRequestModal(true)
                    }}
                  >
                    Solicitar troca de aula
                  </Button>
                )
              })()}
            </div>
            )
          ) : undefined
        }
      >
        {selectedLesson && (
          <div className="space-y-3 text-sm">
            <p><strong>Data e horário:</strong> {formatDateTimeInTZ(selectedLesson.startAt, 'pt-BR')}</p>
            <p><strong>Professor:</strong> {selectedLesson.teacher.nome}</p>
            <p><strong>Status:</strong> {statusLabel[selectedLesson.status]}</p>
            <p><strong>Duração:</strong> {selectedLesson.durationMinutes} min</p>
            {selectedLesson.notes && (
              <p><strong>Observações:</strong> {selectedLesson.notes}</p>
            )}
          </div>
        )}
      </Modal>

      {/* Modal: Confirmação de cancelamento */}
      <Modal
        isOpen={showCancelConfirm && !!selectedLesson}
        onClose={() => setShowCancelConfirm(false)}
        title="Confirmar cancelamento"
        size="md"
        footer={
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => setShowCancelConfirm(false)}
              disabled={cancellingLesson}
            >
              Não, manter aula
            </Button>
            <Button
              variant="primary"
              onClick={handleCancelLesson}
              disabled={cancellingLesson}
              className="bg-red-600 hover:bg-red-700"
            >
              {cancellingLesson ? 'Cancelando...' : 'Sim, cancelar aula'}
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <div className="p-4 bg-amber-50 border-2 border-amber-200 rounded-lg">
            <p className="text-sm font-semibold text-amber-900 mb-2">
              ⚠️ Atenção
            </p>
            <p className="text-sm text-amber-800">
              Se você cancelar essa aula não poderá agendar reposição. Tem certeza disso?
            </p>
          </div>
          {selectedLesson && (
            <div className="space-y-2 text-sm">
              <p><strong>Aula:</strong> {formatDateTimeInTZ(selectedLesson.startAt, 'pt-BR')}</p>
              <p><strong>Professor:</strong> {selectedLesson.teacher.nome}</p>
            </div>
          )}
        </div>
      </Modal>

      {/* Modal: Solicitar cancelamento/troca */}
      <Modal
        isOpen={showRequestModal && !!selectedLesson}
        onClose={() => {
          setShowRequestModal(false)
          setRequestType(null)
          setSelectedDay(null)
          setSelectedDate(null)
          setSelectedSlot(null)
          setCustomDateTime('')
          setUseCustomTime(false)
          setRequestNotes('')
          setAvailableDays([])
          setAvailableDates([])
          setTeacherSlots([])
          setCalendarMonth(new Date())
        }}
        title={requestType === 'CANCELAMENTO' ? 'Solicitar cancelamento de aula' : 'Solicitar troca de aula'}
        size="lg"
        footer={
          <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  setShowRequestModal(false)
                  setRequestType(null)
                  setSelectedDay(null)
                  setSelectedDate(null)
                  setSelectedSlot(null)
                  setCustomDateTime('')
                  setUseCustomTime(false)
                  setRequestNotes('')
                  setAvailableDays([])
                  setAvailableDates([])
                  setTeacherSlots([])
                  setCalendarMonth(new Date())
                }}
              >
                Cancelar
              </Button>
            <Button
              variant="primary"
              onClick={handleSubmitRequest}
              disabled={
                submittingRequest ||
                (requestType === 'TROCA_AULA' && !selectedSlot && !useCustomTime) ||
                (requestType === 'TROCA_AULA' && !selectedDate && !useCustomTime)
              }
            >
              {submittingRequest ? 'Enviando...' : 'Enviar solicitação'}
            </Button>
          </div>
        }
      >
        {selectedLesson && (
          <div className="space-y-4">
            <div className="p-3 bg-blue-50 rounded-lg text-sm">
              <p><strong>Aula atual:</strong> {formatDateTimeInTZ(selectedLesson.startAt, 'pt-BR')}</p>
              <p><strong>Professor:</strong> {selectedLesson.teacher.nome}</p>
              {holidays.has(toDateKey(new Date(selectedLesson.startAt))) && (
                <p className="text-amber-700 font-semibold mt-2">
                  ⚠️ Esta aula está em um feriado e não pode ser reagendada
                </p>
              )}
            </div>
            
            {error && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-800">
                {error}
              </div>
            )}

            {requestType === 'TROCA_AULA' && (
              <>
                {!selectedDate ? (
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">
                      Selecione uma data disponível
                    </label>
                    {loadingDays ? (
                      <p className="text-sm text-gray-500">Carregando datas disponíveis...</p>
                    ) : availableDates.length === 0 ? (
                      <div className="text-sm text-gray-500 space-y-1">
                        <p>Professor não possui horários disponíveis nos próximos 3 meses</p>
                        {holidays.has(toDateKey(new Date(selectedLesson.startAt))) && (
                          <p className="text-amber-700 font-semibold">⚠️ Esta aula está em um feriado e não pode ser reagendada</p>
                        )}
                      </div>
                    ) : (
                      <div className="space-y-4">
                        {/* Navegação do calendário */}
                        <div className="flex items-center justify-between">
                          <button
                            type="button"
                            onClick={() => {
                              const prev = new Date(calendarMonth)
                              prev.setMonth(prev.getMonth() - 1)
                              setCalendarMonth(prev)
                            }}
                            className="p-1 hover:bg-gray-100 rounded"
                          >
                            <ChevronLeft className="w-5 h-5" />
                          </button>
                          <h3 className="text-lg font-semibold">
                            {calendarMonth.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}
                          </h3>
                          <button
                            type="button"
                            onClick={() => {
                              const next = new Date(calendarMonth)
                              next.setMonth(next.getMonth() + 1)
                              setCalendarMonth(next)
                            }}
                            className="p-1 hover:bg-gray-100 rounded"
                          >
                            <ChevronRight className="w-5 h-5" />
                          </button>
                        </div>
                        
                        {/* Calendário */}
                        <div className="grid grid-cols-7 gap-1">
                          {/* Cabeçalho dos dias da semana */}
                          {DIAS_SEMANA.map((dia) => (
                            <div key={dia} className="text-center text-xs font-semibold text-gray-600 py-1">
                              {dia}
                            </div>
                          ))}
                          
                          {/* Dias do mês */}
                          {(() => {
                            const start = getStartOfMonth(calendarMonth)
                            const startOfWeek = getStartOfWeek(start)
                            const end = addMonths(start, 1)
                            end.setDate(0)
                            const days: Date[] = []
                            let current = new Date(startOfWeek)
                            while (current <= end || current.getMonth() === calendarMonth.getMonth()) {
                              days.push(new Date(current))
                              current = addDays(current, 1)
                              if (days.length >= 42) break // 6 semanas
                            }
                            
                            return days.map((day, idx) => {
                              const dateStr = day.toISOString().split('T')[0]
                              const dateKey = toDateKey(day)
                              const isAvailable = availableDates.includes(dateStr)
                              const isCurrentMonth = day.getMonth() === calendarMonth.getMonth()
                              const isTodayDate = isToday(day)
                              const isSelected = selectedDate === dateStr
                              const isHoliday = holidays.has(dateKey)
                              
                              // Verificar se é anterior à aula original
                              const lessonDate = selectedLesson ? new Date(selectedLesson.startAt) : null
                              const lessonDateKey = lessonDate ? lessonDate.toISOString().split('T')[0] : null
                              const isBeforeLesson = lessonDateKey && dateStr < lessonDateKey
                              
                              const canSelect = isAvailable && !isHoliday && !isBeforeLesson && isCurrentMonth
                              
                              return (
                                <button
                                  key={idx}
                                  type="button"
                                  onClick={() => {
                                    if (canSelect) {
                                      setSelectedDate(dateStr)
                                    }
                                  }}
                                  disabled={!canSelect}
                                  title={
                                    isHoliday
                                      ? 'Feriado - não é possível agendar'
                                      : isBeforeLesson
                                      ? 'Não é possível agendar para uma data anterior à aula original'
                                      : !isAvailable
                                      ? 'Data não disponível'
                                      : ''
                                  }
                                  className={`
                                    aspect-square p-1 text-xs rounded border transition-colors
                                    ${!isCurrentMonth ? 'text-gray-300' : ''}
                                    ${isTodayDate ? 'border-blue-500 bg-blue-50' : ''}
                                    ${isHoliday && isCurrentMonth ? 'bg-amber-50 text-amber-600 border-amber-300 cursor-not-allowed' : ''}
                                    ${isBeforeLesson && isCurrentMonth ? 'bg-red-50 text-red-400 border-red-200 cursor-not-allowed' : ''}
                                    ${canSelect
                                      ? isSelected
                                        ? 'bg-brand-orange text-white border-brand-orange font-semibold'
                                        : 'bg-green-50 text-green-800 border-green-300 hover:bg-green-100 cursor-pointer'
                                      : isCurrentMonth && !isHoliday && !isBeforeLesson
                                      ? 'bg-gray-50 text-gray-400 border-gray-200 cursor-not-allowed'
                                      : !isCurrentMonth
                                      ? 'bg-transparent border-transparent cursor-not-allowed'
                                      : ''
                                    }
                                  `}
                                >
                                  {day.getDate()}
                                </button>
                              )
                            })
                          })()}
                        </div>
                        
                        {/* Legenda */}
                        <div className="flex flex-wrap gap-4 text-xs text-gray-600 mt-2 pt-2 border-t border-gray-200">
                          <div className="flex items-center gap-1">
                            <div className="w-4 h-4 rounded border bg-green-50 border-green-300"></div>
                            <span>Disponível</span>
                          </div>
                          <div className="flex items-center gap-1">
                            <div className="w-4 h-4 rounded border bg-amber-50 border-amber-300"></div>
                            <span>Feriado</span>
                          </div>
                          <div className="flex items-center gap-1">
                            <div className="w-4 h-4 rounded border bg-red-50 border-red-200"></div>
                            <span>Data anterior</span>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <>
                    <div className="flex items-center gap-2 mb-2">
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedDate(null)
                          setSelectedSlot(null)
                          setTeacherSlots([])
                        }}
                        className="text-sm text-brand-orange hover:underline"
                      >
                        ← Voltar para selecionar data
                      </button>
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-2">
                        Horários disponíveis - {selectedDate ? new Date(selectedDate + 'T00:00:00').toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' }) : ''}
                      </label>
                      {loadingSlots ? (
                        <p className="text-sm text-gray-500">Carregando horários...</p>
                      ) : teacherSlots.length === 0 ? (
                        <p className="text-sm text-gray-500">Nenhum horário disponível neste dia</p>
                      ) : (
                        <div className="space-y-2 max-h-60 overflow-y-auto">
                          {teacherSlots.map((slot, idx) => {
                            const slotKey = slot.date
                            const slotDate = new Date(slot.date)
                            return (
                              <button
                                key={idx}
                                type="button"
                                onClick={() => {
                                  setSelectedSlot(slotKey)
                                  setUseCustomTime(false)
                                }}
                                className={`w-full text-left p-2 rounded border ${
                                  selectedSlot === slotKey
                                    ? 'border-brand-orange bg-orange-50'
                                    : 'border-gray-200 hover:border-gray-300'
                                }`}
                              >
                                <span className="font-medium">{slot.startTime}</span> às {slot.endTime}
                                <span className="text-xs text-gray-500 ml-2">
                                  ({slotDate.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })})
                                </span>
                              </button>
                            )
                          })}
                        </div>
                      )}
                    </div>

                    <div>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={useCustomTime}
                          onChange={(e) => {
                            setUseCustomTime(e.target.checked)
                            if (e.target.checked) {
                              setSelectedSlot(null)
                            }
                          }}
                          className="rounded border-gray-300"
                        />
                        <span className="text-sm font-medium text-gray-700">Não encontrou o horário desejado</span>
                      </label>
                      {useCustomTime && (
                        <div className="mt-2">
                          <input
                            type="datetime-local"
                            value={customDateTime}
                            onChange={(e) => setCustomDateTime(e.target.value)}
                            className="input w-full"
                            min={new Date().toISOString().slice(0, 16)}
                          />
                        </div>
                      )}
                    </div>
                  </>
                )}
              </>
            )}

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Observações (opcional)
              </label>
              <textarea
                value={requestNotes}
                onChange={(e) => setRequestNotes(e.target.value)}
                className="input w-full"
                rows={3}
                placeholder="Descreva o motivo da solicitação..."
              />
            </div>
          </div>
        )}
      </Modal>

      {/* Modal: Status de Solicitações */}
      <Modal
        isOpen={requestsModalOpen}
        onClose={() => setRequestsModalOpen(false)}
        title="Status das Solicitações"
        size="lg"
        footer={<Button variant="primary" onClick={() => setRequestsModalOpen(false)}>Fechar</Button>}
      >
        <div className="max-h-[60vh] overflow-y-auto space-y-3">
          {lessonRequests.length > 0 ? (
            lessonRequests.slice(0, 5).map((request) => {
              const lessonDate = new Date(request.lesson.startAt)
              const getRequestStatusLabel = (status: string) => {
                const labels: Record<string, string> = {
                  PENDING: 'Pendente',
                  TEACHER_APPROVED: 'Aprovada pelo professor',
                  TEACHER_REJECTED: 'Rejeitada pelo professor - aguardando gestão',
                  COMPLETED: 'Concluída',
                  ADMIN_REJECTED: 'Negada pela gestão',
                }
                return labels[status] || status
              }

              const getRequestStatusColor = (status: string) => {
                const colors: Record<string, string> = {
                  PENDING: 'bg-yellow-100 text-yellow-800 border-yellow-200',
                  TEACHER_APPROVED: 'bg-green-100 text-green-800 border-green-200',
                  TEACHER_REJECTED: 'bg-purple-100 text-purple-800 border-purple-200',
                  COMPLETED: 'bg-blue-100 text-blue-800 border-blue-200',
                  ADMIN_REJECTED: 'bg-red-100 text-red-800 border-red-200',
                }
                return colors[status] || 'bg-gray-100 text-gray-800 border-gray-200'
              }

              const getRequestTypeLabel = (type: string) => {
                const labels: Record<string, string> = {
                  CANCELAMENTO: 'Cancelamento',
                  TROCA_AULA: 'Troca de aula',
                  TROCA_PROFESSOR: 'Troca de professor',
                }
                return labels[type] || type
              }

              return (
                <div key={request.id} className="p-4 rounded-lg border border-purple-200 bg-purple-50">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="flex-1">
                      <p className="text-sm font-medium text-gray-900">
                        {getRequestTypeLabel(request.type)}
                      </p>
                      <p className="text-xs text-gray-600 mt-1">
                        Aula: {lessonDate.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })} às {lessonDate.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                      </p>
                      <p className="text-xs text-gray-600">Professor: {request.lesson.teacher.nome}</p>
                      {request.requestedStartAt && (
                        <p className="text-xs text-gray-600 mt-1">
                          Solicitado para: {new Date(request.requestedStartAt).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })} às {new Date(request.requestedStartAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                        </p>
                      )}
                      {request.requestedTeacher && (
                        <p className="text-xs text-gray-600 mt-1">
                          Professor solicitado: {request.requestedTeacher.nome}
                        </p>
                      )}
                      <p className="text-xs text-gray-500 mt-2">
                        Criada em: {new Date(request.criadoEm).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })} às {new Date(request.criadoEm).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </div>
                    <span className={`text-xs px-2 py-1 rounded shrink-0 ${getRequestStatusColor(request.status)}`}>
                      {getRequestStatusLabel(request.status)}
                    </span>
                  </div>
                  {request.notes && (
                    <p className="text-xs text-gray-600 mt-2 border-t border-purple-200 pt-2">
                      <strong>Observações:</strong> {request.notes}
                    </p>
                  )}
                  {request.adminNotes && (
                    <p className="text-xs text-gray-600 mt-2 border-t border-purple-200 pt-2 italic">
                      <strong>Observação da gestão:</strong> {request.adminNotes}
                    </p>
                  )}
                </div>
              )
            })
          ) : (
            <p className="text-gray-500 text-sm text-center py-4">Nenhuma solicitação encontrada.</p>
          )}
          {lessonRequests.length > 5 && (
            <p className="text-xs text-gray-500 text-center py-2 border-t border-gray-200 mt-3">
              Mostrando apenas as 5 solicitações mais recentes de {lessonRequests.length} total
            </p>
          )}
        </div>
      </Modal>

      {/* Toast de notificação */}
      {toast && (
        <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />
      )}
    </div>
  )
}
