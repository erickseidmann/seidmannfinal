/**
 * GET /api/admin/nfse/enrollments?q=nome
 * Lista matrículas ativas (ACTIVE) para seleção na emissão manual de NFSe.
 * q = filtro opcional por nome (case-insensitive).
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/auth'

const NFSE_ENABLED = process.env.NFSE_ENABLED === 'true'

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
    const q = searchParams.get('q')?.trim().toLowerCase()

    const enrollments = await prisma.enrollment.findMany({
      where: {
        status: 'ACTIVE',
        ...(q ? { nome: { contains: q } } : {}),
      },
      select: {
        id: true,
        nome: true,
        valorMensalidade: true,
        paymentInfo: { select: { valorMensal: true } },
      },
      orderBy: { nome: 'asc' },
      take: 100,
    })

    const lista = enrollments.map((e) => ({
      id: e.id,
      nome: e.nome,
      valorMensal:
        e.valorMensalidade != null
          ? Number(e.valorMensalidade)
          : e.paymentInfo?.valorMensal != null
            ? Number(e.paymentInfo.valorMensal)
            : null,
    }))

    return NextResponse.json({ ok: true, enrollments: lista })
  } catch (error) {
    console.error('[api/admin/nfse/enrollments GET]', error)
    return NextResponse.json(
      { ok: false, message: 'Erro ao listar matrículas' },
      { status: 500 }
    )
  }
}
