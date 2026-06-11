/**
 * Serviço compartilhado de presença em aula (lesson_attendance).
 */

import { prisma } from '@/lib/prisma'
import { LessonAttendanceRole, LessonAttendanceStatus } from '@prisma/client'

export type TeacherIdentity = { role: 'TEACHER'; teacherId: string }
export type StudentIdentity = { role: 'STUDENT'; enrollmentIds: string[] }
export type Identity = TeacherIdentity | StudentIdentity

/** Janela máxima sem heartbeat antes de considerar que saiu (ms) */
export const STALE_MS = 90 * 1000 // 90s (heartbeat a cada 30s, tolera 3 perdidos)

/** Minutos após o fim da aula em que a sala ainda aceita entrada/saída rastreada */
export const LESSON_ATTENDANCE_TOLERANCE_MINUTES = 15

export function lessonAttendanceWindowEndAt(startAt: Date, durationMinutes: number): Date {
  const durationMin = durationMinutes ?? 60
  const lessonEnd = new Date(startAt.getTime() + durationMin * 60 * 1000)
  return new Date(lessonEnd.getTime() + LESSON_ATTENDANCE_TOLERANCE_MINUTES * 60 * 1000)
}

type ServiceFail = { ok: false; message: string; status: 400 | 403 | 404 }
type JoinOk = { ok: true; attendanceId: string; reused: boolean }
type SimpleOk = { ok: true }

function isWithinJoinWindow(lesson: {
  startAt: Date
  durationMinutes: number
  status: string
}): { allowed: boolean; message?: string } {
  if (lesson.status !== 'CONFIRMED') {
    return { allowed: false, message: 'Aula não está confirmada' }
  }
  const now = new Date()
  const lessonStart = new Date(lesson.startAt)
  const durationMin = lesson.durationMinutes ?? 60
  const lessonEnd = new Date(lessonStart.getTime() + durationMin * 60 * 1000)
  const windowStart = new Date(lessonStart.getTime() - LESSON_ATTENDANCE_TOLERANCE_MINUTES * 60 * 1000)
  const windowEnd = lessonAttendanceWindowEndAt(lessonStart, durationMin)
  if (now < windowStart) {
    return { allowed: false, message: 'A sala abre 15 minutos antes do início da aula' }
  }
  if (now > windowEnd) {
    return { allowed: false, message: 'O tempo de acesso à sala expirou' }
  }
  return { allowed: true }
}

function assertAttendanceOwnership(
  att: { teacherId: string | null; enrollmentId: string | null },
  identity: Identity
): boolean {
  if (identity.role === 'TEACHER') {
    return att.teacherId === identity.teacherId
  }
  return att.enrollmentId != null && identity.enrollmentIds.includes(att.enrollmentId)
}

export async function registerJoin(
  lessonId: string,
  identity: Identity
): Promise<ServiceFail | JoinOk> {
  const lesson = await prisma.lesson.findUnique({
    where: { id: lessonId },
    select: {
      id: true,
      teacherId: true,
      enrollmentId: true,
      startAt: true,
      durationMinutes: true,
      status: true,
    },
  })
  if (!lesson) {
    return { ok: false, message: 'Aula não encontrada', status: 404 }
  }

  if (identity.role === 'TEACHER') {
    if (!lesson.teacherId || lesson.teacherId !== identity.teacherId) {
      return {
        ok: false,
        message: 'Você não tem permissão para acessar esta aula',
        status: 403,
      }
    }
  } else if (!identity.enrollmentIds.includes(lesson.enrollmentId)) {
    return {
      ok: false,
      message: 'Você não tem permissão para acessar esta aula',
      status: 403,
    }
  }

  const window = isWithinJoinWindow(lesson)
  if (!window.allowed) {
    return { ok: false, message: window.message ?? 'Fora do horário da aula', status: 403 }
  }

  const now = new Date()
  const where =
    identity.role === 'TEACHER'
      ? {
          lessonId,
          teacherId: identity.teacherId,
          status: LessonAttendanceStatus.ACTIVE,
        }
      : {
          lessonId,
          enrollmentId: lesson.enrollmentId,
          status: LessonAttendanceStatus.ACTIVE,
        }

  const existing = await prisma.lessonAttendance.findFirst({ where })
  if (existing) {
    const updated = await prisma.lessonAttendance.update({
      where: { id: existing.id },
      data: { lastSeen: now },
    })
    return { ok: true, attendanceId: updated.id, reused: true }
  }

  const created = await prisma.lessonAttendance.create({
    data: {
      lessonId,
      role:
        identity.role === 'TEACHER'
          ? LessonAttendanceRole.TEACHER
          : LessonAttendanceRole.STUDENT,
      teacherId: identity.role === 'TEACHER' ? identity.teacherId : null,
      enrollmentId: identity.role === 'STUDENT' ? lesson.enrollmentId : null,
      joinedAt: now,
      lastSeen: now,
      status: LessonAttendanceStatus.ACTIVE,
    },
  })
  return { ok: true, attendanceId: created.id, reused: false }
}

export async function registerHeartbeat(
  attendanceId: string,
  identity: Identity
): Promise<ServiceFail | SimpleOk> {
  const att = await prisma.lessonAttendance.findUnique({ where: { id: attendanceId } })
  if (!att) {
    return { ok: false, message: 'Sessão de presença não encontrada', status: 404 }
  }
  if (!assertAttendanceOwnership(att, identity)) {
    return { ok: false, message: 'Não autorizado', status: 403 }
  }
  if (att.status === LessonAttendanceStatus.ENDED) {
    return { ok: false, message: 'Sessão de presença já encerrada', status: 400 }
  }

  await prisma.lessonAttendance.update({
    where: { id: attendanceId },
    data: { lastSeen: new Date() },
  })
  return { ok: true }
}

export async function registerLeave(
  attendanceId: string,
  identity: Identity
): Promise<ServiceFail | SimpleOk> {
  const att = await prisma.lessonAttendance.findUnique({ where: { id: attendanceId } })
  if (!att) {
    return { ok: false, message: 'Sessão de presença não encontrada', status: 404 }
  }
  if (!assertAttendanceOwnership(att, identity)) {
    return { ok: false, message: 'Não autorizado', status: 403 }
  }
  if (att.status === LessonAttendanceStatus.ENDED) {
    return { ok: false, message: 'Sessão de presença já encerrada', status: 400 }
  }

  const now = new Date()
  await prisma.lessonAttendance.update({
    where: { id: attendanceId },
    data: { leftAt: now, lastSeen: now, status: LessonAttendanceStatus.ENDED },
  })
  return { ok: true }
}

/**
 * Encerra sessões ACTIVE quando a janela da aula expirou ou o heartbeat parou (aba fechada sem unload).
 */
export async function closeStaleAndExpiredLessonAttendances(now = new Date()): Promise<{ closed: number }> {
  const active = await prisma.lessonAttendance.findMany({
    where: { status: LessonAttendanceStatus.ACTIVE },
    include: {
      lesson: { select: { startAt: true, durationMinutes: true } },
    },
  })

  let closed = 0

  for (const att of active) {
    const windowEnd = lessonAttendanceWindowEndAt(
      att.lesson.startAt,
      att.lesson.durationMinutes ?? 60
    )
    const pastWindow = now >= windowEnd
    const stale = now.getTime() - att.lastSeen.getTime() > STALE_MS

    if (!pastWindow && !stale) continue

    const leftAt = pastWindow
      ? new Date(Math.max(att.joinedAt.getTime(), windowEnd.getTime()))
      : att.lastSeen

    await prisma.lessonAttendance.update({
      where: { id: att.id },
      data: { leftAt, lastSeen: leftAt, status: LessonAttendanceStatus.ENDED },
    })
    closed++
  }

  return { closed }
}
