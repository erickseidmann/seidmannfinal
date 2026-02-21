/**
 * Webhook Cora: notificações de pagamento (boleto/PIX).
 * A Cora envia dados nos HEADERS (body vazio).
 * Headers: user-agent, webhook-event-id, webhook-event-type, webhook-resource-id
 * Suporta também formato legado (body JSON) para compatibilidade.
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getInvoice } from '@/lib/cora'
import { logFinanceAction, getEnrollmentFinanceData } from '@/lib/finance'
import { emitirNfseParaAluno } from '@/lib/nfse/service'
import { sendPaymentConfirmation } from '@/lib/email/payment-notifications'

const CORA_WEBHOOK_UA = 'Cora-Webhook'

export async function GET() {
  return NextResponse.json({
    status: 'ok',
    message: 'Webhook Cora ativo',
  })
}

export async function POST(request: NextRequest) {
  try {
    const userAgent = request.headers.get('user-agent') ?? ''

    if (userAgent === CORA_WEBHOOK_UA) {
      return handleCoraHeaderWebhook(request)
    }
    return handleLegacyBodyWebhook(request)
  } catch (error) {
    console.error('[webhooks/cora]', error)
    return NextResponse.json({ success: true }, { status: 200 })
  }
}

async function handleCoraHeaderWebhook(request: NextRequest): Promise<NextResponse> {
  const eventId = request.headers.get('webhook-event-id') ?? ''
  const eventType = request.headers.get('webhook-event-type') ?? ''
  const resourceId = request.headers.get('webhook-resource-id') ?? ''

  console.log(`[Cora Webhook] Event: ${eventType}, Resource: ${resourceId}, EventID: ${eventId}`)

  if (!eventId || !eventType || !resourceId) {
    console.warn('[Cora Webhook] Headers incompletos')
    return NextResponse.json({ success: true }, { status: 200 })
  }

  const existing = await prisma.coraWebhookEvent.findUnique({
    where: { eventId },
  })
  if (existing) {
    console.log(`[Cora Webhook] Evento ${eventId} já processado, ignorando`)
    return NextResponse.json({ success: true }, { status: 200 })
  }

  try {
    switch (eventType) {
      case 'invoice.paid':
        await handleInvoicePaid(resourceId)
        break
      case 'invoice.registered':
        await handleInvoiceRegistered(resourceId)
        break
      case 'invoice.cancelled':
        await handleInvoiceCancelled(resourceId)
        break
      default:
        console.log(`[Cora Webhook] Evento não tratado: ${eventType}`)
    }
  } catch (err) {
    console.error(`[Cora Webhook] Erro processando ${eventType}:`, err)
  } finally {
    try {
      await prisma.coraWebhookEvent.upsert({
        where: { eventId },
        create: { eventId },
        update: {},
      })
    } catch {
      // ignorar falha ao registrar idempotência
    }
  }

  return NextResponse.json({ success: true }, { status: 200 })
}

async function handleInvoicePaid(coraInvoiceId: string): Promise<void> {
  const invoice = await prisma.coraInvoice.findUnique({
    where: { coraInvoiceId },
    include: {
      enrollment: {
        include: {
          user: { select: { email: true } },
          paymentInfo: true,
        },
      },
    },
  })

  if (!invoice) {
    console.error(`[Cora] Invoice ${coraInvoiceId} não encontrada no banco`)
    return
  }

  if (invoice.status === 'PAID') {
    console.log(`[Cora] Invoice ${coraInvoiceId} já processada, ignorando`)
    return
  }

  let paidAmount = invoice.amount
  try {
    const coraDetails = await getInvoice(coraInvoiceId)
    paidAmount = coraDetails.total_paid > 0 ? coraDetails.total_paid : invoice.amount
  } catch {
    // usar valor do banco
  }

  await prisma.coraInvoice.update({
    where: { coraInvoiceId },
    data: {
      status: 'PAID',
      paidAt: new Date(),
      paidAmount,
    },
  })

  const { enrollmentId, year, month, enrollment } = invoice
  const amountReais = paidAmount / 100

  await prisma.enrollmentPaymentMonth.upsert({
    where: {
      enrollmentId_year_month: { enrollmentId, year, month },
    },
    create: {
      enrollmentId,
      year,
      month,
      paymentStatus: 'PAGO',
    },
    update: { paymentStatus: 'PAGO' },
  })

  logFinanceAction({
    entityType: 'ENROLLMENT',
    entityId: enrollmentId,
    action: 'PAYMENT_CONFIRMED',
    newValue: {
      paymentStatus: 'PAGO',
      year,
      month,
      paidAmount,
      coraInvoiceId,
    },
    performedBy: 'WEBHOOK_CORA',
    metadata: { coraInvoiceId },
  }).catch(() => {})

  if (process.env.NFSE_ENABLED === 'true') {
    try {
      const finance = getEnrollmentFinanceData(enrollment)
      const valorMensalidade =
        enrollment.valorMensalidade != null
          ? Number(enrollment.valorMensalidade)
          : enrollment.paymentInfo?.valorMensal != null
            ? Number(enrollment.paymentInfo.valorMensal)
            : null
      if ((finance.cpf || finance.cnpj) && valorMensalidade && valorMensalidade > 0) {
        await emitirNfseParaAluno({
          enrollmentId,
          studentName: finance.nome,
          cpf: finance.cpf || undefined,
          cnpj: finance.cnpj || undefined,
          email: finance.email || undefined,
          amount: valorMensalidade,
          year,
          month,
          alunoNome: enrollment.nome,
          frequenciaSemanal: enrollment.frequenciaSemanal ?? undefined,
          curso: enrollment.curso ?? undefined,
          customDescricaoEmpresa: enrollment.faturamentoDescricaoNfse ?? undefined,
        })
        console.log(`[Cora] NFSe emitida para ${finance.nome} (${year}/${month})`)
      }
    } catch (nfseError) {
      console.error('[Cora] Erro ao emitir NFSe:', nfseError)
    }
  }

  try {
    await sendPaymentConfirmation(
      enrollment,
      amountReais,
      new Date(),
      year,
      month,
      process.env.NFSE_ENABLED === 'true'
    )
  } catch (emailErr) {
    console.error('[Cora] Erro ao enviar confirmação de pagamento:', emailErr)
  }

  console.log(`[Cora] Pagamento processado: ${enrollmentId} - ${year}/${month}`)
}

async function handleInvoiceRegistered(coraInvoiceId: string): Promise<void> {
  await prisma.coraInvoice.updateMany({
    where: { coraInvoiceId },
    data: { status: 'OPEN' },
  })
  console.log(`[Cora] Boleto registrado: ${coraInvoiceId}`)
}

async function handleInvoiceCancelled(coraInvoiceId: string): Promise<void> {
  await prisma.coraInvoice.updateMany({
    where: { coraInvoiceId },
    data: { status: 'CANCELLED' },
  })
  console.log(`[Cora] Boleto cancelado: ${coraInvoiceId}`)
}

function mapCoraStatusToOurs(status: string): 'PAGO' | 'ATRASADO' | 'PENDING' | null {
  switch (status?.toUpperCase()) {
    case 'PAID':
      return 'PAGO'
    case 'LATE':
      return 'ATRASADO'
    case 'CANCELLED':
      return 'PENDING'
    case 'OPEN':
    default:
      return null
  }
}

function getYearMonthFromPayload(payload: {
  due_date?: string
  occurrence_date?: string
}): { year: number; month: number } {
  const raw =
    payload.due_date ??
    payload.occurrence_date ??
    new Date().toISOString().slice(0, 10)
  const d = new Date(raw)
  if (Number.isNaN(d.getTime())) {
    const now = new Date()
    return { year: now.getFullYear(), month: now.getMonth() + 1 }
  }
  return { year: d.getFullYear(), month: d.getMonth() + 1 }
}

async function handleLegacyBodyWebhook(request: NextRequest): Promise<NextResponse> {
  const secret = process.env.CORA_WEBHOOK_SECRET
  const receivedSecret =
    request.headers.get('x-webhook-secret') ??
    request.headers.get('x-cora-webhook-secret') ??
    ''
  if (secret && receivedSecret !== secret) {
    return NextResponse.json({ ok: false, message: 'Não autorizado' }, { status: 401 })
  }

  const body = await request.json().catch(() => ({}))
  const id = body?.id ?? body?.invoice_id
  const code = body?.code ?? body?.external_id
  const statusRaw = body?.status ?? body?.invoice_status
  const total_paid = body?.total_paid ?? body?.totalPaid ?? 0
  const occurrence_date = body?.occurrence_date ?? body?.occurrenceDate ?? body?.paid_at
  const due_date = body?.due_date ?? body?.dueDate

  const newStatus = mapCoraStatusToOurs(statusRaw)
  if (newStatus === null) {
    return NextResponse.json({ ok: true, message: 'Status ignorado' }, { status: 200 })
  }

  if (!code || typeof code !== 'string') {
    return NextResponse.json({ ok: true, message: 'Payload sem code' }, { status: 200 })
  }

  const enrollment = await prisma.enrollment.findUnique({ where: { id: code } })
  if (!enrollment) {
    return NextResponse.json({ ok: true, message: 'Enrollment não encontrado' }, { status: 200 })
  }

  const { year, month } = getYearMonthFromPayload({
    due_date: due_date ?? undefined,
    occurrence_date: occurrence_date ?? undefined,
  })
  if (month < 1 || month > 12) {
    return NextResponse.json({ ok: true, message: 'Mês inválido' }, { status: 200 })
  }

  const existing = await prisma.enrollmentPaymentMonth.findUnique({
    where: { enrollmentId_year_month: { enrollmentId: code, year, month } },
    select: { paymentStatus: true },
  })
  const oldStatus = existing?.paymentStatus ?? null
  if (oldStatus === newStatus) {
    return NextResponse.json({ ok: true, message: 'Já processado' }, { status: 200 })
  }

  await prisma.enrollmentPaymentMonth.upsert({
    where: { enrollmentId_year_month: { enrollmentId: code, year, month } },
    create: { enrollmentId: code, year, month, paymentStatus: newStatus },
    update: { paymentStatus: newStatus },
  })

  if (id) {
    await prisma.coraInvoice.updateMany({
      where: { coraInvoiceId: id },
      data: newStatus === 'PAGO' ? { status: 'PAID', paidAt: new Date(), paidAmount: total_paid } : {},
    })
  }

  logFinanceAction({
    entityType: 'ENROLLMENT',
    entityId: code,
    action: newStatus === 'PAGO' ? 'PAYMENT_CONFIRMED' : 'PAYMENT_STATUS_CHANGED',
    oldValue: { paymentStatus: oldStatus },
    newValue: { paymentStatus: newStatus, year, month, paidAmount: total_paid },
    performedBy: 'WEBHOOK_CORA',
    metadata: { coraInvoiceId: id },
  }).catch(() => {})

  if (newStatus === 'PAGO') {
    const enrollmentCompleto = await prisma.enrollment.findUnique({
      where: { id: code },
      include: { user: { select: { email: true } }, paymentInfo: true },
    })
    if (enrollmentCompleto) {
      try {
        const valorMensalidade =
          enrollmentCompleto.valorMensalidade != null
            ? Number(enrollmentCompleto.valorMensalidade)
            : enrollmentCompleto.paymentInfo?.valorMensal != null
              ? Number(enrollmentCompleto.paymentInfo.valorMensal)
              : 0
        const amount = total_paid > 0 ? Number(total_paid) / 100 : valorMensalidade
        const paymentDate = occurrence_date ? new Date(occurrence_date) : new Date()
        await sendPaymentConfirmation(
          enrollmentCompleto,
          amount,
          paymentDate,
          year,
          month,
          process.env.NFSE_ENABLED === 'true'
        )
      } catch {
        /* ignore */
      }
      if (process.env.NFSE_ENABLED === 'true') {
        try {
          const finance = getEnrollmentFinanceData(enrollmentCompleto)
          const valorMensalidade =
            enrollmentCompleto.valorMensalidade != null
              ? Number(enrollmentCompleto.valorMensalidade)
              : enrollmentCompleto.paymentInfo?.valorMensal != null
                ? Number(enrollmentCompleto.paymentInfo.valorMensal)
                : null
          if ((finance.cpf || finance.cnpj) && valorMensalidade && valorMensalidade > 0) {
            await emitirNfseParaAluno({
              enrollmentId: code,
              studentName: finance.nome,
              cpf: finance.cpf || undefined,
              cnpj: finance.cnpj || undefined,
              email: finance.email || undefined,
              amount: valorMensalidade,
              year,
              month,
              alunoNome: enrollmentCompleto.nome,
              frequenciaSemanal: enrollmentCompleto.frequenciaSemanal ?? undefined,
              curso: enrollmentCompleto.curso ?? undefined,
              customDescricaoEmpresa: enrollmentCompleto.faturamentoDescricaoNfse ?? undefined,
            })
          }
        } catch {
          /* ignore */
        }
      }
    }
  }

  return NextResponse.json({ ok: true, enrollmentId: code, year, month, newStatus }, { status: 200 })
}
