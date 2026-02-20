/**
 * GET /api/admin/nfse/pending?year=2026&month=2
 * Lista alunos que serão incluídos na emissão em lote (PAGO no mês, sem NFSe autorizada).
 * Usado no modal "Emitir Notas do Mês" para exibir a lista com campo de observação por aluno.
 */

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/auth'
import { getEnrollmentFinanceData } from '@/lib/finance'

const NFSE_ENABLED = process.env.NFSE_ENABLED === 'true'

const querySchema = z.object({
  year: z.coerce.number().int().min(2000).max(2100),
  month: z.coerce.number().int().min(1).max(12),
})

export async function GET(request: NextRequest) {
  try {
    if (!NFSE_ENABLED) {
      return NextResponse.json({ enabled: false, message: 'NFSe desabilitada' })
    }

    const auth = await requireAdmin(request)
    if (!auth.authorized) {
      return NextResponse.json(
        { ok: false, message: auth.message || 'Não autorizado' },
        { status: auth.message?.includes('Não autenticado') ? 401 : 403 }
      )
    }

    const { searchParams } = new URL(request.url)
    const parsed = querySchema.safeParse({
      year: searchParams.get('year'),
      month: searchParams.get('month'),
    })
    if (!parsed.success) {
      return NextResponse.json(
        { ok: false, message: 'Parâmetros inválidos', details: parsed.error.flatten() },
        { status: 400 }
      )
    }
    const { year, month } = parsed.data

    const pagamentosPagos = await prisma.enrollmentPaymentMonth.findMany({
      where: { year, month, paymentStatus: 'PAGO' },
      include: {
        enrollment: {
          include: {
            user: { select: { email: true } },
            paymentInfo: true,
          },
        },
      },
    })

    const notasExistentes = await prisma.nfseInvoice.findMany({
      where: { year, month, status: 'autorizado', cancelledAt: null },
      select: { enrollmentId: true },
    })
    const enrollmentIdsComNota = new Set(notasExistentes.map((n) => n.enrollmentId))
    const pendentes = pagamentosPagos.filter((p) => p.enrollment && !enrollmentIdsComNota.has(p.enrollmentId))

    const lista = pendentes.map((p) => {
      const e = p.enrollment!
      const finance = getEnrollmentFinanceData(e)
      const valor =
        e.valorMensalidade != null
          ? Number(e.valorMensalidade)
          : e.paymentInfo?.valorMensal != null
            ? Number(e.paymentInfo.valorMensal)
            : null
      return {
        enrollmentId: e.id,
        nome: e.nome,
        valor: valor ?? 0,
      }
    })

    return NextResponse.json({
      ok: true,
      year,
      month,
      pendentes: lista,
    })
  } catch (error) {
    console.error('[api/admin/nfse/pending GET]', error)
    return NextResponse.json(
      { ok: false, message: 'Erro ao listar pendentes' },
      { status: 500 }
    )
  }
}
