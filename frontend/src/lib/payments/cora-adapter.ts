/**
 * Adapter Cora: headers + lookup de invoice no banco (fast path).
 * TODO: validação de assinatura/HMAC do webhook Cora antes de produção.
 */

import type { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getInvoice } from '@/lib/cora'
import type { NormalizedPaymentWithHint } from './types'
import { onlyDigits, inferDocumentoTipo } from './normalize'
import { fetchCoraPaidAmountCents } from './confirm-enrollment-payment'

export const CORA_WEBHOOK_UA = 'Cora-Webhook'

export async function buildNormalizedPaymentFromCoraInvoicePaid(
  coraInvoiceExternalId: string
): Promise<NormalizedPaymentWithHint | null> {
  const invoice = await prisma.coraInvoice.findUnique({
    where: { coraInvoiceId: coraInvoiceExternalId },
    include: {
      enrollment: {
        select: {
          cpf: true,
          cpfResponsavel: true,
          faturamentoCnpj: true,
          faturamentoTipo: true,
          nome: true,
        },
      },
    },
  })

  if (!invoice) {
    console.error(`[cora-adapter] Invoice ${coraInvoiceExternalId} não encontrada`)
    return null
  }

  let paidAmount = invoice.amount
  paidAmount = await fetchCoraPaidAmountCents(coraInvoiceExternalId, paidAmount)

  let documentoPagador: string | undefined
  const enr = invoice.enrollment
  if (enr.faturamentoTipo === 'EMPRESA' && enr.faturamentoCnpj) {
    const d = onlyDigits(enr.faturamentoCnpj)
    if (inferDocumentoTipo(d)) documentoPagador = d
  }
  if (!documentoPagador && enr.cpf) {
    const d = onlyDigits(enr.cpf)
    if (inferDocumentoTipo(d)) documentoPagador = d
  }
  if (!documentoPagador && enr.cpfResponsavel) {
    const d = onlyDigits(enr.cpfResponsavel)
    if (inferDocumentoTipo(d)) documentoPagador = d
  }

  let payerName: string | undefined
  try {
    const details = await getInvoice(coraInvoiceExternalId)
    const payer = (details as { payer?: { name?: string; document?: string } }).payer
    if (payer?.name) payerName = payer.name
    if (payer?.document) {
      const d = onlyDigits(payer.document)
      if (inferDocumentoTipo(d)) documentoPagador = d
    }
  } catch {
    // usa dados da matrícula
  }

  return {
    provider: 'CORA',
    providerPaymentId: coraInvoiceExternalId,
    valor: paidAmount,
    dataPagamento: new Date(),
    metodo: 'PIX',
    documentoPagador,
    nomePagador: payerName ?? enr.nome,
    referencia: invoice.code,
    rawPayload: {
      coraInvoiceId: coraInvoiceExternalId,
      enrollmentId: invoice.enrollmentId,
      year: invoice.year,
      month: invoice.month,
    },
    coraHint: {
      coraInvoiceDbId: invoice.id,
      coraInvoiceExternalId: invoice.coraInvoiceId,
      enrollmentId: invoice.enrollmentId,
      year: invoice.year,
      month: invoice.month,
      paidAmountCents: paidAmount,
    },
  }
}

export function isCoraHeaderWebhook(request: NextRequest): boolean {
  return (request.headers.get('user-agent') ?? '') === CORA_WEBHOOK_UA
}

export function readCoraWebhookHeaders(request: NextRequest): {
  eventId: string
  eventType: string
  resourceId: string
} {
  return {
    eventId: request.headers.get('webhook-event-id') ?? '',
    eventType: request.headers.get('webhook-event-type') ?? '',
    resourceId: request.headers.get('webhook-resource-id') ?? '',
  }
}
