/**
 * Resolve qual TeacherPaymentMonth contém um instante, usando periodoInicio/periodoTermino
 * no mesmo sentido de teacher-paid-period: [início, término) com término exclusivo.
 */

import { prisma } from '@/lib/prisma'

export async function resolveTeacherPaymentMonthKeyContaining(
  teacherId: string,
  at: Date = new Date()
): Promise<{ year: number; month: number } | null> {
  const t = at.getTime()
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

  const matches = rows.filter(
    (r) =>
      r.periodoInicio != null &&
      r.periodoTermino != null &&
      r.periodoInicio.getTime() <= t &&
      t < r.periodoTermino.getTime() + 24 * 60 * 60 * 1000
  )
  if (matches.length === 0) return null

  matches.sort((a, b) => b.periodoInicio!.getTime() - a.periodoInicio!.getTime())
  const pick = matches[0]
  return { year: pick.year, month: pick.month }
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
