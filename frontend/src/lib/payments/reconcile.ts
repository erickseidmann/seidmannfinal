import type { ReceivedPayment, Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import type { NormalizedPaymentWithHint, InvoiceMonthHint } from './types'
import { inferDocumentoTipo, onlyDigits } from './normalize'
import {
  applyEnrollmentPaymentConfirmation,
  mensalidadeCentavos,
  runConfirmEnrollmentPaymentSideEffects,
  type ConfirmPaymentSource,
} from './confirm-enrollment-payment'

type Tx = Prisma.TransactionClient

export interface QuitarResult {
  enrollmentPaymentMonthId: string | null
  year: number | null
  month: number | null
  semCobrancaAberta: boolean
}

/**
 * Quita cobrança do aluno.
 * FAST PATH (Cora): year/month da invoice quando invoiceHint informado.
 * Caso geral: EnrollmentPaymentMonth PENDING/ATRASADO mais antigo (year, month asc).
 * Se não houver linha em aberto: semCobrancaAberta=true — não criamos linha automaticamente.
 */
export async function quitarCobrancaMaisAntiga(
  tx: Tx,
  enrollmentId: string,
  invoiceHint?: InvoiceMonthHint | null
): Promise<QuitarResult> {
  if (invoiceHint?.year != null && invoiceHint?.month != null) {
    const { year, month } = invoiceHint
    const existing = await tx.enrollmentPaymentMonth.findUnique({
      where: { enrollmentId_year_month: { enrollmentId, year, month } },
      select: { id: true, paymentStatus: true },
    })
    return {
      enrollmentPaymentMonthId: existing?.id ?? null,
      year,
      month,
      semCobrancaAberta: false,
    }
  }

  const oldest = await tx.enrollmentPaymentMonth.findFirst({
    where: {
      enrollmentId,
      paymentStatus: { in: ['PENDING', 'ATRASADO'] },
    },
    orderBy: [{ year: 'asc' }, { month: 'asc' }],
    select: { id: true, year: true, month: true },
  })

  if (!oldest) {
    return {
      enrollmentPaymentMonthId: null,
      year: null,
      month: null,
      semCobrancaAberta: true,
    }
  }

  return {
    enrollmentPaymentMonthId: oldest.id,
    year: oldest.year,
    month: oldest.month,
    semCobrancaAberta: false,
  }
}

async function resolveEnrollmentCandidates(
  tx: Tx,
  documento: string | undefined
): Promise<
  Array<{
    enrollmentId: string
    valorMensalidade: unknown
    paymentInfo: { valorMensal: unknown } | null
  }>
> {
  if (!documento) return []

  const links = await tx.payerLink.findMany({
    where: { documento },
    select: {
      enrollmentId: true,
      enrollment: {
        select: {
          valorMensalidade: true,
          paymentInfo: { select: { valorMensal: true } },
        },
      },
    },
  })

  return links.map((l) => ({
    enrollmentId: l.enrollmentId,
    valorMensalidade: l.enrollment.valorMensalidade,
    paymentInfo: l.enrollment.paymentInfo,
  }))
}

function pickEnrollmentByValue(
  candidates: Array<{
    enrollmentId: string
    valorMensalidade: unknown
    paymentInfo: { valorMensal: unknown } | null
  }>,
  valorCentavos: number
): string | null {
  const matches = candidates.filter(
    (c) => mensalidadeCentavos(c) === valorCentavos
  )
  if (matches.length === 1) return matches[0].enrollmentId
  return null
}

type SideEffectPayload = {
  enrollmentId: string
  year: number
  month: number
  paidAt: Date
  metodo?: string | null
  source: ConfirmPaymentSource
  performedBy?: string | null
  paidAmountCents?: number | null
  coraInvoiceExternalId?: string | null
  amountReais: number
  alreadyPaid: boolean
}

const DUPLICATE_WINDOW_MS = 7 * 24 * 60 * 60 * 1000

/** Evita dupla quitação quando webhook (inv_) e extrato (ent_) registram o mesmo pagamento. */
async function findDuplicateLinkedPayment(
  tx: Tx,
  np: NormalizedPaymentWithHint,
  targetEnrollmentId: string,
  excludeId: string
): Promise<ReceivedPayment | null> {
  if (np.provider !== 'CORA') return null

  if (np.txid) {
    const byTxid = await tx.receivedPayment.findFirst({
      where: {
        provider: 'CORA',
        status: 'VINCULADO',
        txid: np.txid,
        NOT: { id: excludeId },
      },
    })
    if (byTxid) return byTxid
  }

  const windowStart = new Date(np.dataPagamento.getTime() - DUPLICATE_WINDOW_MS)
  const windowEnd = new Date(np.dataPagamento.getTime() + DUPLICATE_WINDOW_MS)

  return tx.receivedPayment.findFirst({
    where: {
      provider: 'CORA',
      status: 'VINCULADO',
      enrollmentId: targetEnrollmentId,
      valor: np.valor,
      dataPagamento: { gte: windowStart, lte: windowEnd },
      NOT: { id: excludeId },
    },
    orderBy: { createdAt: 'desc' },
  })
}

async function linkAsDuplicateInTx(
  tx: Tx,
  receivedPaymentId: string,
  enrollmentId: string,
  duplicateOf: ReceivedPayment
): Promise<ReceivedPayment> {
  return tx.receivedPayment.update({
    where: { id: receivedPaymentId },
    data: {
      status: 'VINCULADO',
      enrollmentId,
      enrollmentPaymentMonthId: duplicateOf.enrollmentPaymentMonthId,
      coraInvoiceId: duplicateOf.coraInvoiceId,
      semCobrancaAberta: true,
      divergenciaValor: false,
    },
  })
}

async function linkAndConfirmInTx(
  tx: Tx,
  receivedPaymentId: string,
  enrollmentId: string,
  np: NormalizedPaymentWithHint,
  source: ConfirmPaymentSource,
  performedBy?: string | null
): Promise<{ payment: ReceivedPayment; sideEffects: SideEffectPayload | null }> {
  const invoiceHint: InvoiceMonthHint | null = np.coraHint
    ? {
        year: np.coraHint.year,
        month: np.coraHint.month,
        coraInvoiceDbId: np.coraHint.coraInvoiceDbId,
      }
    : null

  const quitar = await quitarCobrancaMaisAntiga(tx, enrollmentId, invoiceHint)
  let enrollmentPaymentMonthId = quitar.enrollmentPaymentMonthId
  let sideEffects: SideEffectPayload | null = null

  if (!quitar.semCobrancaAberta && quitar.year != null && quitar.month != null) {
    const existingMonth = await tx.enrollmentPaymentMonth.findUnique({
      where: {
        enrollmentId_year_month: {
          enrollmentId,
          year: quitar.year,
          month: quitar.month,
        },
      },
      select: { id: true, paymentStatus: true },
    })
    const monthAlreadyPaid = existingMonth?.paymentStatus === 'PAGO'

    if (!monthAlreadyPaid) {
      const confirmResult = await applyEnrollmentPaymentConfirmation(tx, {
        enrollmentId,
        year: quitar.year,
        month: quitar.month,
        paidAt: np.dataPagamento,
        metodo: np.metodo,
        source,
        performedBy,
        paidAmountCents: np.valor,
        coraInvoiceExternalId: np.coraHint?.coraInvoiceExternalId ?? undefined,
      })
      enrollmentPaymentMonthId = confirmResult.enrollmentPaymentMonthId
      sideEffects = {
        enrollmentId,
        year: quitar.year,
        month: quitar.month,
        paidAt: np.dataPagamento,
        metodo: np.metodo,
        source,
        performedBy,
        paidAmountCents: np.valor,
        coraInvoiceExternalId: np.coraHint?.coraInvoiceExternalId,
        amountReais: confirmResult.amountReais,
        alreadyPaid: confirmResult.alreadyPaid,
      }
    } else if (existingMonth) {
      enrollmentPaymentMonthId = existingMonth.id
    }
  }

  const payment = await tx.receivedPayment.update({
    where: { id: receivedPaymentId },
    data: {
      status: 'VINCULADO',
      enrollmentId,
      enrollmentPaymentMonthId,
      coraInvoiceId:
        np.coraHint?.coraInvoiceDbId ?? invoiceHint?.coraInvoiceDbId ?? undefined,
      semCobrancaAberta: quitar.semCobrancaAberta,
      divergenciaValor: false,
    },
  })

  return { payment, sideEffects }
}

export async function reconcilePayment(
  np: NormalizedPaymentWithHint
): Promise<ReceivedPayment> {
  const documento =
    np.documentoPagador != null ? onlyDigits(np.documentoPagador) : undefined
  if (documento && !inferDocumentoTipo(documento)) {
    throw new Error('Documento do pagador inválido (deve ter 11 ou 14 dígitos)')
  }

  const coraInvoiceDbId = np.coraHint?.coraInvoiceDbId
  const coraEnrollmentId = np.coraHint?.enrollmentId

  let sideEffects: SideEffectPayload | null = null

  const result = await prisma.$transaction(async (tx) => {
    const existing = await tx.receivedPayment.findUnique({
      where: {
        provider_providerPaymentId: {
          provider: np.provider,
          providerPaymentId: np.providerPaymentId,
        },
      },
    })
    if (existing) return { payment: existing, sideEffects: null as SideEffectPayload | null }

    const created = await tx.receivedPayment.create({
      data: {
        provider: np.provider,
        providerPaymentId: np.providerPaymentId,
        valor: np.valor,
        dataPagamento: np.dataPagamento,
        metodo: np.metodo,
        documentoPagador: documento,
        nomePagador: np.nomePagador,
        txid: np.txid,
        endToEndId: np.endToEndId,
        referencia: np.referencia,
        coraInvoiceId: coraInvoiceDbId ?? undefined,
        enrollmentId: coraEnrollmentId ?? undefined,
        rawPayload: np.rawPayload as Prisma.InputJsonValue,
        status: 'PENDENTE',
      },
    })

    const candidates = await resolveEnrollmentCandidates(tx, documento)
    let targetEnrollmentId: string | null = null
    let divergenciaValor = false

    if (coraEnrollmentId) {
      const enr = await tx.enrollment.findUnique({
        where: { id: coraEnrollmentId },
        select: {
          valorMensalidade: true,
          paymentInfo: { select: { valorMensal: true } },
        },
      })
      if (enr && mensalidadeCentavos(enr) === np.valor) {
        targetEnrollmentId = coraEnrollmentId
      } else if (enr) {
        divergenciaValor = true
      }
    }

    if (!targetEnrollmentId && candidates.length === 1) {
      const c = candidates[0]
      if (mensalidadeCentavos(c) === np.valor) {
        targetEnrollmentId = c.enrollmentId
      } else {
        divergenciaValor = true
      }
    } else if (!targetEnrollmentId && candidates.length > 1) {
      targetEnrollmentId = pickEnrollmentByValue(candidates, np.valor)
      if (!targetEnrollmentId) {
        const matches = candidates.filter(
          (c) => mensalidadeCentavos(c) === np.valor
        )
        if (matches.length > 1) divergenciaValor = true
      }
    }

    if (!targetEnrollmentId) {
      if (divergenciaValor) {
        const pending = await tx.receivedPayment.update({
          where: { id: created.id },
          data: { divergenciaValor: true },
        })
        return { payment: pending, sideEffects: null }
      }
      return { payment: created, sideEffects: null }
    }

    const duplicate = await findDuplicateLinkedPayment(
      tx,
      np,
      targetEnrollmentId,
      created.id
    )
    if (duplicate) {
      const linked = await linkAsDuplicateInTx(
        tx,
        created.id,
        targetEnrollmentId,
        duplicate
      )
      return { payment: linked, sideEffects: null }
    }

    const linked = await linkAndConfirmInTx(
      tx,
      created.id,
      targetEnrollmentId,
      np,
      'RECEBIMENTO_AUTO'
    )
    return { payment: linked.payment, sideEffects: linked.sideEffects }
  })

  if (result.sideEffects) {
    await runConfirmEnrollmentPaymentSideEffects(result.sideEffects)
  }

  return result.payment
}

export async function manualLinkReceivedPayment(
  receivedPaymentId: string,
  enrollmentId: string,
  performedBy: string | null
): Promise<ReceivedPayment> {
  const rp = await prisma.receivedPayment.findUnique({
    where: { id: receivedPaymentId },
  })
  if (!rp) throw new Error('Recebimento não encontrado')
  if (rp.status === 'IGNORADO') {
    throw new Error('Recebimento ignorado não pode ser vinculado')
  }
  if (rp.status === 'VINCULADO') return rp

  const documento = rp.documentoPagador
  const docTipo = documento ? inferDocumentoTipo(documento) : null

  const np: NormalizedPaymentWithHint = {
    provider: rp.provider,
    providerPaymentId: rp.providerPaymentId,
    valor: rp.valor,
    dataPagamento: rp.dataPagamento,
    metodo: rp.metodo ?? undefined,
    documentoPagador: documento ?? undefined,
    nomePagador: rp.nomePagador ?? undefined,
    rawPayload: rp.rawPayload,
  }

  if (rp.coraInvoiceId) {
    const inv = await prisma.coraInvoice.findUnique({
      where: { id: rp.coraInvoiceId },
    })
    if (inv) {
      np.coraHint = {
        coraInvoiceDbId: inv.id,
        coraInvoiceExternalId: inv.coraInvoiceId,
        enrollmentId: inv.enrollmentId,
        year: inv.year,
        month: inv.month,
        paidAmountCents: rp.valor,
      }
    }
  }

  const linked = await prisma.$transaction(async (tx) => {
    if (documento && docTipo) {
      await tx.payerLink.upsert({
        where: {
          documento_enrollmentId: { documento, enrollmentId },
        },
        create: {
          documento,
          documentoTipo: docTipo,
          enrollmentId,
          nomePagador: rp.nomePagador,
        },
        update: {
          nomePagador: rp.nomePagador ?? undefined,
        },
      })
    }

    return linkAndConfirmInTx(
      tx,
      receivedPaymentId,
      enrollmentId,
      np,
      'RECEBIMENTO_MANUAL',
      performedBy
    )
  })

  if (linked.sideEffects) {
    await runConfirmEnrollmentPaymentSideEffects(linked.sideEffects)
  }

  return linked.payment
}

export async function ignoreReceivedPayment(
  receivedPaymentId: string
): Promise<ReceivedPayment> {
  const rp = await prisma.receivedPayment.findUnique({
    where: { id: receivedPaymentId },
  })
  if (!rp) throw new Error('Recebimento não encontrado')
  if (rp.status === 'VINCULADO') {
    throw new Error('Recebimento já vinculado não pode ser ignorado')
  }
  return prisma.receivedPayment.update({
    where: { id: receivedPaymentId },
    data: { status: 'IGNORADO' },
  })
}
