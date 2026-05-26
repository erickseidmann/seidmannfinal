/**
 * Consultas Prisma para TeacherPaymentMonth alinhadas à competência BRT.
 */

import { prisma } from '@/lib/prisma'
import {
  periodoTerminoRangeForCompetenceMonthBrt,
  resolveTeacherPaymentUpsertKeys,
} from '@/lib/teacher-paid-period'

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
