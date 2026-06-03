import type { ReceivedPayment, DocumentoTipo, Prisma } from '@prisma/client'
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

export type EnrollmentCandidate = {
  enrollmentId: string
  valorMensalidade: unknown
  paymentInfo: { valorMensal: unknown } | null
}

const candidateSelect = {
  valorMensalidade: true,
  paymentInfo: { select: { valorMensal: true } },
} as const

async function resolveFromPayerLink(
  tx: Tx,
  documento: string
): Promise<EnrollmentCandidate[]> {
  const links = await tx.payerLink.findMany({
    where: { documento },
    select: {
      enrollmentId: true,
      enrollment: { select: candidateSelect },
    },
  })

  return links.map((l) => ({
    enrollmentId: l.enrollmentId,
    valorMensalidade: l.enrollment.valorMensalidade,
    paymentInfo: l.enrollment.paymentInfo,
  }))
}

async function resolveFromEnrollmentRegistry(
  tx: Tx,
  documento: string
): Promise<EnrollmentCandidate[]> {
  const rows = await tx.enrollment.findMany({
    where: {
      status: 'ACTIVE',
      OR: [
        { cpf: { contains: documento } },
        { cpfResponsavel: { contains: documento } },
        { faturamentoCnpj: { contains: documento } },
      ],
    },
    select: {
      id: true,
      cpf: true,
      cpfResponsavel: true,
      faturamentoCnpj: true,
      ...candidateSelect,
    },
  })

  const seen = new Set<string>()
  const out: EnrollmentCandidate[] = []
  for (const row of rows) {
    const fields = [row.cpf, row.cpfResponsavel, row.faturamentoCnpj]
    const matches = fields.some((f) => f && onlyDigits(f) === documento)
    if (!matches || seen.has(row.id)) continue
    seen.add(row.id)
    out.push({
      enrollmentId: row.id,
      valorMensalidade: row.valorMensalidade,
      paymentInfo: row.paymentInfo,
    })
  }
  return out
}

/** Candidatos por documento: PayerLink primeiro; se vazio, cadastro (cpf/responsável/CNPJ). */
async function resolveEnrollmentCandidates(
  tx: Tx,
  documento: string | undefined
): Promise<EnrollmentCandidate[]> {
  if (!documento) return []

  const fromLinks = await resolveFromPayerLink(tx, documento)
  if (fromLinks.length > 0) return fromLinks

  return resolveFromEnrollmentRegistry(tx, documento)
}

/** Para API/UI: candidatos sugeridos pelo documento do pagador. */
export async function findEnrollmentCandidatesByDocumento(
  documentoRaw: string | null | undefined
): Promise<
  Array<{
    enrollmentId: string
    nome: string
    email: string
    cpf: string | null
    valorMensalidade: number | null
  }>
> {
  const documento = documentoRaw ? onlyDigits(documentoRaw) : ''
  if (!documento || !inferDocumentoTipo(documento)) return []

  const candidates = await prisma.$transaction((tx) =>
    resolveEnrollmentCandidates(tx, documento)
  )

  if (candidates.length === 0) return []

  const enrollments = await prisma.enrollment.findMany({
    where: { id: { in: candidates.map((c) => c.enrollmentId) } },
    select: {
      id: true,
      nome: true,
      email: true,
      cpf: true,
      valorMensalidade: true,
      paymentInfo: { select: { valorMensal: true } },
    },
    orderBy: { nome: 'asc' },
  })

  return enrollments.map((e) => ({
    enrollmentId: e.id,
    nome: e.nome,
    email: e.email,
    cpf: e.cpf,
    valorMensalidade:
      mensalidadeCentavos(e) > 0 ? mensalidadeCentavos(e) / 100 : null,
  }))
}

async function upsertPayerLinkInTx(
  tx: Tx,
  documento: string | undefined,
  docTipo: DocumentoTipo | null,
  enrollmentId: string,
  nomePagador?: string | null
): Promise<void> {
  if (!documento || !docTipo) return
  await tx.payerLink.upsert({
    where: {
      documento_enrollmentId: { documento, enrollmentId },
    },
    create: {
      documento,
      documentoTipo: docTipo,
      enrollmentId,
      nomePagador: nomePagador ?? undefined,
    },
    update: {
      nomePagador: nomePagador ?? undefined,
    },
  })
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
  performedBy?: string | null,
  options?: { valorCentavosOverride?: number; skipPaymentStatusUpdate?: boolean }
): Promise<{ payment: ReceivedPayment | null; sideEffects: SideEffectPayload | null }> {
  const valorAlocacao = options?.valorCentavosOverride ?? np.valor
  const documento =
    np.documentoPagador != null ? onlyDigits(np.documentoPagador) : undefined
  const docTipo = documento ? inferDocumentoTipo(documento) : null

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
        paidAmountCents: valorAlocacao,
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
        paidAmountCents: valorAlocacao,
        coraInvoiceExternalId: np.coraHint?.coraInvoiceExternalId,
        amountReais: confirmResult.amountReais,
        alreadyPaid: confirmResult.alreadyPaid,
      }
    } else if (existingMonth) {
      enrollmentPaymentMonthId = existingMonth.id
    }
  }

  await upsertPayerLinkInTx(tx, documento, docTipo, enrollmentId, np.nomePagador)

  await tx.receivedPaymentAllocation.create({
    data: {
      receivedPaymentId,
      enrollmentId,
      enrollmentPaymentMonthId,
      valorCentavos: valorAlocacao,
    },
  })

  if (options?.skipPaymentStatusUpdate) {
    return { payment: null, sideEffects }
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
      divergenciaValor = false
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
    return { payment: linked.payment!, sideEffects: linked.sideEffects }
  })

  if (result.sideEffects) {
    await runConfirmEnrollmentPaymentSideEffects(result.sideEffects)
  }

  return result.payment!
}

export interface PaymentAllocationInput {
  enrollmentId: string
  valorCentavos: number
}

export async function manualLinkReceivedPaymentAllocations(
  receivedPaymentId: string,
  alocacoes: PaymentAllocationInput[],
  performedBy: string | null
): Promise<ReceivedPayment> {
  if (alocacoes.length === 0) {
    throw new Error('Informe ao menos uma alocação')
  }

  const ids = alocacoes.map((a) => a.enrollmentId)
  if (new Set(ids).size !== ids.length) {
    throw new Error('Não é permitido repetir o mesmo aluno nas alocações')
  }

  for (const a of alocacoes) {
    if (!Number.isInteger(a.valorCentavos) || a.valorCentavos <= 0) {
      throw new Error('Cada alocação deve ter valorCentavos inteiro positivo')
    }
  }

  const rp = await prisma.receivedPayment.findUnique({
    where: { id: receivedPaymentId },
  })
  if (!rp) throw new Error('Recebimento não encontrado')
  if (rp.status === 'IGNORADO') {
    throw new Error('Recebimento ignorado não pode ser vinculado')
  }
  if (rp.status === 'VINCULADO') return rp

  const soma = alocacoes.reduce((s, a) => s + a.valorCentavos, 0)
  if (soma > rp.valor) {
    throw new Error('A soma das alocações não pode exceder o valor do recebimento')
  }

  const documento = rp.documentoPagador
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

  const multi = alocacoes.length > 1
  const sideEffectsList: SideEffectPayload[] = []
  let firstEnrollmentId: string | null = null
  let firstMonthId: string | null = null

  const payment = await prisma.$transaction(async (tx) => {
    for (const aloc of alocacoes) {
      const npForAloc: NormalizedPaymentWithHint = { ...np }
      if (
        multi ||
        (npForAloc.coraHint &&
          npForAloc.coraHint.enrollmentId !== aloc.enrollmentId)
      ) {
        delete npForAloc.coraHint
      }

      const linked = await linkAndConfirmInTx(
        tx,
        receivedPaymentId,
        aloc.enrollmentId,
        npForAloc,
        'RECEBIMENTO_MANUAL',
        performedBy,
        {
          valorCentavosOverride: aloc.valorCentavos,
          skipPaymentStatusUpdate: multi,
        }
      )
      if (linked.sideEffects) sideEffectsList.push(linked.sideEffects)
      if (!firstEnrollmentId) {
        firstEnrollmentId = aloc.enrollmentId
        const alloc = await tx.receivedPaymentAllocation.findFirst({
          where: {
            receivedPaymentId,
            enrollmentId: aloc.enrollmentId,
          },
          orderBy: { createdAt: 'desc' },
          select: { enrollmentPaymentMonthId: true },
        })
        firstMonthId = alloc?.enrollmentPaymentMonthId ?? null
      }
    }

    if (multi) {
      return tx.receivedPayment.update({
        where: { id: receivedPaymentId },
        data: {
          status: 'VINCULADO',
          enrollmentId: firstEnrollmentId,
          enrollmentPaymentMonthId: firstMonthId,
          divergenciaValor: false,
        },
      })
    }

    const updated = await tx.receivedPayment.findUnique({
      where: { id: receivedPaymentId },
    })
    if (!updated) throw new Error('Recebimento não encontrado após vínculo')
    return updated
  })

  for (const se of sideEffectsList) {
    await runConfirmEnrollmentPaymentSideEffects(se)
  }

  return payment
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

  return manualLinkReceivedPaymentAllocations(
    receivedPaymentId,
    [{ enrollmentId, valorCentavos: rp.valor }],
    performedBy
  )
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
