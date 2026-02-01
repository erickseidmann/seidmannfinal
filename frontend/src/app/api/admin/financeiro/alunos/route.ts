/**
 * GET /api/admin/financeiro/alunos
 * Lista matrículas (alunos) com dados financeiros para a tabela Financeiro – Alunos.
 * Calcula data do próximo pagamento a partir de dia de vencimento (1-31) quando dueDate não existe.
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/auth'

/** Retorna a próxima data de vencimento dado o dia do mês (1-31). Se o dia já passou neste mês, retorna o mês que vem. */
function nextDueDateFromDay(dayOfMonth: number, afterDate?: Date): Date {
  const after = afterDate ?? new Date()
  const year = after.getFullYear()
  const month = after.getMonth()
  const safeDay = Math.min(dayOfMonth, new Date(year, month + 1, 0).getDate())
  const candidate = new Date(year, month, safeDay)
  if (candidate > after) return candidate
  const nextSafe = Math.min(dayOfMonth, new Date(year, month + 2, 0).getDate())
  return new Date(year, month + 1, nextSafe)
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
    const year = yearParam ? parseInt(yearParam, 10) : null
    const month = monthParam ? parseInt(monthParam, 10) : null
    const hasMonthFilter = year != null && month != null && month >= 1 && month <= 12

    const enrollments = await prisma.enrollment.findMany({
      orderBy: { nome: 'asc' },
      include: {
        paymentInfo: true,
        paymentMonths: hasMonthFilter
          ? { where: { year, month }, take: 1 }
          : false,
      },
    })

    const today = new Date()
    today.setHours(0, 0, 0, 0)

    // Valor por hora = valor mensal ÷ total de horas do mês.
    // Total de horas do mês = (frequência semanal × duração da aula em min) × 4 semanas ÷ 60.
    const WEEKS_PER_MONTH = 4

    const rows = enrollments.map((e) => {
      const pi = e.paymentInfo
      const pm = hasMonthFilter && e.paymentMonths && 'length' in e.paymentMonths ? (e.paymentMonths as { paymentStatus: string | null; notaFiscalEmitida: boolean | null }[])[0] : null
      const valorMensal = e.valorMensalidade != null ? Number(e.valorMensalidade) : null
      const valorMensalPi = pi?.valorMensal != null ? Number(pi.valorMensal) : null
      const freq = e.frequenciaSemanal ?? 0
      const mins = e.tempoAulaMinutos ?? 0
      const totalMinutesMes = freq * mins * WEEKS_PER_MONTH
      const totalHorasMes = totalMinutesMes > 0 ? totalMinutesMes / 60 : 0
      const valorHora =
        (valorMensal ?? valorMensalPi) != null && totalHorasMes > 0
          ? (valorMensal ?? valorMensalPi)! / totalHorasMes
          : null
      const dueDate = pi?.dueDate
      const diaPagamento = e.diaPagamento ?? pi?.dueDay ?? null
      let dataProximoPagamento: string | null = dueDate ? dueDate.toISOString() : null
      if (!dataProximoPagamento && diaPagamento != null && diaPagamento >= 1 && diaPagamento <= 31) {
        const ref = pi?.paidAt ?? today
        dataProximoPagamento = nextDueDateFromDay(diaPagamento, ref).toISOString()
      }
      return {
        id: e.id,
        nome: e.nome,
        tipoAula: e.tipoAula ?? null,
        nomeGrupo: e.nomeGrupo ?? null,
        nomeResponsavel: e.nomeResponsavel ?? null,
        quemPaga: pi?.quemPaga ?? null,
        valorMensal: valorMensal ?? valorMensalPi ?? null,
        valorHora: valorHora,
        dataPagamento: pi?.dataPagamento?.toISOString() ?? null,
        status: hasMonthFilter && pm ? pm.paymentStatus ?? null : pi?.paymentStatus ?? null,
        enrollmentStatus: e.status,
        inactiveAt: e.inactiveAt?.toISOString() ?? null,
        metodoPagamento: e.metodoPagamento ?? pi?.metodo ?? null,
        banco: pi?.banco ?? null,
        periodoPagamento: pi?.periodoPagamento ?? null,
        dataUltimoPagamento: pi?.paidAt?.toISOString() ?? null,
        dataProximoPagamento,
        diaPagamento: diaPagamento ?? null,
        notaFiscalEmitida: hasMonthFilter && pm ? (pm.notaFiscalEmitida ?? null) : pi?.notaFiscalEmitida ?? null,
        email: e.email,
        paymentInfoId: pi?.id ?? null,
      }
    })

    return NextResponse.json({ ok: true, data: { alunos: rows } })
  } catch (error) {
    console.error('[api/admin/financeiro/alunos GET]', error)
    return NextResponse.json(
      { ok: false, message: 'Erro ao listar alunos financeiro' },
      { status: 500 }
    )
  }
}
