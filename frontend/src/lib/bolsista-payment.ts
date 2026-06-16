/**
 * Bolsistas não pagam mensalidade: o mês deve constar como PAGO no banco
 * (não apenas na exibição do financeiro) para crons e relatórios não tratarem como inadimplente.
 */

import { prisma } from '@/lib/prisma'

export async function ensureBolsistaPaymentMonthPaid(
  enrollmentId: string,
  year: number,
  month: number
): Promise<boolean> {
  const existing = await prisma.enrollmentPaymentMonth.findUnique({
    where: { enrollmentId_year_month: { enrollmentId, year, month } },
    select: { paymentStatus: true },
  })
  if (existing?.paymentStatus === 'PAGO') return false

  await prisma.enrollmentPaymentMonth.upsert({
    where: { enrollmentId_year_month: { enrollmentId, year, month } },
    create: { enrollmentId, year, month, paymentStatus: 'PAGO' },
    update: { paymentStatus: 'PAGO' },
  })
  return true
}

/** Garante PAGO no mês corrente para todos os bolsistas ativos. */
export async function syncActiveBolsistasPaymentMonth(year: number, month: number): Promise<number> {
  const bolsistas = await prisma.enrollment.findMany({
    where: { status: 'ACTIVE', bolsista: true },
    select: { id: true },
  })

  let synced = 0
  for (const b of bolsistas) {
    const changed = await ensureBolsistaPaymentMonthPaid(b.id, year, month)
    if (changed) synced++
  }
  return synced
}
