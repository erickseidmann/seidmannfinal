/**
 * GET /api/admin/financeiro/cobrancas - Lista boletos Cora
 * POST /api/admin/financeiro/cobrancas - Gera boletos manualmente
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/auth'
import { generateBulkBilling } from '@/lib/cora/billing'

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
    const year = searchParams.get('year')
    const month = searchParams.get('month')
    const status = searchParams.get('status')

    const where: Record<string, unknown> = {}
    if (year) where.year = Number(year)
    if (month) where.month = Number(month)
    if (status) where.status = status

    const filterWhere = { ...where }
    const invoices = await prisma.coraInvoice.findMany({
      where: filterWhere,
      orderBy: [{ year: 'desc' }, { month: 'desc' }, { criadoEm: 'desc' }],
      take: 200,
      include: {
        enrollment: { select: { id: true, nome: true } },
      },
    })

    const now = new Date()
    const currentYear = now.getFullYear()
    const currentMonth = now.getMonth() + 1
    const counts = await prisma.coraInvoice.groupBy({
      by: ['status'],
      where: {
        year: currentYear,
        month: currentMonth,
      },
      _count: true,
    })

    const summary = {
      total: invoices.length,
      open: counts.find((c) => c.status === 'OPEN')?._count ?? 0,
      paid: counts.find((c) => c.status === 'PAID')?._count ?? 0,
      cancelled: counts.find((c) => c.status === 'CANCELLED')?._count ?? 0,
      late: counts.find((c) => c.status === 'LATE')?._count ?? 0,
      thisMonth: counts.reduce((s, c) => s + c._count, 0),
    }

    const data = invoices.map((inv) => ({
      id: inv.id,
      coraInvoiceId: inv.coraInvoiceId,
      enrollmentId: inv.enrollmentId,
      alunoNome: inv.enrollment.nome,
      year: inv.year,
      month: inv.month,
      amount: inv.amount,
      dueDate: inv.dueDate.toISOString(),
      status: inv.status,
      boletoUrl: inv.boletoUrl,
      pixCopyPaste: inv.pixCopyPaste,
      paidAt: inv.paidAt?.toISOString() ?? null,
      criadoEm: inv.criadoEm.toISOString(),
    }))

    return NextResponse.json({ ok: true, data, summary })
  } catch (error) {
    console.error('[api/admin/financeiro/cobrancas GET]', error)
    return NextResponse.json(
      { ok: false, message: 'Erro ao listar cobranças' },
      { status: 500 }
    )
  }
}

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
    const year = body.year ?? new Date().getFullYear()
    const month = body.month ?? new Date().getMonth() + 1

    const result = await generateBulkBilling({
      year,
      month,
      performedBy: auth.session?.sub ?? 'admin',
    })

    return NextResponse.json({
      ok: true,
      message: `${result.success} boletos gerados`,
      success: result.success,
      errors: result.errors,
    })
  } catch (error) {
    console.error('[api/admin/financeiro/cobrancas POST]', error)
    return NextResponse.json(
      { ok: false, message: 'Erro ao gerar boletos' },
      { status: 500 }
    )
  }
}
