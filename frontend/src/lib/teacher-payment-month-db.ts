/**
 * Consultas Prisma para TeacherPaymentMonth alinhadas à competência BRT.
 */

import { prisma } from '@/lib/prisma'
import {
  periodoTerminoRangeForCompetenceMonthBrt,
  resolveTeacherPaymentUpsertKeys,
  teacherPaymentBoundsForCompetenceMonth,
  teacherPaymentCompetenceKeyFromPeriodoTermino,
} from '@/lib/teacher-paid-period'

/** Registro de pagamento exibido na tela admin do mês visualizado e dia de vencimento. */
export async function findTeacherPaymentMonthForAdminView(
  teacherId: string,
  viewedYear: number,
  viewedMonth: number,
  paymentDueDay: number
) {
  const bounds = teacherPaymentBoundsForCompetenceMonth(viewedYear, viewedMonth, paymentDueDay)
  const exact = await prisma.teacherPaymentMonth.findFirst({
    where: {
      teacherId,
      periodoInicio: bounds.inicio,
      periodoTermino: bounds.termino,
    },
    orderBy: { periodoTermino: 'desc' },
  })
  if (exact) return exact

  const competence = teacherPaymentCompetenceKeyFromPeriodoTermino(bounds.termino)
  return findTeacherPaymentMonthByCompetenceBrt(
    teacherId,
    competence.year,
    competence.month
  )
}

/** Registro cujo `periodoTermino` corresponde ao mês de competência BRT. */
export async function findTeacherPaymentMonthByCompetenceBrt(
  teacherId: string,
  competenceYear: number,
  competenceMonth: number
) {
  const range = periodoTerminoRangeForCompetenceMonthBrt(competenceYear, competenceMonth)
  return prisma.teacherPaymentMonth.findFirst({
    where: {
      teacherId,
      periodoTermino: { gt: range.gt, lte: range.lte },
    },
    orderBy: { periodoTermino: 'desc' },
  })
}

/** Chaves para upsert: deriva de `periodoTermino` quando disponível. */
export function upsertKeysForCompetenceMonth(
  competenceYear: number,
  competenceMonth: number,
  existing: { periodoTermino: Date | null } | null,
  periodoTerminoOverride?: Date | null
): { year: number; month: number } {
  const termino = periodoTerminoOverride ?? existing?.periodoTermino ?? null
  return resolveTeacherPaymentUpsertKeys({
    competenceYear,
    competenceMonth,
    periodoTermino: termino,
  })
}
