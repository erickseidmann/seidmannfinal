import { formatDateKeyPtBR, toDateKeyInTZ, ymdInTZ } from '@/lib/datetime'
import { prisma } from '@/lib/prisma'
import type { LessonAttendanceSummary } from '@/lib/lesson-attendance-summary'
import { summarizeLessonsWithAttendance } from '@/lib/lesson-attendance-summary'

export const LESSON_ATTENDANCE_RETENTION_DAYS = 60

const BRAZIL_TZ = 'America/Sao_Paulo'
const UPCOMING_DELETION_DAYS = 14

/** Soma dias a uma chave AAAA-MM-DD (calendário BR). */
export function addDaysToDateKey(dateKey: string, days: number): string {
  const [y, m, d] = dateKey.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d, 12, 0, 0))
  dt.setUTCDate(dt.getUTCDate() + days)
  return ymdInTZ(dt, BRAZIL_TZ)
}

/** Aulas com data anterior a este limite já saíram da retenção. */
export function lessonAttendanceVisibleSinceDateKey(now = new Date()): string {
  return addDaysToDateKey(ymdInTZ(now, BRAZIL_TZ), -LESSON_ATTENDANCE_RETENTION_DAYS)
}

/** Dia da aula (AAAA-MM-DD) que expira na data de exclusão informada. */
export function lessonDateKeyExpiringOnDeletionDay(deletionDateKey: string): string {
  return addDaysToDateKey(deletionDateKey, -(LESSON_ATTENDANCE_RETENTION_DAYS + 1))
}

export type UpcomingAttendanceDeletion = {
  deletionDateKey: string
  deletionDateLabel: string
  lessonDateKey: string
  lessonDateLabel: string
  sessionCount: number
  lessonCount: number
}

/** Início do dia civil (00:00) em São Paulo, como Date UTC. */
export function brazilDayStartUtc(dateKey: string): Date {
  const [y, m, d] = dateKey.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d, 3, 0, 0))
}

export function isLessonDateKeyWithinRetention(lessonDateKey: string, now = new Date()): boolean {
  return lessonDateKey >= lessonAttendanceVisibleSinceDateKey(now)
}

async function countSessionsForLessonDateKey(
  lessonDateKey: string
): Promise<{ sessionCount: number; lessonCount: number }> {
  const dayStart = brazilDayStartUtc(lessonDateKey)
  const dayEnd = brazilDayStartUtc(addDaysToDateKey(lessonDateKey, 1))

  const lessons = await prisma.lesson.findMany({
    where: { startAt: { gte: dayStart, lt: dayEnd } },
    select: { id: true },
  })
  if (lessons.length === 0) return { sessionCount: 0, lessonCount: 0 }

  const sessionCount = await prisma.lessonAttendance.count({
    where: { lessonId: { in: lessons.map((l) => l.id) } },
  })

  return { sessionCount, lessonCount: lessons.length }
}

export async function getUpcomingLessonAttendanceDeletions(
  now = new Date()
): Promise<UpcomingAttendanceDeletion[]> {
  const todayKey = ymdInTZ(now, BRAZIL_TZ)
  const upcoming: UpcomingAttendanceDeletion[] = []

  for (let offset = 0; offset < UPCOMING_DELETION_DAYS; offset++) {
    const deletionDateKey = addDaysToDateKey(todayKey, offset)
    const lessonDateKey = lessonDateKeyExpiringOnDeletionDay(deletionDateKey)
    const { sessionCount, lessonCount } = await countSessionsForLessonDateKey(lessonDateKey)
    if (sessionCount === 0) continue

    upcoming.push({
      deletionDateKey,
      deletionDateLabel: formatDateKeyPtBR(deletionDateKey),
      lessonDateKey,
      lessonDateLabel: formatDateKeyPtBR(lessonDateKey),
      sessionCount,
      lessonCount,
    })
  }

  return upcoming
}

export async function purgeExpiredLessonAttendance(now = new Date()): Promise<{
  ok: boolean
  deletedSessions: number
  affectedLessons: number
}> {
  const visibleSince = lessonAttendanceVisibleSinceDateKey(now)
  const deleteBefore = brazilDayStartUtc(visibleSince)

  const expiredLessons = await prisma.lesson.findMany({
    where: { startAt: { lt: deleteBefore } },
    select: { id: true },
  })
  if (expiredLessons.length === 0) {
    return { ok: true, deletedSessions: 0, affectedLessons: 0 }
  }

  const lessonIds = expiredLessons.map((l) => l.id)
  const result = await prisma.lessonAttendance.deleteMany({
    where: { lessonId: { in: lessonIds } },
  })

  return {
    ok: true,
    deletedSessions: result.count,
    affectedLessons: lessonIds.length,
  }
}

export async function fetchLessonAttendanceSummariesForLessonDateKey(
  lessonDateKey: string
): Promise<LessonAttendanceSummary[]> {
  const dayStart = brazilDayStartUtc(lessonDateKey)
  const dayEnd = brazilDayStartUtc(addDaysToDateKey(lessonDateKey, 1))

  const lessonsRaw = await prisma.lesson.findMany({
    where: { startAt: { gte: dayStart, lt: dayEnd } },
    orderBy: { startAt: 'asc' },
    select: {
      id: true,
      startAt: true,
      durationMinutes: true,
      status: true,
      enrollment: { select: { nome: true } },
      teacher: { select: { nome: true } },
    },
  })

  const lessonIds = lessonsRaw.map((l) => l.id)
  const attendanceRows =
    lessonIds.length > 0
      ? await prisma.lessonAttendance.findMany({
          where: { lessonId: { in: lessonIds } },
          orderBy: { joinedAt: 'asc' },
          include: {
            teacher: { select: { nome: true } },
            enrollment: { select: { nome: true } },
          },
        })
      : []

  const lessons = lessonsRaw.map((l) => ({
    id: l.id,
    startAt: l.startAt,
    durationMinutes: l.durationMinutes ?? 60,
    status: l.status,
    studentName: l.enrollment?.nome ?? '—',
    teacherName: l.teacher?.nome ?? '—',
  }))

  const mappedRows = attendanceRows.map((r) => {
    const lessonMeta = lessons.find((l) => l.id === r.lessonId)
    const participantName =
      r.role === 'TEACHER'
        ? r.teacher?.nome ?? lessonMeta?.teacherName ?? '—'
        : r.enrollment?.nome ?? lessonMeta?.studentName ?? '—'
    return {
      id: r.id,
      lessonId: r.lessonId,
      role: r.role as 'TEACHER' | 'STUDENT',
      joinedAt: r.joinedAt,
      leftAt: r.leftAt,
      lastSeen: r.lastSeen,
      status: r.status,
      participantName,
    }
  })

  return summarizeLessonsWithAttendance(lessons, mappedRows)
}

export function filterSummariesWithinRetention<T extends { lessonStartAt: string }>(
  summaries: T[],
  now = new Date()
): T[] {
  const visibleSince = lessonAttendanceVisibleSinceDateKey(now)
  return summaries.filter(
    (s) => toDateKeyInTZ(s.lessonStartAt, BRAZIL_TZ) >= visibleSince
  )
}
