/**
 * Webhook Cora: notificações de pagamento (boleto/PIX).
 * Refatorado para reconcilePayment + confirmEnrollmentPayment.
 * TODO: validação de assinatura/HMAC.
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { logFinanceAction } from '@/lib/finance'
import {
  reconcilePayment,
  confirmEnrollmentPayment,
  buildNormalizedPaymentFromCoraInvoicePaid,
  isCoraHeaderWebhook,
  readCoraWebhookHeaders,
  normalizeCoraFromBody,
} from '@/lib/payments'

export async function GET() {
  return NextResponse.json({
    status: 'ok',
    message: 'Webhook Cora ativo',
  })
}

export async function POST(request: NextRequest) {
  try {
    if (isCoraHeaderWebhook(request)) {
      return handleCoraHeaderWebhook(request)
    }
    return handleLegacyBodyWebhook(request)
  } catch (error) {
    console.error('[webhooks/cora]', error)
    return NextResponse.json({ success: true }, { status: 200 })
  }
}

async function handleCoraHeaderWebhook(request: NextRequest): Promise<NextResponse> {
  const { eventId, eventType, resourceId } = readCoraWebhookHeaders(request)

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
      case 'invoice.paid': {
        const np = await buildNormalizedPaymentFromCoraInvoicePaid(resourceId)
        if (np) {
          await reconcilePayment(np)
        }
        break
      }
      case 'invoice.registered':
        await prisma.coraInvoice.updateMany({
          where: { coraInvoiceId: resourceId },
          data: { status: 'OPEN' },
        })
        console.log(`[Cora] Boleto registrado: ${resourceId}`)
        break
      case 'invoice.cancelled':
        await prisma.coraInvoice.updateMany({
          where: { coraInvoiceId: resourceId },
          data: { status: 'CANCELLED' },
        })
        console.log(`[Cora] Boleto cancelado: ${resourceId}`)
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
      // ignorar falha ao registrar idempotência do evento
    }
  }

  return NextResponse.json({ success: true }, { status: 200 })
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

  if (newStatus === 'PAGO' && id && typeof id === 'string') {
    const np =
      (await buildNormalizedPaymentFromCoraInvoicePaid(id)) ??
      normalizeCoraFromBody({
        ...body,
        provider_payment_id: id,
        amount: total_paid,
        paid_at: occurrence_date,
      })
    if (np) {
      try {
        await reconcilePayment(np)
        return NextResponse.json({ ok: true }, { status: 200 })
      } catch (err) {
        console.error('[Cora legacy] reconcile:', err)
      }
    }
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
  if (oldStatus === 'PAGO' && newStatus !== 'PAGO') {
    return NextResponse.json({ ok: true, message: 'Status já está PAGO; atualização ignorada' }, { status: 200 })
  }
  if (oldStatus === newStatus) {
    return NextResponse.json({ ok: true, message: 'Já processado' }, { status: 200 })
  }

  if (newStatus === 'PAGO') {
    const paymentDate = occurrence_date ? new Date(occurrence_date) : new Date()
    const paidCents =
      typeof total_paid === 'number' && total_paid > 0
        ? Math.round(total_paid)
        : undefined
    await confirmEnrollmentPayment({
      enrollmentId: code,
      year,
      month,
      paidAt: paymentDate,
      source: 'CORA_LEGACY_WEBHOOK',
      paidAmountCents: paidCents,
      coraInvoiceExternalId: typeof id === 'string' ? id : undefined,
    })
    return NextResponse.json({ ok: true, enrollmentId: code, year, month, newStatus }, { status: 200 })
  }

  await prisma.enrollmentPaymentMonth.upsert({
    where: { enrollmentId_year_month: { enrollmentId: code, year, month } },
    create: { enrollmentId: code, year, month, paymentStatus: newStatus },
    update: { paymentStatus: newStatus },
  })

  if (id) {
    await prisma.coraInvoice.updateMany({
      where: { coraInvoiceId: id },
      data: {},
    })
  }

  logFinanceAction({
    entityType: 'ENROLLMENT',
    entityId: code,
    action: 'PAYMENT_STATUS_CHANGED',
    oldValue: { paymentStatus: oldStatus },
    newValue: { paymentStatus: newStatus, year, month },
    performedBy: 'WEBHOOK_CORA',
    metadata: { coraInvoiceId: id },
  }).catch(() => {})

  return NextResponse.json({ ok: true, enrollmentId: code, year, month, newStatus }, { status: 200 })
}
