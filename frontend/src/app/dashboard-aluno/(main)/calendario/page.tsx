/**
 * Dashboard Aluno – Calendário (suas aulas, somente visualização)
 */

'use client'

import { useState, useMemo, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import Modal from '@/components/admin/Modal'

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
  enrollment: { id: string; nome: string; tipoAula: string | null; nomeGrupo: string | null }
  teacher: { id: string; nome: string }
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
  return d.toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

const statusLabel: Record<string, string> = {
  CONFIRMED: 'Confirmada',
  CANCELLED: 'Cancelada',
  REPOSICAO: 'Reposição',
}

const statusColor: Record<string, string> = {
  CONFIRMED: 'bg-green-100 text-green-800 border-green-200',
  CANCELLED: 'bg-red-100 text-red-800 border-red-200',
  REPOSICAO: 'bg-amber-100 text-amber-800 border-amber-200',
}

export default function CalendarioAlunoPage() {
  const router = useRouter()
  const [currentDate, setCurrentDate] = useState(() => new Date())
  const [lessons, setLessons] = useState<Lesson[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedLesson, setSelectedLesson] = useState<Lesson | null>(null)

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

  useEffect(() => {
    fetchLessons()
  }, [fetchLessons])

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

  const getLessonsForDay = (day: Date) => lessons.filter((l) => isSameDay(new Date(l.startAt), day))

  const titleLabel = `${MESES[currentDate.getMonth()]} ${currentDate.getFullYear()}`

  return (
    <div className="min-w-0">
      <h1 className="text-2xl font-bold text-gray-900 mb-1">Calendário</h1>
      <p className="text-sm text-gray-600 mb-4">Suas aulas do mês. Apenas visualização.</p>

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
              return (
                <div
                  key={`${wi}-${di}`}
                  className={`min-h-[100px] sm:min-h-[120px] border-b border-r border-gray-100 p-2 ${
                    otherMonth ? 'bg-gray-50/50' : day.getDay() === 0 ? 'bg-red-50' : 'bg-white'
                  } ${di === 6 ? 'border-r-0' : ''}`}
                >
                  <span
                    className={`inline-flex items-center justify-center w-7 h-7 rounded-full text-sm ${
                      isToday(day)
                        ? 'bg-brand-orange text-white font-semibold'
                        : otherMonth
                          ? 'text-gray-400'
                          : day.getDay() === 0
                            ? 'text-red-700'
                            : 'text-gray-800'
                    }`}
                  >
                    {day.getDate()}
                  </span>
                  <div className="mt-1 space-y-0.5">
                    {dayLessons.slice(0, 4).map((l) => (
                      <button
                        key={l.id}
                        type="button"
                        onClick={() => setSelectedLesson(l)}
                        className={`w-full text-left text-xs px-1.5 py-0.5 rounded border break-words line-clamp-2 cursor-pointer hover:ring-2 hover:ring-brand-orange/50 ${statusColor[l.status]}`}
                        title={`Clique para ver detalhes – ${l.teacher.nome} ${formatTime(l.startAt)}`}
                      >
                        {l.teacher.nome} {formatTime(l.startAt)}
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
        isOpen={!!selectedLesson}
        onClose={() => setSelectedLesson(null)}
        title="Informações da aula"
        size="md"
      >
        {selectedLesson && (
          <div className="space-y-3 text-sm">
            <p><strong>Data e horário:</strong> {formatDateTime(selectedLesson.startAt)}</p>
            <p><strong>Professor:</strong> {selectedLesson.teacher.nome}</p>
            <p><strong>Status:</strong> {statusLabel[selectedLesson.status]}</p>
            <p><strong>Duração:</strong> {selectedLesson.durationMinutes} min</p>
            {selectedLesson.notes && (
              <p><strong>Observações:</strong> {selectedLesson.notes}</p>
            )}
          </div>
        )}
      </Modal>
    </div>
  )
}
