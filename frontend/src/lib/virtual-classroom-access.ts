import { isLessonScheduledStatus } from '@/lib/lesson-status'
import { LESSON_ATTENDANCE_TOLERANCE_MINUTES } from '@/lib/lesson-attendance-service'

export function deterministicRoomPin(lessonId: string, lessonStart: Date): string {
  const str = `seidmann-${lessonId}-${lessonStart.toISOString()}`
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i)
    hash = (hash << 5) - hash + char
    hash |= 0
  }
  return String((Math.abs(hash) % 900000) + 100000)
}

export function buildVirtualClassroomAccess(lesson: {
  id: string
  status: string
  startAt: Date
  durationMinutes: number | null
  professorCallEndedAt?: Date | null
}): {
  canJoin: boolean
  roomName: string | null
  roomPin: string | null
  windowStart: string
  windowEnd: string
  reason: string | null
} {
  const now = new Date()
  const lessonStart = new Date(lesson.startAt)
  const durationMin = lesson.durationMinutes ?? 60
  const lessonEnd = new Date(lessonStart.getTime() + durationMin * 60 * 1000)
  const windowStart = new Date(
    lessonStart.getTime() - LESSON_ATTENDANCE_TOLERANCE_MINUTES * 60 * 1000
  )
  const windowEnd = new Date(
    lessonEnd.getTime() + LESSON_ATTENDANCE_TOLERANCE_MINUTES * 60 * 1000
  )

  const callEnded = lesson.professorCallEndedAt != null
  const canJoin =
    !callEnded &&
    now >= windowStart &&
    now <= windowEnd &&
    isLessonScheduledStatus(lesson.status)

  let reason: string | null = null
  if (!canJoin) {
    if (callEnded) {
      reason = 'Esta aula foi encerrada e não pode ser reaberta'
    } else if (!isLessonScheduledStatus(lesson.status)) {
      reason = 'Aula não está confirmada'
    } else if (now < windowStart) {
      reason = 'A sala abre 15 minutos antes do início da aula'
    } else if (now > windowEnd) {
      reason = 'O tempo de acesso à sala expirou'
    }
  }

  return {
    canJoin,
    roomName: canJoin ? `seidmann-${lesson.id}` : null,
    roomPin: canJoin ? deterministicRoomPin(lesson.id, lessonStart) : null,
    windowStart: windowStart.toISOString(),
    windowEnd: windowEnd.toISOString(),
    reason,
  }
}
