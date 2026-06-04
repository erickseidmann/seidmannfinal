import type { PaymentProvider } from '@prisma/client'
import type { DocumentoTipo } from '@prisma/client'
import type { NormalizedPayment } from './types'

export function onlyDigits(s: string): string {
  return s.replace(/\D/g, '')
}

export function inferDocumentoTipo(documento: string): DocumentoTipo | null {
  if (documento.length === 11) return 'CPF'
  if (documento.length === 14) return 'CNPJ'
  return null
}

/** Payload base genérico (TODO: ajustar por provedor em produção). */
interface GenericWebhookBody {
  id?: string
  payment_id?: string
  provider_payment_id?: string
  amount?: number
  valor?: number
  total_paid?: number
  paid_at?: string
  data_pagamento?: string
  occurrence_date?: string
  metodo?: string
  method?: string
  documento?: string
  cpf?: string
  cnpj?: string
  payer_document?: string
  nome_pagador?: string
  payer_name?: string
  txid?: string
  end_to_end_id?: string
  e2e_id?: string
  referencia?: string
  reference?: string
}

function parseGenericBody(
  provider: PaymentProvider,
  body: unknown
): NormalizedPayment | null {
  if (!body || typeof body !== 'object') return null
  const b = body as GenericWebhookBody

  const providerPaymentId =
    b.provider_payment_id ?? b.payment_id ?? b.id
  if (!providerPaymentId || typeof providerPaymentId !== 'string') return null

  let valorCents = 0
  if (typeof b.amount === 'number') valorCents = Math.round(b.amount)
  else if (typeof b.valor === 'number') valorCents = Math.round(b.valor)
  else if (typeof b.total_paid === 'number') valorCents = Math.round(b.total_paid)

  const dateRaw =
    b.data_pagamento ?? b.paid_at ?? b.occurrence_date
  const dataPagamento = dateRaw ? new Date(dateRaw) : new Date()
  if (Number.isNaN(dataPagamento.getTime())) return null

  const docRaw = b.documento ?? b.cpf ?? b.cnpj ?? b.payer_document
  let documentoPagador: string | undefined
  if (typeof docRaw === 'string') {
    const digits = onlyDigits(docRaw)
    if (inferDocumentoTipo(digits)) documentoPagador = digits
  }

  const metodo = b.metodo ?? b.method
  const nomePagador = b.nome_pagador ?? b.payer_name

  return {
    provider,
    providerPaymentId,
    valor: valorCents,
    dataPagamento,
    metodo: typeof metodo === 'string' ? metodo : undefined,
    documentoPagador,
    nomePagador: typeof nomePagador === 'string' ? nomePagador : undefined,
    txid: typeof b.txid === 'string' ? b.txid : undefined,
    endToEndId:
      typeof b.end_to_end_id === 'string'
        ? b.end_to_end_id
        : typeof b.e2e_id === 'string'
          ? b.e2e_id
          : undefined,
    referencia:
      typeof b.referencia === 'string'
        ? b.referencia
        : typeof b.reference === 'string'
          ? b.reference
          : undefined,
    rawPayload: body,
  }
}

export function normalizeInfinitePay(body: unknown): NormalizedPayment | null {
  // TODO: InfinitePay — mapear campos reais do webhook
  return parseGenericBody('INFINITEPAY', body)
}

export function normalizeSantander(body: unknown): NormalizedPayment | null {
  // Recebimentos Santander em produção vêm do extrato (cron santander-statement), não deste webhook.
  return parseGenericBody('SANTANDER', body)
}

export function normalizeLixel(body: unknown): NormalizedPayment | null {
  // TODO: Lixel — mapear campos reais do webhook
  return parseGenericBody('LIXEL', body)
}

export function normalizeCoraFromBody(body: unknown): NormalizedPayment | null {
  // TODO: Cora body legado — preferir adapter de headers quando possível
  return parseGenericBody('CORA', body)
}

const NORMALIZERS: Record<
  Exclude<PaymentProvider, 'CORA'>,
  (body: unknown) => NormalizedPayment | null
> = {
  INFINITEPAY: normalizeInfinitePay,
  SANTANDER: normalizeSantander,
  LIXEL: normalizeLixel,
}

export function normalizeByProvider(
  provider: PaymentProvider,
  body: unknown
): NormalizedPayment | null {
  if (provider === 'CORA') return normalizeCoraFromBody(body)
  return NORMALIZERS[provider](body)
}
