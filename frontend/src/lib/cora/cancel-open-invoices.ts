/**
 * Cancela boletos Cora em aberto (evita e-mails de cobrança da Cora após pagamento/inativação).
 */

import { prisma } from '@/lib/prisma'
import { cancelInvoice } from '@/lib/cora/client'

const OPEN_STATUSES = new Set(['OPEN', 'LATE', 'PENDING', 'DRAFT'])

function isCancellableStatus(status: string | null | undefined): boolean {
  if (!status) return true
  const s = status.toUpperCase()
  if (s === 'PAID' || s === 'CANCELLED' || s === 'CANCELED') return false
  return OPEN_STATUSES.has(s) || !['PAID', 'CANCELLED', 'CANCELED'].includes(s)
}

export async function cancelOpenCoraInvoiceForMonth(
  enrollmentId: string,
  year: number,
  month: number
): Promise<boolean> {
  const coraInvoice = await prisma.coraInvoice.findUnique({
    where: { enrollmentId_year_month: { enrollmentId, year, month } },
  })
  if (!coraInvoice || !isCancellableStatus(coraInvoice.status)) {
    return false
  }
  try {
    await cancelInvoice(coraInvoice.coraInvoiceId)
    await prisma.coraInvoice.update({
      where: { id: coraInvoice.id },
      data: { status: 'CANCELLED' },
    })
    return true
  } catch (err) {
    console.error(
      `[cancel-open-invoices] Erro ao cancelar boleto ${coraInvoice.coraInvoiceId}:`,
      err
    )
    return false
  }
}

/** Cancela todos os boletos Cora ainda abertos de uma matrícula. */
export async function cancelAllOpenCoraInvoicesForEnrollment(
  enrollmentId: string
): Promise<number> {
  const invoices = await prisma.coraInvoice.findMany({
    where: { enrollmentId },
    select: { id: true, coraInvoiceId: true, status: true },
  })

  let cancelled = 0
  for (const inv of invoices) {
    if (!isCancellableStatus(inv.status)) continue
    try {
      await cancelInvoice(inv.coraInvoiceId)
      await prisma.coraInvoice.update({
        where: { id: inv.id },
        data: { status: 'CANCELLED' },
      })
      cancelled++
    } catch (err) {
      console.error(`[cancel-open-invoices] Erro ao cancelar ${inv.coraInvoiceId}:`, err)
    }
  }
  return cancelled
}
