/**
 * Aulas já encerradas (horário de término no passado) sem LessonRecord,
 * com professor designado e matrícula em status “em curso”.
 * Só entram aulas cujo início cai em período de pagamento **em aberto** ao professor
 * (TeacherPaymentMonth com periodoInicio/Termino e status ≠ PAGO).
 * Usado no dashboard admin (cubo + lista “registros atrasados”).
 */
import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { isLessonStartWithinTeacherPeriodRanges } from '@/lib/teacher-paid-period'

/** Só considera aulas agendadas nos últimos N dias (evita lixo antigo) */
export const PENDING_RECORD_LOOKBACK_DAYS = 60

const ENROLLMENT_STATUSES_OK: Prisma.EnrollmentWhereInput['status'] = {
  in: ['ACTIVE', 'REGISTERED', 'CONTRACT_ACCEPTED', 'PAYMENT_PENDING'],
}

export function lessonEndTime(startAt: Date, durationMinutes: number | null): number {
  const dur = durationMinutes ?? 60
  return startAt.getTime() + dur * 60 * 1000
}

export type FindLessonsPendingRecordOptions = {
  /** Se informado, só aulas deste professor */
  teacherId?: string
}

/** Retorna aulas que já terminaram, sem registro, elegíveis para o alerta. */
export async function findLessonsPendingRecord(
  now: Date = new Date(),
  options?: FindLessonsPendingRecordOptions
) {
  const cutoff = new Date(now.getTime() - PENDING_RECORD_LOOKBACK_DAYS * 24 * 60 * 60 * 1000)
  const tid = options?.teacherId

  const rows = await prisma.lesson.findMany({
    where: {
      ...(tid ? { teacherId: tid } : { teacherId: { not: null } }),
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
      enrollmentId: true,
      teacher: { select: { id: true, nome: true } },
      enrollment: { select: { id: true, nome: true } },
    },
  })

  const endedNoRecord = rows.filter(
    (l) => lessonEndTime(l.startAt, l.durationMinutes) <= now.getTime()
  )

  const teacherIds = tid
    ? [tid]
    : [...new Set(endedNoRecord.map((l) => l.teacherId).filter((id): id is string => !!id))]
  if (teacherIds.length === 0) return []

  /** Períodos ainda em aberto (não PAGO), com datas explícitas — só esses geram alerta de registro */
  const openMonths = await prisma.teacherPaymentMonth.findMany({
    where: {
      teacherId: { in: teacherIds },
      periodoInicio: { not: null },
      periodoTermino: { not: null },
      OR: [{ paymentStatus: 'EM_ABERTO' }, { paymentStatus: null }],
    },
    select: { teacherId: true, periodoInicio: true, periodoTermino: true },
  })

  const openByTeacher = new Map<string, { periodoInicio: Date; periodoTermino: Date }[]>()
  for (const pm of openMonths) {
    if (!pm.periodoInicio || !pm.periodoTermino) continue
    const list = openByTeacher.get(pm.teacherId) ?? []
    list.push({ periodoInicio: pm.periodoInicio, periodoTermino: pm.periodoTermino })
    openByTeacher.set(pm.teacherId, list)
  }

  return endedNoRecord.filter((l) => {
    const tid = l.teacherId
    if (!tid) return false
    const periods = openByTeacher.get(tid) ?? []
    if (periods.length === 0) return false
    return isLessonStartWithinTeacherPeriodRanges(l.startAt, periods)
  })
}

export type PendingRecordLessonRow = Awaited<ReturnType<typeof findLessonsPendingRecord>>[number]
