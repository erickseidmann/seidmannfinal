/**
 * Loop compartilhado: entradas de extrato → NormalizedPayment → reconcilePayment.
 */

import { prisma } from '@/lib/prisma'
import type { NormalizedPayment } from './types'
import { reconcilePayment } from './reconcile'

export interface SyncStatementPaymentsResult {
  ok: boolean
  total: number
  novas: number
  conciliadas: number
  pendentes: number
  ignoradas: number
  erros: number
  start: string
  end: string
  message?: string
}

export async function syncNormalizedPayments<T>(params: {
  entries: T[]
  mapFn: (entry: T) => NormalizedPayment
  logPrefix: string
  getEntryIdForLog?: (entry: T) => string
  start: string
  end: string
}): Promise<SyncStatementPaymentsResult> {
  const { entries, mapFn, logPrefix, getEntryIdForLog, start, end } = params

  let novas = 0
  let conciliadas = 0
  let pendentes = 0
  let ignoradas = 0
  let erros = 0

  for (const entry of entries) {
    try {
      const np = mapFn(entry)
      const existing = await prisma.receivedPayment.findUnique({
        where: {
          provider_providerPaymentId: {
            provider: np.provider,
            providerPaymentId: np.providerPaymentId,
          },
        },
      })
      const payment = await reconcilePayment(np)
      if (!existing) novas++
      if (payment.status === 'VINCULADO') conciliadas++
      else if (payment.status === 'PENDENTE') pendentes++
      else if (payment.status === 'IGNORADO') ignoradas++
    } catch (err) {
      erros++
      const id = getEntryIdForLog?.(entry) ?? '?'
      console.error(
        `[${logPrefix}] Erro entry ${id}:`,
        err instanceof Error ? err.message : err
      )
    }
  }

  const result: SyncStatementPaymentsResult = {
    ok: true,
    total: entries.length,
    novas,
    conciliadas,
    pendentes,
    ignoradas,
    erros,
    start,
    end,
  }

  if (entries.length > 0 || erros > 0) {
    console.log(`[${logPrefix}] Concluído`, result)
  }

  return result
}
