/**
 * GET /api/student/financeiro?year=YYYY&month=M
 * Dados financeiros do aluno logado (somente leitura): valor mensalidade, status por mês.
 * Inclui dados da Cora (PIX/boleto) para o mês consultado quando existir cobrança.
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

    const enrollment = await prisma.enrollment.findFirst({
      where: { userId: auth.session.userId, status: 'ACTIVE' },
      orderBy: { criadoEm: 'desc' },
      include: { paymentInfo: true, paymentMonths: true },
    })

    if (!enrollment) {
      return NextResponse.json(
        { ok: false, message: 'Matrícula ativa não encontrada' },
        { status: 404 }
      )
    }

    const { searchParams } = new URL(request.url)
    const yearParam = searchParams.get('year')
    const monthParam = searchParams.get('month')
    const year = yearParam ? parseInt(yearParam, 10) : new Date().getFullYear()
    const month = monthParam ? parseInt(monthParam, 10) : new Date().getMonth() + 1

    const pi = enrollment.paymentInfo
    const valorMensal = enrollment.valorMensalidade != null
      ? Number(enrollment.valorMensalidade)
      : (pi?.valorMensal != null ? Number(pi.valorMensal) : pi?.monthlyValue != null ? Number(pi.monthlyValue) : null)

    const monthRecord = enrollment.paymentMonths.find((pm) => pm.year === year && pm.month === month)
    const statusMes = monthRecord?.paymentStatus ?? null
    const notaFiscalEmitida = monthRecord?.notaFiscalEmitida ?? null

    const diaPagamento = enrollment.diaPagamento ?? pi?.dueDay ?? null
    const dataUltimoPagamento = pi?.paidAt?.toISOString() ?? null
    const metodoPagamento = enrollment.metodoPagamento ?? (pi?.metodo ?? null)

    const data: {
      valorMensal: number | null
      statusMes: string | null
      notaFiscalEmitida: boolean | null
      diaPagamento: number | null
      dataUltimoPagamento: string | null
      metodoPagamento: string | null
      year: number
      month: number
      enrollmentId: string
      cora: {
        invoiceId: string
        status: string
        pixQrCode: string | null
        pixCopiaECola: string | null
        boletoLinhaDigitavel: string | null
        boletoPdfUrl: string | null
      } | null
    } = {
      valorMensal,
      statusMes,
      notaFiscalEmitida,
      diaPagamento,
      dataUltimoPagamento,
      metodoPagamento,
      year,
      month,
      enrollmentId: enrollment.id,
      cora: null,
    }

    if (process.env.CORA_CLIENT_ID) {
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

      if (coraInvoiceId) {
        try {
          const invoice = await getInvoice(coraInvoiceId)
          const opts = invoice.payment_options
          data.cora = {
            invoiceId: invoice.id,
            status: invoice.status,
            pixQrCode: opts?.pix?.qr_code ?? opts?.pix?.qr_code_url ?? null,
            pixCopiaECola: opts?.pix?.emv ?? null,
            boletoLinhaDigitavel: opts?.bank_slip?.digitable_line ?? null,
            boletoPdfUrl: opts?.bank_slip?.url ?? null,
          }
        } catch (err) {
          console.warn('[api/student/financeiro GET] Erro ao buscar invoice Cora:', err)
          data.cora = null
        }
      }
    }

    return NextResponse.json({
      ok: true,
      data,
    })
  } catch (error) {
    console.error('[api/student/financeiro GET]', error)
    return NextResponse.json(
      { ok: false, message: 'Erro ao carregar dados financeiros' },
      { status: 500 }
    )
  }
}
