/**
 * POST /api/admin/financeiro/cobranca
 * Gera cobranças na Cora (individual ou em lote).
 *
 * GET /api/admin/financeiro/cobranca?year=2024&month=12
 * Consulta status das cobranças de um mês.
 */

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/auth'
import { generateMonthlyBilling, generateBulkBilling } from '@/lib/cora/billing'
import { getInvoice } from '@/lib/cora/client'

const createBillingSchema = z.object({
  enrollmentId: z.string().optional(),
  year: z.coerce.number().int().min(2020).max(2100),
  month: z.coerce.number().int().min(1).max(12),
})

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAdmin(request)
    if (!auth.authorized) {
      return NextResponse.json(
        { ok: false, message: auth.message || 'Não autorizado' },
        { status: auth.message?.includes('Não autenticado') ? 401 : 403 }
      )
    }

    const body = await request.json().catch(() => ({}))
    const parsed = createBillingSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { ok: false, message: 'Dados inválidos', details: parsed.error.flatten() },
        { status: 400 }
      )
    }

    const { enrollmentId, year, month } = parsed.data
    const performedBy = auth.session?.sub ?? 'SYSTEM'

    const hasCert = !!(process.env.CORA_CERT_PATH || process.env.CORA_CERTIFICATE_PATH)
    const hasKey = !!(process.env.CORA_KEY_PATH || process.env.CORA_PRIVATE_KEY_PATH)
    if (!process.env.CORA_CLIENT_ID || !hasCert || !hasKey) {
      return NextResponse.json(
        { ok: false, message: 'Cora não configurada. Configure CORA_CLIENT_ID, CORA_CERTIFICATE_PATH e CORA_PRIVATE_KEY_PATH no servidor.' },
        { status: 503 }
      )
    }

    if (enrollmentId) {
      const result = await generateMonthlyBilling({
        enrollmentId,
        year,
        month,
        performedBy,
      })
      return NextResponse.json({
        ok: true,
        invoice: {
          id: result.invoice.id,
          status: result.invoice.status,
          qrCode: result.invoice.payment_options?.pix?.qr_code,
          qrCodeUrl: result.invoice.payment_options?.pix?.qr_code_url,
          barcode: result.invoice.payment_options?.bank_slip?.barcode,
          digitableLine: result.invoice.payment_options?.bank_slip?.digitable_line,
        },
        enrollmentPaymentMonth: result.enrollmentPaymentMonth,
      })
    } else {
      const result = await generateBulkBilling({
        year,
        month,
        performedBy,
      })
      return NextResponse.json({
        ok: true,
        success: result.success,
        errors: result.errors,
        total: result.success + result.errors.length,
      })
    }
  } catch (error) {
    console.error('=== ERRO COBRANCA ===')
    console.error('Message:', (error as Error)?.message)
    console.error('Stack:', (error as Error)?.stack)
    console.error('Full error:', JSON.stringify(error, Object.getOwnPropertyNames(error || {}), 2))
    return NextResponse.json(
      {
        ok: false,
        message: error instanceof Error ? error.message : 'Erro ao gerar cobrança',
      },
      { status: 500 }
    )
  }
}

function isCoraConfigured(): boolean {
  const hasCert = !!(process.env.CORA_CERT_PATH || process.env.CORA_CERTIFICATE_PATH)
  const hasKey = !!(process.env.CORA_KEY_PATH || process.env.CORA_PRIVATE_KEY_PATH)
  return !!(process.env.CORA_CLIENT_ID && hasCert && hasKey)
}

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAdmin(request)
    if (!auth.authorized) {
      return NextResponse.json(
        { ok: false, message: auth.message || 'Não autorizado' },
        { status: auth.message?.includes('Não autenticado') ? 401 : 403 }
      )
    }

    const { searchParams } = new URL(request.url)
    const yearParam = searchParams.get('year')
    const monthParam = searchParams.get('month')

    if (!yearParam || !monthParam) {
      return NextResponse.json(
        { ok: false, message: 'Parâmetros year e month são obrigatórios' },
        { status: 400 }
      )
    }

    const year = parseInt(yearParam, 10)
    const month = parseInt(monthParam, 10)

    if (isNaN(year) || isNaN(month) || month < 1 || month > 12) {
      return NextResponse.json(
        { ok: false, message: 'Ano ou mês inválido' },
        { status: 400 }
      )
    }

    const paymentMonths = await prisma.enrollmentPaymentMonth.findMany({
      where: { year, month },
      include: {
        enrollment: {
          select: {
            id: true,
            nome: true,
            valorMensalidade: true,
            paymentInfo: { select: { valorMensal: true, dueDay: true, dueDate: true } },
          },
        },
      },
    })

    const results = await Promise.allSettled(
      paymentMonths.map(async (pm) => {
        const enrollment = pm.enrollment
        const valorMensalidade =
          Number(enrollment.valorMensalidade) ||
          Number(enrollment.paymentInfo?.valorMensal) ||
          0

        const dueDate =
          enrollment.paymentInfo?.dueDate?.toISOString().slice(0, 10) ??
          `${year}-${String(month).padStart(2, '0')}-${String(enrollment.paymentInfo?.dueDay ?? 10).padStart(2, '0')}`

        const auditLogs = await prisma.financeAuditLog.findMany({
          where: {
            entityType: 'ENROLLMENT',
            entityId: enrollment.id,
            action: 'INVOICE_CREATED',
          },
          orderBy: { criadoEm: 'desc' },
        })

        const logWithYear = auditLogs.find((log) => {
          const nv = log.newValue as { year?: number; month?: number; coraInvoiceId?: string } | null
          const meta = log.metadata as { coraInvoiceId?: string } | null
          const match = nv?.year === year && nv?.month === month
          return match && (nv?.coraInvoiceId ?? meta?.coraInvoiceId)
        })

        const nv = logWithYear?.newValue as { coraInvoiceId?: string } | null
        const meta = logWithYear?.metadata as { coraInvoiceId?: string } | null
        const coraInvoiceId = nv?.coraInvoiceId ?? meta?.coraInvoiceId ?? null

        let invoiceData: {
          status?: string
          pixQrCode?: string
          pixQrCodeUrl?: string
          barcode?: string
          digitableLine?: string
          boletoUrl?: string
          paidAt?: string
          paymentMethod?: string
        } | null = null

        if (coraInvoiceId && isCoraConfigured()) {
          try {
            const invoice = await getInvoice(coraInvoiceId)
            console.log('[Cora Cobranca Debug] Invoice:', JSON.stringify(invoice, null, 2))
            const payments = invoice.payments ?? []
            const lastPayment = payments.length > 0
              ? payments.slice().sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0]
              : null
            invoiceData = {
              status: invoice.status,
              pixQrCode: invoice.payment_options?.pix?.qr_code ?? invoice.payment_options?.pix?.emv,
              pixQrCodeUrl: invoice.payment_options?.pix?.qr_code_url,
              barcode: invoice.payment_options?.bank_slip?.barcode,
              digitableLine: invoice.payment_options?.bank_slip?.digitable_line,
              boletoUrl: invoice.payment_options?.bank_slip?.url,
              paidAt: lastPayment?.created_at ?? null,
              paymentMethod: lastPayment?.payment_method ?? null,
            }
          } catch (error) {
            console.warn(
              `[api/admin/financeiro/cobranca GET] Erro ao buscar invoice ${coraInvoiceId}:`,
              error
            )
          }
        }

        return {
          enrollmentId: enrollment.id,
          nome: enrollment.nome,
          status: pm.paymentStatus,
          valorMensalidade,
          dueDate,
          pixQrCode: invoiceData?.pixQrCode ?? null,
          pixQrCodeUrl: invoiceData?.pixQrCodeUrl ?? null,
          barcode: invoiceData?.barcode ?? null,
          digitableLine: invoiceData?.digitableLine ?? null,
          boletoUrl: invoiceData?.boletoUrl ?? null,
          paidAt: invoiceData?.paidAt ?? null,
          paymentMethod: invoiceData?.paymentMethod ?? null,
          coraInvoiceId,
          coraStatus: invoiceData?.status ?? null,
        }
      })
    )

    const data = results
      .filter((r): r is PromiseFulfilledResult<any> => r.status === 'fulfilled')
      .map((r) => r.value)

    return NextResponse.json({
      ok: true,
      year,
      month,
      total: data.length,
      data,
    })
  } catch (error) {
    console.error('[api/admin/financeiro/cobranca GET]', error)
    return NextResponse.json(
      {
        ok: false,
        message: error instanceof Error ? error.message : 'Erro ao consultar cobranças',
      },
      { status: 500 }
    )
  }
}
