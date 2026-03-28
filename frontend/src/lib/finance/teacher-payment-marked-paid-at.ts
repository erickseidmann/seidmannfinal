/**
 * Data em que o mês foi marcado como PAGO no admin (`payment_marked_paid_at`).
 * Usa SQL raw para funcionar mesmo quando o Prisma Client ainda não foi regenerado após o schema.
 */

import { prisma } from '@/lib/prisma'

export async function getTeacherPaymentMarkedPaidAt(
  teacherId: string,
  year: number,
  month: number
): Promise<Date | null> {
  try {
    const rows = await prisma.$queryRaw<{ payment_marked_paid_at: Date | null }[]>`
      SELECT payment_marked_paid_at FROM teacher_payment_months
      WHERE teacher_id = ${teacherId} AND year = ${year} AND month = ${month}
      LIMIT 1
    `
    return rows[0]?.payment_marked_paid_at ?? null
  } catch {
    return null
  }
}

/** Atualiza só a coluna payment_marked_paid_at (não depende do tipo gerado do Prisma). */
export async function syncTeacherPaymentMarkedPaidAt(
  teacherId: string,
  year: number,
  month: number,
  previousStatus: string | null | undefined,
  newStatus: string | undefined
): Promise<void> {
  if (newStatus === undefined) return
  try {
    if (newStatus === 'PAGO' && previousStatus !== 'PAGO') {
      await prisma.$executeRaw`
        UPDATE teacher_payment_months
        SET payment_marked_paid_at = NOW()
        WHERE teacher_id = ${teacherId} AND year = ${year} AND month = ${month}
      `
    } else if (newStatus !== 'PAGO') {
      await prisma.$executeRaw`
        UPDATE teacher_payment_months
        SET payment_marked_paid_at = NULL
        WHERE teacher_id = ${teacherId} AND year = ${year} AND month = ${month}
      `
    }
  } catch (e) {
    console.warn('[syncTeacherPaymentMarkedPaidAt]', e)
  }
}
