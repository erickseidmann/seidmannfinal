/**
 * Aulas já encerradas (horário de término no passado) sem LessonRecord,
 * com professor designado e matrícula em status “em curso”.
 * Não inclui aulas cujo início cai em período já pago ao professor (TeacherPaymentMonth PAGO + datas).
 * Usado no dashboard admin (cubo + lista “registros atrasados”).
 */
import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { isLessonStartInTeacherPaidPeriod } from '@/lib/teacher-paid-period'

/** Só considera aulas agendadas nos últimos N dias (evita lixo antigo) */
export const PENDING_RECORD_LOOKBACK_DAYS = 60

const ENROLLMENT_STATUSES_OK: Prisma.EnrollmentWhereInput['status'] = {
  in: ['ACTIVE', 'REGISTERED', 'CONTRACT_ACCEPTED', 'PAYMENT_PENDING'],
}

export function lessonEndTime(startAt: Date, durationMinutes: number | null): number {
  const dur = durationMinutes ?? 60
  return startAt.getTime() + dur * 60 * 1000
}

/** Retorna aulas que já terminaram, sem registro, elegíveis para o alerta. */
export async function findLessonsPendingRecord(now: Date = new Date()) {
  const cutoff = new Date(now.getTime() - PENDING_RECORD_LOOKBACK_DAYS * 24 * 60 * 60 * 1000)

  const rows = await prisma.lesson.findMany({
    where: {
      teacherId: { not: null },
      status: { in: ['CONFIRMED', 'REPOSICAO'] },
      record: null,
      startAt: { lte: now, gte: cutoff },
      enrollment: { status: ENROLLMENT_STATUSES_OK },
    },
    select: {
      id: true,
      startAt: true,
      durationMinutes: true,
      teacherId: true,
      teacher: { select: { id: true, nome: true } },
    },
  })

  const endedNoRecord = rows.filter(
    (l) => lessonEndTime(l.startAt, l.durationMinutes) <= now.getTime()
  )

  const teacherIds = [
    ...new Set(endedNoRecord.map((l) => l.teacherId).filter((id): id is string => !!id)),
  ]
  if (teacherIds.length === 0) return []

  const paidMonths = await prisma.teacherPaymentMonth.findMany({
    where: {
      teacherId: { in: teacherIds },
      paymentStatus: 'PAGO',
      periodoInicio: { not: null },
      periodoTermino: { not: null },
    },
    select: { teacherId: true, periodoInicio: true, periodoTermino: true },
  })

  const paidByTeacher = new Map<string, { periodoInicio: Date; periodoTermino: Date }[]>()
  for (const pm of paidMonths) {
    if (!pm.periodoInicio || !pm.periodoTermino) continue
    const list = paidByTeacher.get(pm.teacherId) ?? []
    list.push({ periodoInicio: pm.periodoInicio, periodoTermino: pm.periodoTermino })
    paidByTeacher.set(pm.teacherId, list)
  }

  return endedNoRecord.filter((l) => {
    const tid = l.teacherId
    if (!tid) return true
    const periods = paidByTeacher.get(tid) ?? []
    return !isLessonStartInTeacherPaidPeriod(l.startAt, periods)
  })
}

export type PendingRecordLessonRow = Awaited<ReturnType<typeof findLessonsPendingRecord>>[number]
