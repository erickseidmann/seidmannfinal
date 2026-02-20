/**
 * GET /api/admin/financeiro/cora-usage?year=YYYY&month=M
 * Retorna estimativa de gastos Cora (sistema de cobrança) no mês.
 * Usa CORA_ESTIMATED_MONTHLY (env) ou conta INVOICE_CREATED no audit log * taxa estimada.
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/auth'

const FEE_PER_INVOICE = 2.5 // R$ estimado por cobrança (boleto/PIX)

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAdmin(request)
    if (!auth.authorized) {
      return NextResponse.json(
        { ok: false, message: auth.message || 'Não autorizado' },
        { status: auth.message?.includes('Não autenticado') ? 401 : 403 }
      )
    }

    const fromEnv = process.env.CORA_ESTIMATED_MONTHLY
    if (fromEnv != null && fromEnv !== '') {
      const val = parseFloat(fromEnv.replace(',', '.'))
      if (!Number.isNaN(val) && val >= 0) {
        return NextResponse.json({
          ok: true,
          data: { totalCents: Math.round(val * 100), source: 'env' },
        })
      }
    }

    const { searchParams } = new URL(request.url)
    const yearParam = searchParams.get('year')
    const monthParam = searchParams.get('month')
    const year = yearParam ? parseInt(yearParam, 10) : new Date().getFullYear()
    const month = monthParam ? parseInt(monthParam, 10) : new Date().getMonth() + 1
    if (Number.isNaN(year) || Number.isNaN(month) || month < 1 || month > 12) {
      return NextResponse.json({
        ok: true,
        data: { totalCents: 0, invoiceCount: 0, source: 'estimate' },
      })
    }

    const start = new Date(year, month - 1, 1)
    const end = new Date(year, month, 0, 23, 59, 59, 999)

    const count = await prisma.financeAuditLog.count({
      where: {
        action: 'INVOICE_CREATED',
        criadoEm: { gte: start, lte: end },
      },
    })

    const totalCents = Math.round(count * FEE_PER_INVOICE * 100)

    return NextResponse.json({
      ok: true,
      data: { totalCents, invoiceCount: count, source: 'estimate' },
    })
  } catch (error) {
    console.error('[api/admin/financeiro/cora-usage GET]', error)
    return NextResponse.json(
      { ok: false, message: 'Erro ao obter uso Cora' },
      { status: 500 }
    )
  }
}
