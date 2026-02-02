/**
 * GET /api/student/financeiro?year=YYYY&month=M
 * Dados financeiros do aluno logado (somente leitura): valor mensalidade, status por mês.
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireStudent } from '@/lib/auth'

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

    return NextResponse.json({
      ok: true,
      data: {
        valorMensal,
        statusMes,
        notaFiscalEmitida,
        diaPagamento,
        dataUltimoPagamento,
        metodoPagamento,
        year,
        month,
        enrollmentId: enrollment.id,
      },
    })
  } catch (error) {
    console.error('[api/student/financeiro GET]', error)
    return NextResponse.json(
      { ok: false, message: 'Erro ao carregar dados financeiros' },
      { status: 500 }
    )
  }
}
