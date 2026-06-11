import { prisma } from '@/lib/prisma'
import { lessonAttendanceWindowEndAt } from '@/lib/lesson-attendance-service'

/** Presença em chamada passou a ser rastreada a partir desta data (migration lesson_attendance). */
// Rastreamento de presença/ausência vale a partir de 11/06/2026 (meia-noite BRT = 03:00 UTC).
// Antes disso os professores não tinham link do Meet, então não há "entrada na chamada" a cobrar.
export const LESSON_ATTENDANCE_TRACKING_SINCE = new Date('2026-06-11T03:00:00.000Z')

/** Minutos após o início da aula para marcar ausência do professor (monitoramento / dashboard). */
export const TEACHER_ABSENCE_GRACE_MINUTES = 5

export const TEACHER_ATTENDANCE_REQUIRED_MESSAGE =
  'Você não entrou na videochamada desta aula. Só é possível registrar aulas em que você participou da chamada.'

export function attendanceSessionDurationSeconds(
  joinedAt: Date,
  leftAt: Date | null,
  lastSeen: Date,
  status: string,
  now = new Date(),
  windowEndAt?: Date
): number {
  let endMs = leftAt?.getTime() ?? (status === 'ACTIVE' ? now.getTime() : lastSeen.getTime())
  if (windowEndAt) {
    endMs = Math.min(endMs, windowEndAt.getTime())
  }
  return Math.max(0, Math.floor((endMs - joinedAt.getTime()) / 1000))
}

export type AttendanceSessionRow = {
  id: string
  lessonId: string
  role: 'TEACHER' | 'STUDENT'
  participantName: string
  joinedAt: string
  leftAt: string | null
  lastSeen: string
  status: 'ACTIVE' | 'ENDED'
  durationSeconds: number
}

export type LessonAttendanceSummary = {
  lessonId: string
  lessonStartAt: string
  durationMinutes: number
  studentName: string
  teacherName: string
  lessonStatus: string
  teacherJoinedAt: string | null
  studentJoinedAt: string | null
  teacherTimeSeconds: number
  studentTimeSeconds: number
  scheduledSeconds: number
  teacherMetScheduledTime: boolean
  callStatus: 'ACTIVE' | 'ENDED'
  teacherAbsent: boolean
  sessions: AttendanceSessionRow[]
}

function lessonEndAt(startAt: Date, durationMinutes: number): Date {
  return new Date(startAt.getTime() + (durationMinutes ?? 60) * 60 * 1000)
}

export function isLessonAttendanceTrackingRequired(
  lessonStartAt: Date,
  hasAnyAttendanceRow: boolean
): boolean {
  return lessonStartAt >= LESSON_ATTENDANCE_TRACKING_SINCE || hasAnyAttendanceRow
}

export function isTeacherAbsentFromLesson(params: {
  lessonStartAt: Date
  durationMinutes: number
  teacherTimeSeconds: number
  hasAnyAttendanceRow: boolean
  now?: Date
  /** Admin: ausência visível assim que a aula começa. Registro: só após o fim da aula. */
  mode?: 'monitoring' | 'record-block'
}): boolean {
  const now = params.now ?? new Date()
  if (!isLessonAttendanceTrackingRequired(params.lessonStartAt, params.hasAnyAttendanceRow)) {
    return false
  }
  if (params.teacherTimeSeconds > 0) return false
  const mode = params.mode ?? 'monitoring'
  const graceMs = TEACHER_ABSENCE_GRACE_MINUTES * 60 * 1000
  const threshold =
    mode === 'record-block'
      ? lessonEndAt(params.lessonStartAt, params.durationMinutes)
      : new Date(params.lessonStartAt.getTime() + graceMs)
  return now >= threshold
}

export type LessonAttendanceLessonMeta = {
  id: string
  startAt: Date
  durationMinutes: number
  status: string
  studentName: string
  teacherName: string
}

export function summarizeLessonAttendance(
  lesson: LessonAttendanceLessonMeta,
  lessonRows: Array<{
    id: string
    lessonId: string
    role: 'TEACHER' | 'STUDENT'
    joinedAt: Date
    leftAt: Date | null
    lastSeen: Date
    status: string
    participantName: string
  }>,
  now = new Date()
): LessonAttendanceSummary {
  const scheduledSeconds = (lesson.durationMinutes ?? 60) * 60
  const windowEnd = lessonAttendanceWindowEndAt(lesson.startAt, lesson.durationMinutes)
  const pastWindow = now >= windowEnd

  const sessions: AttendanceSessionRow[] = lessonRows
    .map((r) => {
      const dbStatus = r.status as 'ACTIVE' | 'ENDED'
      const effectiveEnded = dbStatus === 'ENDED' || pastWindow
      const effectiveLeftAt =
        r.leftAt?.toISOString() ??
        (effectiveEnded ? new Date(Math.max(r.joinedAt.getTime(), windowEnd.getTime())).toISOString() : null)
      return {
        id: r.id,
        lessonId: r.lessonId,
        role: r.role,
        participantName: r.participantName,
        joinedAt: r.joinedAt.toISOString(),
        leftAt: effectiveLeftAt,
        lastSeen: r.lastSeen.toISOString(),
        status: (effectiveEnded ? 'ENDED' : 'ACTIVE') as 'ACTIVE' | 'ENDED',
        durationSeconds: attendanceSessionDurationSeconds(
          r.joinedAt,
          r.leftAt,
          r.lastSeen,
          r.status,
          now,
          windowEnd
        ),
      }
    })
    .sort((a, b) => new Date(a.joinedAt).getTime() - new Date(b.joinedAt).getTime())

  const teacherSessions = sessions.filter((s) => s.role === 'TEACHER')
  const studentSessions = sessions.filter((s) => s.role === 'STUDENT')

  const teacherTimeSeconds = teacherSessions.reduce((sum, s) => sum + s.durationSeconds, 0)
  const studentTimeSeconds = studentSessions.reduce((sum, s) => sum + s.durationSeconds, 0)

  const teacherJoinedAt =
    teacherSessions.length > 0
      ? teacherSessions.reduce(
          (min, s) => (new Date(s.joinedAt) < new Date(min) ? s.joinedAt : min),
          teacherSessions[0].joinedAt
        )
      : null

  const studentJoinedAt =
    studentSessions.length > 0
      ? studentSessions.reduce(
          (min, s) => (new Date(s.joinedAt) < new Date(min) ? s.joinedAt : min),
          studentSessions[0].joinedAt
        )
      : null

  const callStatus: 'ACTIVE' | 'ENDED' = sessions.some((s) => s.status === 'ACTIVE')
    ? 'ACTIVE'
    : 'ENDED'

  const teacherAbsent = isTeacherAbsentFromLesson({
    lessonStartAt: lesson.startAt,
    durationMinutes: lesson.durationMinutes,
    teacherTimeSeconds,
    hasAnyAttendanceRow: sessions.length > 0,
    now,
  })

  return {
    lessonId: lesson.id,
    lessonStartAt: lesson.startAt.toISOString(),
    durationMinutes: lesson.durationMinutes,
    studentName: lesson.studentName,
    teacherName: lesson.teacherName,
    lessonStatus: lesson.status,
    teacherJoinedAt,
    studentJoinedAt,
    teacherTimeSeconds,
    studentTimeSeconds,
    scheduledSeconds,
    teacherMetScheduledTime: teacherTimeSeconds >= scheduledSeconds,
    callStatus,
    teacherAbsent,
    sessions,
  }
}

export function summarizeLessonsWithAttendance(
  lessons: LessonAttendanceLessonMeta[],
  rows: Array<{
    id: string
    lessonId: string
    role: 'TEACHER' | 'STUDENT'
    joinedAt: Date
    leftAt: Date | null
    lastSeen: Date
    status: string
    participantName: string
  }>,
  now = new Date()
): LessonAttendanceSummary[] {
  const byLesson = new Map<string, typeof rows>()
  for (const row of rows) {
    const list = byLesson.get(row.lessonId) ?? []
    list.push(row)
    byLesson.set(row.lessonId, list)
  }

  return lessons
    .map((lesson) => summarizeLessonAttendance(lesson, byLesson.get(lesson.id) ?? [], now))
    .sort((a, b) => new Date(b.lessonStartAt).getTime() - new Date(a.lessonStartAt).getTime())
}

export function aggregateAttendanceSessions(
  rows: Array<{
    id: string
    lessonId: string
    role: 'TEACHER' | 'STUDENT'
    joinedAt: Date
    leftAt: Date | null
    lastSeen: Date
    status: string
    participantName: string
    lesson: {
      id: string
      startAt: Date
      durationMinutes: number
      status: string
      studentName: string
      teacherName: string
    }
  }>,
  now = new Date()
): LessonAttendanceSummary[] {
  const byLesson = new Map<string, typeof rows>()
  for (const row of rows) {
    const list = byLesson.get(row.lessonId) ?? []
    list.push(row)
    byLesson.set(row.lessonId, list)
  }

  const lessons: LessonAttendanceLessonMeta[] = []
  for (const [, lessonRows] of byLesson) {
    const first = lessonRows[0]
    lessons.push(first.lesson)
  }

  const flatRows = rows.map((r) => ({
    id: r.id,
    lessonId: r.lessonId,
    role: r.role,
    joinedAt: r.joinedAt,
    leftAt: r.leftAt,
    lastSeen: r.lastSeen,
    status: r.status,
    participantName: r.participantName,
  }))

  return summarizeLessonsWithAttendance(lessons, flatRows, now)
}

export function teacherAbsentFlagsByLessonId(
  lessons: Array<{ id: string; startAt: Date; durationMinutes: number }>,
  rows: Array<{
    lessonId: string
    role: string
    joinedAt: Date
    leftAt: Date | null
    lastSeen: Date
    status: string
  }>,
  now = new Date(),
  mode: 'monitoring' | 'record-block' = 'record-block'
): Map<string, boolean> {
  const byLesson = new Map<string, typeof rows>()
  for (const row of rows) {
    const list = byLesson.get(row.lessonId) ?? []
    list.push(row)
    byLesson.set(row.lessonId, list)
  }

  const flags = new Map<string, boolean>()
  for (const lesson of lessons) {
    const lessonRows = byLesson.get(lesson.id) ?? []
    const windowEnd = lessonAttendanceWindowEndAt(lesson.startAt, lesson.durationMinutes)
    const teacherTimeSeconds = lessonRows
      .filter((r) => r.role === 'TEACHER')
      .reduce(
        (sum, r) =>
          sum +
          attendanceSessionDurationSeconds(
            r.joinedAt,
            r.leftAt,
            r.lastSeen,
            r.status,
            now,
            windowEnd
          ),
        0
      )
    flags.set(
      lesson.id,
      isTeacherAbsentFromLesson({
        lessonStartAt: lesson.startAt,
        durationMinutes: lesson.durationMinutes,
        teacherTimeSeconds,
        hasAnyAttendanceRow: lessonRows.length > 0,
        now,
        mode,
      })
    )
  }
  return flags
}

export async function assertTeacherAttendedLessonForRecord(
  lessonId: string,
  lessonStartAt: Date,
  durationMinutes: number,
  teacherId?: string
): Promise<{ ok: true } | { ok: false; message: string }> {
  if (teacherId) {
    const unlock = await prisma.lessonRecordUnlockRequest.findFirst({
      where: { lessonId, teacherId, status: 'APPROVED' },
      select: { id: true },
    })
    if (unlock) return { ok: true }
  }

  const rows = await prisma.lessonAttendance.findMany({
    where: { lessonId },
    select: { role: true, joinedAt: true, leftAt: true, lastSeen: true, status: true },
  })

  const hasAny = rows.length > 0
  if (!isLessonAttendanceTrackingRequired(lessonStartAt, hasAny)) {
    return { ok: true }
  }

  const windowEnd = lessonAttendanceWindowEndAt(lessonStartAt, durationMinutes)
  const teacherTimeSeconds = rows
    .filter((r) => r.role === 'TEACHER')
    .reduce(
      (sum, r) =>
        sum +
        attendanceSessionDurationSeconds(
          r.joinedAt,
          r.leftAt,
          r.lastSeen,
          r.status,
          undefined,
          windowEnd
        ),
      0
    )

  if (
    isTeacherAbsentFromLesson({
      lessonStartAt,
      durationMinutes,
      teacherTimeSeconds,
      hasAnyAttendanceRow: hasAny,
      mode: 'record-block',
    })
  ) {
    return { ok: false, message: TEACHER_ATTENDANCE_REQUIRED_MESSAGE }
  }

  return { ok: true }
}
