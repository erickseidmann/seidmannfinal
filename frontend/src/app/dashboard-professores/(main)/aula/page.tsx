/**
 * Dashboard Professor – Central de Salas de Aula (todas as aulas + entrar/encerrar chamada)
 */

'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  Video,
  VideoOff,
  Loader2,
  ChevronLeft,
  ChevronRight,
  PhoneOff,
  AlertCircle,
} from 'lucide-react'
import Button from '@/components/ui/Button'
import { useTranslation } from '@/contexts/LanguageContext'
import { useLessonAttendance } from '@/hooks/useLessonAttendance'
import { useConfirmDialog } from '@/hooks/useConfirmDialog'
import SeidmannLoading from '@/components/ui/SeidmannLoading'
import {
  addDaysToBrazilDateKey,
  formatBrazilDateKeyLong,
  formatLessonDateShortInTZ,
  formatTimeInTZ,
  ymdInTZ,
} from '@/lib/datetime'

interface ClassroomLesson {
  id: string
  status: string
  startAt: string
  durationMinutes: number
  studentLabel: string
  classroom: {
    canJoin: boolean
    roomName: string | null
    windowStart: string
    windowEnd: string
    reason: string | null
    callEndedByProfessor?: boolean
  }
}

interface ActiveSession {
  attendanceId: string
  lessonId: string
  startAt: string
  studentLabel: string
}

function lessonPhase(
  lesson: ClassroomLesson,
  now: number
): 'upcoming' | 'live' | 'ended' {
  const windowStart = new Date(lesson.classroom.windowStart).getTime()
  const windowEnd = new Date(lesson.classroom.windowEnd).getTime()
  if (now > windowEnd) return 'ended'
  if (now >= windowStart) return 'live'
  return 'upcoming'
}

export default function ProfessorClassroomHubPage() {
  const { t } = useTranslation()
  const router = useRouter()
  const { confirm, ConfirmDialog } = useConfirmDialog()
  const [lessons, setLessons] = useState<ClassroomLesson[]>([])
  const [activeSession, setActiveSession] = useState<ActiveSession | null>(null)
  const [pendingActiveLessonId, setPendingActiveLessonId] = useState<string | null>(null)
  const [teacherLinkSala, setTeacherLinkSala] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [actionLessonId, setActionLessonId] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [now, setNow] = useState(() => Date.now())
  const [selectedDateKey, setSelectedDateKey] = useState(() => ymdInTZ(new Date()))

  const todayKey = useMemo(() => ymdInTZ(new Date()), [now])
  const isToday = selectedDateKey === todayKey
  const dayLabel = formatBrazilDateKeyLong(selectedDateKey)

  const trackingLessonId = activeSession?.lessonId ?? pendingActiveLessonId ?? ''
  const { registerLeave, syncActiveAttendance, isTracking } = useLessonAttendance(
    trackingLessonId,
    'professor'
  )

  const fetchData = useCallback(async () => {
    try {
      const params = new URLSearchParams({ date: selectedDateKey })
      const res = await fetch(`/api/professor/classroom-lessons?${params}`, {
        credentials: 'include',
      })
      const json = await res.json()
      if (!res.ok || !json.ok) {
        setError(json.message || 'Erro ao carregar aulas')
        return
      }
      setError(null)
      setLessons(json.data.lessons ?? [])
      setActiveSession(json.data.activeSession ?? null)
      setTeacherLinkSala(json.data.teacherLinkSala ?? null)
    } catch {
      setError('Erro de conexão')
    } finally {
      setLoading(false)
    }
  }, [selectedDateKey])

  useEffect(() => {
    fetchData()
    const interval = setInterval(fetchData, 30_000)
    return () => clearInterval(interval)
  }, [fetchData])

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])

  useEffect(() => {
    if (activeSession?.attendanceId) {
      syncActiveAttendance(activeSession.attendanceId)
    }
  }, [activeSession?.attendanceId, syncActiveAttendance])

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 5000)
    return () => clearTimeout(t)
  }, [toast])

  const meetUrlFor = (lesson: ClassroomLesson) => {
    if (teacherLinkSala?.trim()) return teacherLinkSala.trim()
    const room = lesson.classroom.roomName
    if (!room) return null
    return `https://meet.jit.si/${room}#config.prejoinPageEnabled=false`
  }

  const handleJoin = async (lesson: ClassroomLesson) => {
    if (activeSession && activeSession.lessonId !== lesson.id) {
      setToast(
        `Encerre a chamada com ${activeSession.studentLabel} antes de entrar em outra aula.`
      )
      return
    }
    const windowEnd = new Date(lesson.classroom.windowEnd).getTime()
    if (now > windowEnd) {
      setToast('O tempo de acesso a esta sala já expirou.')
      return
    }
    if (!lesson.classroom.canJoin && now >= new Date(lesson.classroom.windowStart).getTime()) {
      setToast(lesson.classroom.reason || 'Não é possível entrar nesta aula agora.')
      return
    }
    if (now < new Date(lesson.classroom.windowStart).getTime()) {
      setToast('A sala ainda não está aberta.')
      return
    }

    const url = meetUrlFor(lesson)
    if (!url) {
      setToast('Sala indisponível no momento.')
      return
    }

    setActionLessonId(lesson.id)
    try {
      const res = await fetch(`/api/professor/lessons/${lesson.id}/join`, {
        method: 'POST',
        credentials: 'include',
      })
      const json = await res.json()
      if (!res.ok || !json.ok) {
        setToast(json.message || 'Não foi possível entrar na aula.')
        return
      }
      if (json.attendanceId) {
        setPendingActiveLessonId(lesson.id)
        setActiveSession({
          attendanceId: json.attendanceId,
          lessonId: lesson.id,
          startAt: lesson.startAt,
          studentLabel: lesson.studentLabel,
        })
        syncActiveAttendance(json.attendanceId)
      }
      window.open(url, '_blank', 'noopener,noreferrer')
      await fetchData()
      window.dispatchEvent(new Event('professor-classroom-changed'))
    } catch {
      setToast('Erro ao entrar na aula.')
    } finally {
      setActionLessonId(null)
    }
  }

  const handleLeave = async (lessonId: string) => {
    const confirmed = await confirm({
      title: 'Encerrar aula',
      message:
        'Ao encerrar esta aula, você não poderá reabri-la. A próxima aula da sua agenda ficará disponível automaticamente. Deseja continuar?',
      confirmLabel: 'Encerrar aula',
      cancelLabel: 'Cancelar',
      variant: 'danger',
    })
    if (!confirmed) return

    setActionLessonId(lessonId)
    try {
      const { nextLesson } = await registerLeave({ finalizeCall: true })
      setPendingActiveLessonId(null)
      setActiveSession(null)
      await fetchData()
      window.dispatchEvent(new Event('professor-classroom-changed'))
      if (nextLesson?.id) {
        router.push(`/dashboard-professores/aula/${nextLesson.id}`)
      }
    } catch {
      setToast('Erro ao encerrar a aula.')
    } finally {
      setActionLessonId(null)
    }
  }

  if (loading) {
    return (
      <SeidmannLoading variant="inline" className="flex items-center justify-center min-h-[300px]" />
    )
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">{t('professor.nav.classroom')}</h1>
        <p className="text-gray-600 mt-1 text-sm">
          Aulas do dia selecionado (horário de Brasília). Você só pode estar em uma chamada por vez —
          encerre a atual antes de entrar em outra.
        </p>
      </div>

      <div className="flex items-center justify-between gap-3 rounded-xl border border-gray-200 bg-white px-3 py-2.5 shadow-sm">
        <button
          type="button"
          onClick={() => setSelectedDateKey((d) => addDaysToBrazilDateKey(d, -1))}
          className="p-2 rounded-lg text-gray-600 hover:bg-gray-100 hover:text-gray-900 transition-colors"
          aria-label="Dia anterior"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
        <div className="flex-1 min-w-0 text-center">
          <p className="text-sm sm:text-base font-semibold text-gray-900 capitalize truncate">
            {dayLabel}
            {isToday && (
              <span className="ml-2 text-xs font-medium text-brand-orange normal-case">(hoje)</span>
            )}
          </p>
          <p className="text-xs text-gray-500 mt-0.5">Fuso: America/Sao_Paulo</p>
        </div>
        <button
          type="button"
          onClick={() => setSelectedDateKey((d) => addDaysToBrazilDateKey(d, 1))}
          className="p-2 rounded-lg text-gray-600 hover:bg-gray-100 hover:text-gray-900 transition-colors"
          aria-label="Próximo dia"
        >
          <ChevronRight className="w-5 h-5" />
        </button>
      </div>

      {!isToday && (
        <button
          type="button"
          onClick={() => setSelectedDateKey(todayKey)}
          className="text-sm font-medium text-brand-orange hover:underline -mt-2"
        >
          Voltar para hoje
        </button>
      )}

      {toast && (
        <div
          role="alert"
          className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950 flex items-start gap-2"
        >
          <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
          <span>{toast}</span>
        </div>
      )}

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </div>
      )}

      {activeSession && (
        <div className="rounded-xl border-2 border-green-300 bg-green-50 px-4 py-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-green-900">
            <span className="w-2.5 h-2.5 rounded-full bg-green-500 animate-pulse" />
            <span className="text-sm font-medium">
              Em chamada: <strong>{activeSession.studentLabel}</strong> ·{' '}
              {formatLessonDateShortInTZ(activeSession.startAt)} às{' '}
              {formatTimeInTZ(activeSession.startAt)}
            </span>
          </div>
          <button
            type="button"
            onClick={() => void handleLeave(activeSession.lessonId)}
            disabled={actionLessonId === activeSession.lessonId}
            className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-3 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-60"
          >
            <PhoneOff className="w-4 h-4" />
            Encerrar aula
          </button>
        </div>
      )}

      <ConfirmDialog />

      {lessons.length === 0 ? (
        <div className="rounded-xl border border-gray-200 bg-white p-8 text-center text-gray-600">
          Nenhuma aula neste dia (horário de Brasília).
        </div>
      ) : (
        <ul className="space-y-3">
          {lessons.map((lesson) => {
            const phase = lessonPhase(lesson, now)
            const isActive =
              activeSession?.lessonId === lesson.id ||
              pendingActiveLessonId === lesson.id ||
              (isTracking && trackingLessonId === lesson.id)
            const otherActive =
              (activeSession != null && activeSession.lessonId !== lesson.id) ||
              (pendingActiveLessonId != null && pendingActiveLessonId !== lesson.id)
            const callEnded = lesson.classroom.callEndedByProfessor === true
            const inWindow =
              now >= new Date(lesson.classroom.windowStart).getTime() &&
              now <= new Date(lesson.classroom.windowEnd).getTime()
            const canEnter = inWindow && !otherActive && !isActive && !callEnded
            const minutesUntilOpen =
              phase === 'upcoming'
                ? Math.ceil(
                    (new Date(lesson.classroom.windowStart).getTime() - now) / (60 * 1000)
                  )
                : null

            return (
              <li
                key={lesson.id}
                className={`rounded-xl border bg-white p-4 shadow-sm ${
                  isActive ? 'border-green-400 ring-1 ring-green-200' : 'border-gray-200'
                }`}
              >
                <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:justify-between">
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-gray-900 truncate">{lesson.studentLabel}</p>
                    <p className="text-sm text-gray-600 mt-0.5">
                      {formatTimeInTZ(lesson.startAt)} · {lesson.durationMinutes} min
                    </p>
                    <p className="text-xs mt-1 font-medium">
                      {isActive && (
                        <span className="text-green-700">● Em chamada agora</span>
                      )}
                      {!isActive && callEnded && phase === 'live' && (
                        <span className="text-gray-500">Aula encerrada (não reabre)</span>
                      )}
                      {!isActive && !callEnded && phase === 'live' && (
                        <span className="text-brand-orange">Sala disponível</span>
                      )}
                      {!isActive && phase === 'upcoming' && minutesUntilOpen != null && (
                        <span className="text-gray-500">
                          Abre em {minutesUntilOpen > 0 ? `${minutesUntilOpen} min` : 'breve'}
                        </span>
                      )}
                      {phase === 'ended' && (
                        <span className="text-gray-500">Aula encerrada</span>
                      )}
                      {otherActive && phase === 'live' && (
                        <span className="text-amber-700 block mt-0.5">
                          Encerre a outra chamada para entrar
                        </span>
                      )}
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    {isActive ? (
                      <button
                        type="button"
                        onClick={() => void handleLeave(lesson.id)}
                        disabled={actionLessonId === lesson.id}
                        className="inline-flex items-center gap-2 rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm font-semibold text-red-800 hover:bg-red-100 disabled:opacity-60"
                      >
                        <PhoneOff className="w-4 h-4" />
                        Encerrar aula
                      </button>
                    ) : canEnter ? (
                      <button
                        type="button"
                        onClick={() => void handleJoin(lesson)}
                        disabled={actionLessonId === lesson.id}
                        className="inline-flex items-center gap-2 rounded-lg bg-brand-orange px-3 py-2 text-sm font-semibold text-white hover:bg-brand-orange-dark disabled:opacity-60"
                      >
                        <Video className="w-4 h-4" />
                        Entrar na chamada
                      </button>
                    ) : phase === 'ended' ? (
                      <span className="inline-flex items-center gap-1 text-sm text-gray-500 px-2">
                        <VideoOff className="w-4 h-4" />
                        Encerrada
                      </span>
                    ) : null}

                    <Link
                      href={`/dashboard-professores/aula/${lesson.id}`}
                      className="inline-flex items-center gap-1 text-sm font-medium text-gray-600 hover:text-brand-orange px-2 py-2"
                    >
                      Detalhes
                      <ChevronRight className="w-4 h-4" />
                    </Link>
                  </div>
                </div>
              </li>
            )
          })}
        </ul>
      )}

      <Link href="/dashboard-professores/calendario">
        <Button variant="outline">Ver calendário completo</Button>
      </Link>
    </div>
  )
}
