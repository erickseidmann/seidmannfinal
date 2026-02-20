/**
 * GET /api/student/financeiro/pix?year=YYYY&month=M
 * Retorna dados para pagamento PIX/boleto do mês (QR Code, copia e cola, boleto).
 * Usado pelo frontend para renderizar o componente de pagamento.
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireStudent } from '@/lib/auth'
import { getInvoice } from '@/lib/cora/client'

export async function GET(request: NextRequest) {
  try {
    const auth = await requireStudent(request)
    if (!auth.authorized || !auth.session) {
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

    const enrollment = await prisma.enrollment.findFirst({
      where: { userId: auth.session.userId, status: 'ACTIVE' },
      orderBy: { criadoEm: 'desc' },
    })

    if (!enrollment) {
      return NextResponse.json(
        { ok: false, message: 'Matrícula ativa não encontrada' },
        { status: 404 }
      )
    }

    const auditLogs = await prisma.financeAuditLog.findMany({
      where: {
        entityType: 'ENROLLMENT',
        entityId: enrollment.id,
        action: 'INVOICE_CREATED',
      },
      orderBy: { criadoEm: 'desc' },
    })
    const logWithMonth = auditLogs.find((log) => {
      const nv = log.newValue as { year?: number; month?: number; coraInvoiceId?: string } | null
      return nv?.year === year && nv?.month === month && nv?.coraInvoiceId
    })
    const coraInvoiceId = logWithMonth
      ? (logWithMonth.newValue as { coraInvoiceId?: string })?.coraInvoiceId ?? null
      : null

    if (!coraInvoiceId) {
      return NextResponse.json({
        ok: false,
        message: 'Nenhuma cobrança encontrada para este mês',
      })
    }

    let invoice
    try {
      invoice = await getInvoice(coraInvoiceId)
      console.log('[Cora PIX Debug] Invoice completa:', JSON.stringify(invoice, null, 2))
    } catch (err) {
      console.warn('[api/student/financeiro/pix GET] Erro ao buscar invoice na Cora:', err)
      return NextResponse.json(
        { ok: false, message: 'Não foi possível carregar os dados da cobrança. Tente mais tarde.' },
        { status: 502 }
      )
    }

    const opts = invoice.payment_options
    const totalAmount = invoice.total_amount ?? 0
    const invoiceAny = invoice as { due_date?: string; payment_terms?: { due_date?: string } }
    const dueDate =
      invoiceAny?.due_date ??
      invoiceAny?.payment_terms?.due_date ??
      null

    if (invoice.status === 'PAID') {
      const payments = invoice.payments ?? []
      const lastPayment = payments.length > 0
        ? payments.slice().sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0]
        : null
      return NextResponse.json({
        ok: true,
        paid: true,
        status: 'PAGO',
        paidAt: lastPayment?.created_at ?? null,
      })
    }

    return NextResponse.json({
      ok: true,
      paid: false,
      status: invoice.status,
      pixQrCode: opts?.pix?.qr_code ?? opts?.pix?.qr_code_url ?? null,
      pixCopiaECola: opts?.pix?.emv ?? null,
      boletoUrl: opts?.bank_slip?.url ?? null,
      boletoLinhaDigitavel: opts?.bank_slip?.digitable_line ?? null,
      valor: totalAmount / 100,
      vencimento: dueDate,
    })
  } catch (error) {
    console.error('[api/student/financeiro/pix GET]', error)
    return NextResponse.json(
      { ok: false, message: 'Erro ao carregar dados de pagamento' },
      { status: 500 }
    )
  }
}
