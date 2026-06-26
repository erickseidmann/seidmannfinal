/**
 * Resolve qual TeacherPaymentMonth contém um instante, usando periodoInicio/periodoTermino
 * no mesmo sentido de teacher-paid-period: [início, término) com término exclusivo.
 */

import { prisma } from '@/lib/prisma'
import { DIAS_TOLERANCIA_NF_APOS_PRAZO } from '@/lib/finance/teacher-nf-window'
import { teacherPaymentCompetenceKeyFromPeriodoTermino } from '@/lib/teacher-paid-period'

export type TeacherPaymentMonthPeriodRow = {
  year: number
  month: number
  periodoInicio: Date | null
  periodoTermino: Date | null
}

/**
 * Escolhe o registro cujo período contém `at` (dentro ou tolerância pós-término).
 * Ciclo fechando (tolerância) tem prioridade sobre ciclo abrindo (dentro do período).
 */
export function pickTeacherPaymentMonthRowContaining(
  rows: TeacherPaymentMonthPeriodRow[],
  at: Date = new Date()
): TeacherPaymentMonthPeriodRow | null {
  const t = at.getTime()
  const toleranceMs = DIAS_TOLERANCIA_NF_APOS_PRAZO * 24 * 60 * 60 * 1000

  const withPeriods = rows.filter((r) => r.periodoInicio != null && r.periodoTermino != null)

  const toleranceMatches = withPeriods.filter((r) => {
    const end = r.periodoTermino!.getTime()
    return end <= t && t < end + toleranceMs
  })
  if (toleranceMatches.length > 0) {
    toleranceMatches.sort((a, b) => b.periodoInicio!.getTime() - a.periodoInicio!.getTime())
    return toleranceMatches[0]
  }

  const insideMatches = withPeriods.filter((r) => {
    const start = r.periodoInicio!.getTime()
    const end = r.periodoTermino!.getTime()
    return start <= t && t < end
  })
  if (insideMatches.length > 0) {
    insideMatches.sort((a, b) => b.periodoInicio!.getTime() - a.periodoInicio!.getTime())
    return insideMatches[0]
  }

  return null
}

function competenceKeyFromPick(
  pick: TeacherPaymentMonthPeriodRow
): { year: number; month: number } {
  if (!pick.periodoTermino) {
    return { year: pick.year, month: pick.month }
  }
  return teacherPaymentCompetenceKeyFromPeriodoTermino(pick.periodoTermino)
}

export async function resolveTeacherPaymentMonthKeyContaining(
  teacherId: string,
  at: Date = new Date()
): Promise<{ year: number; month: number } | null> {
  const rows = await prisma.teacherPaymentMonth.findMany({
    where: {
      teacherId,
      periodoInicio: { not: null },
      periodoTermino: { not: null },
    },
    select: { year: true, month: true, periodoInicio: true, periodoTermino: true },
    orderBy: [{ year: 'desc' }, { month: 'desc' }],
    take: 96,
  })

  const pick = pickTeacherPaymentMonthRowContaining(rows, at)
  if (!pick) return null

  return competenceKeyFromPick(pick)
}

/**
 * Comprovante: em reenvio (AGUARDANDO_REENVIO) mantém o mês escolhido na tela;
 * caso contrário usa o período que contém `at` quando houver datas no cadastro.
 */
export async function resolveTeacherProofTargetMonthKey(
  teacherId: string,
  bodyYear: number,
  bodyMonth: number,
  at: Date = new Date()
): Promise<{ year: number; month: number }> {
  const pmBody = await prisma.teacherPaymentMonth.findUnique({
    where: { teacherId_year_month: { teacherId, year: bodyYear, month: bodyMonth } },
    select: { paymentStatus: true },
  })
  if (pmBody?.paymentStatus === 'AGUARDANDO_REENVIO') {
    return { year: bodyYear, month: bodyMonth }
  }

  const resolved = await resolveTeacherPaymentMonthKeyContaining(teacherId, at)
  if (resolved) return resolved

  return { year: bodyYear, month: bodyMonth }
}
