/**
 * Confirmação unificada de pagamento do aluno (mês/competência).
 * Centraliza writes em EnrollmentPaymentMonth + CoraInvoice e efeitos colaterais
 * (NFSe, e-mail, liberação de acesso) antes espalhados no webhook e no PATCH financeiro.
 */

import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { cancelOpenCoraInvoiceForMonth } from '@/lib/cora/cancel-open-invoices'
import { getInvoice } from '@/lib/cora'
import { logFinanceAction, getEnrollmentFinanceData } from '@/lib/finance'
import { emitirNfseParaAluno, obterNfAutorizadaExistente } from '@/lib/nfse/service'
import { sendPaymentConfirmation, type NfInfoForConfirmation } from '@/lib/email/payment-notifications'
import { liberarAcessoAlunoSafe } from '@/lib/access'

const NFSE_ENABLED = process.env.NFSE_ENABLED === 'true'

export type ConfirmPaymentSource =
  | 'WEBHOOK_CORA'
  | 'FINANCEIRO_ADMIN'
  | 'RECEBIMENTO_AUTO'
  | 'RECEBIMENTO_MANUAL'
  | 'COBRANCA_SYNC'
  | 'CORA_LEGACY_WEBHOOK'

export interface ConfirmEnrollmentPaymentParams {
  enrollmentId: string
  year: number
  month: number
  paidAt: Date
  metodo?: string | null
  source: ConfirmPaymentSource
  performedBy?: string | null
  /** Centavos pagos (Cora). */
  paidAmountCents?: number | null
  /** ID externo da invoice Cora (coraInvoiceId). */
  coraInvoiceExternalId?: string | null
  /** Ao marcar PAGO manualmente no financeiro: cancela boleto Cora em aberto. */
  cancelCoraIfOpen?: boolean
  /** Não enviar NF/e-mail/acesso (ex.: reprocessamento). */
  skipSideEffects?: boolean
  /** Comprovante manual anexado pelo financeiro. */
  receiptUrl?: string | null
}

export interface ConfirmEnrollmentPaymentResult {
  enrollmentPaymentMonthId: string
  alreadyPaid: boolean
  amountReais: number
}

type Tx = Prisma.TransactionClient

export function mensalidadeCentavos(enrollment: {
  valorMensalidade: unknown
  paymentInfo?: { valorMensal: unknown } | null
}): number {
  return Math.round(
    Number(enrollment.valorMensalidade ?? enrollment.paymentInfo?.valorMensal ?? 0) * 100
  )
}

/** Writes no banco (transação). */
export async function applyEnrollmentPaymentConfirmation(
  tx: Tx,
  params: ConfirmEnrollmentPaymentParams
): Promise<ConfirmEnrollmentPaymentResult> {
  const {
    enrollmentId,
    year,
    month,
    paidAt,
    metodo,
    source,
    performedBy,
    paidAmountCents,
    coraInvoiceExternalId,
    receiptUrl,
  } = params

  const receiptUrlVal =
    typeof receiptUrl === 'string' && receiptUrl.trim().startsWith('/uploads/')
      ? receiptUrl.trim()
      : null

  const existingMonth = await tx.enrollmentPaymentMonth.findUnique({
    where: { enrollmentId_year_month: { enrollmentId, year, month } },
    select: { id: true, paymentStatus: true },
  })
  const alreadyPaid = existingMonth?.paymentStatus === 'PAGO'

  const epm = await tx.enrollmentPaymentMonth.upsert({
    where: { enrollmentId_year_month: { enrollmentId, year, month } },
    create: {
      enrollmentId,
      year,
      month,
      paymentStatus: 'PAGO',
      paidAt,
      receiptUrl: receiptUrlVal,
    },
    update: {
      paymentStatus: 'PAGO',
      paidAt,
      ...(receiptUrlVal ? { receiptUrl: receiptUrlVal } : {}),
    },
  })

  if (metodo?.trim()) {
    await tx.enrollment.update({
      where: { id: enrollmentId },
      data: { metodoPagamento: metodo.trim() },
    })
  }

  let paidAmount = paidAmountCents ?? null
  if (coraInvoiceExternalId) {
    const invoice = await tx.coraInvoice.findUnique({
      where: { coraInvoiceId: coraInvoiceExternalId },
    })
    if (invoice && invoice.status !== 'PAID') {
      if (paidAmount == null) paidAmount = invoice.amount
      await tx.coraInvoice.update({
        where: { coraInvoiceId: coraInvoiceExternalId },
        data: {
          status: 'PAID',
          paidAt,
          paidAmount: paidAmount ?? invoice.amount,
        },
      })
    } else if (invoice?.paidAmount) {
      paidAmount = invoice.paidAmount
    }
  }

  if (!alreadyPaid) {
    await logFinanceAction({
      entityType: 'ENROLLMENT',
      entityId: enrollmentId,
      action: 'PAYMENT_CONFIRMED',
      newValue: {
        paymentStatus: 'PAGO',
        year,
        month,
        paidAmount,
        coraInvoiceId: coraInvoiceExternalId ?? undefined,
        source,
      },
      performedBy: performedBy ?? source,
      metadata: coraInvoiceExternalId ? { coraInvoiceId: coraInvoiceExternalId } : undefined,
    }).catch(() => {})
  }

  const enrollment = await tx.enrollment.findUnique({
    where: { id: enrollmentId },
    select: {
      valorMensalidade: true,
      paymentInfo: { select: { valorMensal: true } },
    },
  })
  const cents =
    paidAmount ??
    (enrollment ? mensalidadeCentavos(enrollment) : 0)

  return {
    enrollmentPaymentMonthId: epm.id,
    alreadyPaid,
    amountReais: cents / 100,
  }
}

/** Cancela boleto Cora em aberto para o mês (marcação manual PAGO no admin). */
async function cancelOpenCoraForMonthLocal(
  enrollmentId: string,
  year: number,
  month: number
): Promise<void> {
  await cancelOpenCoraInvoiceForMonth(enrollmentId, year, month)
}

export async function runConfirmEnrollmentPaymentSideEffects(
  params: ConfirmEnrollmentPaymentParams & {
    amountReais: number
    alreadyPaid: boolean
  }
): Promise<void> {
  if (params.skipSideEffects || params.alreadyPaid) return

  const { enrollmentId, year, month, paidAt, source, cancelCoraIfOpen } = params

  if (cancelCoraIfOpen) {
    await cancelOpenCoraForMonthLocal(enrollmentId, year, month)
  }

  await liberarAcessoAlunoSafe({
    enrollmentId,
    contexto: source.toLowerCase().replace(/_/g, '-'),
  })

  const enrollmentFull = await prisma.enrollment.findUnique({
    where: { id: enrollmentId },
    include: {
      user: { select: { email: true } },
      paymentInfo: true,
    },
  })
  if (!enrollmentFull) return

  const isBolsista = Boolean(enrollmentFull.bolsista)
  const finance = getEnrollmentFinanceData(enrollmentFull)
  const valorMensal =
    enrollmentFull.valorMensalidade != null
      ? Number(enrollmentFull.valorMensalidade)
      : enrollmentFull.paymentInfo?.valorMensal != null
        ? Number(enrollmentFull.paymentInfo.valorMensal)
        : null
  const amount = params.amountReais > 0 ? params.amountReais : (valorMensal ?? 0)

  let nfInfo: NfInfoForConfirmation | undefined
  if (!isBolsista && NFSE_ENABLED && (finance.cpf || finance.cnpj) && amount > 0) {
    try {
      let nota = await obterNfAutorizadaExistente(enrollmentId, year, month)
      if (!nota) {
        nota = await emitirNfseParaAluno({
          enrollmentId,
          studentName: finance.nome,
          cpf: finance.cpf || undefined,
          cnpj: finance.cnpj || undefined,
          email: finance.email || undefined,
          amount,
          year,
          month,
          alunoNome: enrollmentFull.nome,
          frequenciaSemanal: enrollmentFull.frequenciaSemanal ?? undefined,
          curso: enrollmentFull.curso ?? undefined,
          customDescricaoEmpresa: enrollmentFull.faturamentoDescricaoNfse ?? undefined,
        })
      }
      if (nota.status === 'autorizado' && nota.numero) {
        nfInfo = { numero: nota.numero, pdfUrl: nota.pdfUrl, disponivel: true }
      }
    } catch (nfErr) {
      console.error('[confirm-enrollment-payment] Erro NFSe:', nfErr)
    }
  }

  try {
    const nfseSerahEnviada = NFSE_ENABLED && !nfInfo?.disponivel
    await sendPaymentConfirmation(
      enrollmentFull,
      amount,
      paidAt,
      year,
      month,
      nfseSerahEnviada,
      nfInfo
    )
  } catch (emailErr) {
    console.error('[confirm-enrollment-payment] Erro e-mail confirmação:', emailErr)
  }
}

export async function confirmEnrollmentPayment(
  params: ConfirmEnrollmentPaymentParams
): Promise<ConfirmEnrollmentPaymentResult> {
  const result = await prisma.$transaction((tx) =>
    applyEnrollmentPaymentConfirmation(tx, params)
  )
  await runConfirmEnrollmentPaymentSideEffects({ ...params, ...result })
  return result
}

/** Busca valor pago na API Cora quando necessário. */
export async function fetchCoraPaidAmountCents(
  coraInvoiceExternalId: string,
  fallbackCents: number
): Promise<number> {
  try {
    const details = await getInvoice(coraInvoiceExternalId)
    return details.total_paid > 0 ? details.total_paid : fallbackCents
  } catch {
    return fallbackCents
  }
}
