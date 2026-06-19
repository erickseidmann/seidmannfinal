/**
 * Serviço compartilhado de presença em aula (lesson_attendance).
 */

import { prisma } from '@/lib/prisma'
import { isLessonScheduledStatus, LESSON_STATUSES_SCHEDULED } from '@/lib/lesson-status'
import { resolveStudentEnrollmentForLesson } from '@/lib/student-group-lesson-access'
import { LessonAttendanceRole, LessonAttendanceStatus } from '@prisma/client'

export type TeacherIdentity = { role: 'TEACHER'; teacherId: string }
export type StudentIdentity = { role: 'STUDENT'; enrollmentIds: string[] }
export type Identity = TeacherIdentity | StudentIdentity

/** Janela máxima sem heartbeat antes de considerar que saiu (ms) */
export const STALE_MS = 5 * 60 * 1000 // 5 min (aba em background pode atrasar heartbeat)

/** Crédito mínimo de presença quando houve join registrado mas sessão encerrou sem heartbeat. */
export const MIN_JOIN_PRESENCE_SECONDS = 60

/** Minutos após o fim da aula em que a sala ainda aceita entrada/saída rastreada */
export const LESSON_ATTENDANCE_TOLERANCE_MINUTES = 15
export const STUDENT_WAITING_FOR_TEACHER_MESSAGE =
  'Seu professor ainda não encerrou a aula anterior. Assim que terminar, você poderá entrar.'

export function lessonAttendanceWindowEndAt(startAt: Date, durationMinutes: number): Date {
  const durationMin = durationMinutes ?? 60
  const lessonEnd = new Date(startAt.getTime() + durationMin * 60 * 1000)
  return new Date(lessonEnd.getTime() + LESSON_ATTENDANCE_TOLERANCE_MINUTES * 60 * 1000)
}

export type BlockingActiveSession = {
  attendanceId: string
  lessonId: string
  studentLabel: string
  startAt: string
}

type ServiceFail = {
  ok: false
  message: string
  status: 400 | 403 | 404
  code?: 'OTHER_ACTIVE_LESSON'
  blockingSession?: BlockingActiveSession
}
type JoinOk = { ok: true; attendanceId: string; reused: boolean }
type SimpleOk = { ok: true }
type LeaveOk = { ok: true; nextLesson: { id: string; startAt: string } | null }

function isWithinJoinWindow(lesson: {
  startAt: Date
  durationMinutes: number
  status: string
}): { allowed: boolean; message?: string } {
  if (!isLessonScheduledStatus(lesson.status)) {
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
      professorCallEndedAt: true,
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
  }

  let studentEnrollmentId: string | null = null
  if (identity.role === 'STUDENT') {
    studentEnrollmentId = await resolveStudentEnrollmentForLesson(
      identity.enrollmentIds,
      lesson.enrollmentId
    )
    if (!studentEnrollmentId) {
      return {
        ok: false,
        message: 'Você não tem permissão para acessar esta aula',
        status: 403,
      }
    }
  }

  if (lesson.professorCallEndedAt) {
    return {
      ok: false,
      message: 'Esta aula foi encerrada e não pode ser reaberta',
      status: 403,
    }
  }

  const window = isWithinJoinWindow(lesson)
  if (!window.allowed) {
    return { ok: false, message: window.message ?? 'Fora do horário da aula', status: 403 }
  }

  const now = new Date()

  if (identity.role === 'TEACHER') {
    const otherActive = await prisma.lessonAttendance.findFirst({
      where: {
        teacherId: identity.teacherId,
        status: LessonAttendanceStatus.ACTIVE,
        lessonId: { not: lessonId },
      },
      select: {
        id: true,
        lessonId: true,
        lesson: {
          select: {
            startAt: true,
            enrollment: {
              select: { nome: true, tipoAula: true, nomeGrupo: true },
            },
          },
        },
      },
    })
    if (otherActive) {
      const enr = otherActive.lesson.enrollment
      const studentLabel =
        enr.tipoAula === 'GRUPO' && enr.nomeGrupo?.trim()
          ? enr.nomeGrupo.trim()
          : enr.nome || '—'
      return {
        ok: false,
        message: 'Encerre a chamada da outra aula antes de entrar nesta.',
        status: 400,
        code: 'OTHER_ACTIVE_LESSON',
        blockingSession: {
          attendanceId: otherActive.id,
          lessonId: otherActive.lessonId,
          studentLabel,
          startAt: otherActive.lesson.startAt.toISOString(),
        },
      }
    }
  } else if (lesson.teacherId) {
    const teacherBusyElsewhere = await prisma.lessonAttendance.findFirst({
      where: {
        teacherId: lesson.teacherId,
        status: LessonAttendanceStatus.ACTIVE,
        lessonId: { not: lessonId },
      },
      select: { lessonId: true },
    })
    if (teacherBusyElsewhere) {
      return {
        ok: false,
        message: STUDENT_WAITING_FOR_TEACHER_MESSAGE,
        status: 403,
      }
    }
  }

  const where =
    identity.role === 'TEACHER'
      ? {
          lessonId,
          teacherId: identity.teacherId,
          status: LessonAttendanceStatus.ACTIVE,
        }
      : {
          lessonId,
          enrollmentId: studentEnrollmentId!,
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
      enrollmentId: identity.role === 'STUDENT' ? studentEnrollmentId : null,
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

async function findNextLessonForTeacher(
  teacherId: string,
  afterStartAt: Date
): Promise<{ id: string; startAt: string } | null> {
  const row = await prisma.lesson.findFirst({
    where: {
      teacherId,
      startAt: { gt: afterStartAt },
      status: { in: [...LESSON_STATUSES_SCHEDULED] },
      professorCallEndedAt: null,
    },
    orderBy: { startAt: 'asc' },
    select: { id: true, startAt: true },
  })
  return row ? { id: row.id, startAt: row.startAt.toISOString() } : null
}

export async function registerLeave(
  attendanceId: string,
  identity: Identity,
  options?: { finalizeCall?: boolean }
): Promise<ServiceFail | SimpleOk | LeaveOk> {
  const att = await prisma.lessonAttendance.findUnique({
    where: { id: attendanceId },
    include: {
      lesson: { select: { id: true, teacherId: true, startAt: true, professorCallEndedAt: true } },
    },
  })
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
  const finalizeCall = options?.finalizeCall === true && identity.role === 'TEACHER'

  await prisma.$transaction(async (tx) => {
    await tx.lessonAttendance.update({
      where: { id: attendanceId },
      data: { leftAt: now, lastSeen: now, status: LessonAttendanceStatus.ENDED },
    })

    if (finalizeCall && !att.lesson.professorCallEndedAt) {
      await tx.lesson.update({
        where: { id: att.lessonId },
        data: { professorCallEndedAt: now },
      })
      await tx.lessonAttendance.updateMany({
        where: {
          lessonId: att.lessonId,
          status: LessonAttendanceStatus.ACTIVE,
          id: { not: attendanceId },
        },
        data: { leftAt: now, lastSeen: now, status: LessonAttendanceStatus.ENDED },
      })
    }
  })

  if (identity.role === 'TEACHER' && att.lesson.teacherId) {
    const nextLesson = await findNextLessonForTeacher(att.lesson.teacherId, att.lesson.startAt)
    return { ok: true, nextLesson }
  }

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
