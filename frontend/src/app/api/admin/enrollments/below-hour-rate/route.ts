/**
 * GET /api/admin/enrollments/below-hour-rate?max=35
 * Matrículas ativas com valor da hora-aula (PaymentInfo.valorHora) estritamente menor que o limite (padrão R$ 35).
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/auth'

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
    const maxRaw = searchParams.get('max')
    const max = maxRaw != null && maxRaw !== '' ? Number(maxRaw) : 35
    if (!Number.isFinite(max) || max <= 0) {
      return NextResponse.json({ ok: false, message: 'Parâmetro max inválido' }, { status: 400 })
    }

    const enrollments = await prisma.enrollment.findMany({
      where: {
        status: 'ACTIVE',
        paymentInfo: {
          valorHora: { not: null, lt: max },
        },
      },
      select: {
        id: true,
        nome: true,
        frequenciaSemanal: true,
        tempoAulaMinutos: true,
        paymentInfo: {
          select: { valorHora: true },
        },
      },
      orderBy: { nome: 'asc' },
    })

    const list = enrollments.map((e) => ({
      enrollmentId: e.id,
      studentName: e.nome,
      valorHora: e.paymentInfo?.valorHora != null ? Number(e.paymentInfo.valorHora) : null,
      tempoAulaMinutos: e.tempoAulaMinutos,
      frequenciaSemanal: e.frequenciaSemanal,
    }))

    return NextResponse.json({
      ok: true,
      data: {
        max,
        count: list.length,
        list,
      },
    })
  } catch (error) {
    console.error('[api/admin/enrollments/below-hour-rate GET]', error)
    return NextResponse.json(
      { ok: false, message: 'Erro ao carregar alunos fora do valor' },
      { status: 500 }
    )
  }
}
