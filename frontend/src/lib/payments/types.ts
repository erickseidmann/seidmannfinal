import type { PaymentProvider } from '@prisma/client'

export type { PaymentProvider }

export interface NormalizedPayment {
  provider: PaymentProvider
  providerPaymentId: string
  valor: number
  dataPagamento: Date
  metodo?: string
  documentoPagador?: string
  nomePagador?: string
  txid?: string
  endToEndId?: string
  referencia?: string
  rawPayload: unknown
}

/** Metadados Cora para fast path (year/month da invoice). */
export interface CoraReconcileHint {
  coraInvoiceDbId: string
  coraInvoiceExternalId: string
  enrollmentId: string
  year: number
  month: number
  paidAmountCents: number
}

export type NormalizedPaymentWithHint = NormalizedPayment & {
  coraHint?: CoraReconcileHint
}

export interface InvoiceMonthHint {
  year: number
  month: number
  coraInvoiceDbId?: string
}
