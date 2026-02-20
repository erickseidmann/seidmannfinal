/**
 * API: GET /api/admin/financeiro/professores?year=YYYY&month=M
 * Lista professores ativos. Com year e month: período = esse mês para todos; status e valores vêm de TeacherPaymentMonth (como financeiro alunos).
 * Sem year/month: período e status vêm do cadastro do professor (periodoPagamentoInicio/Termino, periodoPagamentoPago).
 * Regra: o professor recebe por HORAS REGISTRADAS (LessonRecord), nunca pela estimativa (Lesson).
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/auth'
import {
  toDateKey,
  filterRecordsByPausedEnrollment,
  computeValorAPagar,
  type PaymentRecord,
} from '@/lib/finance'

function startOfDay(d: Date): Date {
  const x = new Date(d)
  x.setUTCHours(0, 0, 0, 0)
  return x
}

function endOfDay(d: Date): Date {
  const x = new Date(d)
  x.setUTCHours(23, 59, 59, 999)
  return x
}

function firstDayOfMonth(d: Date): Date {
  return startOfDay(new Date(d.getFullYear(), d.getMonth(), 1))
}

function lastDayOfMonth(d: Date): Date {
  return endOfDay(new Date(d.getFullYear(), d.getMonth() + 1, 0))
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
    const useMonthMode = year != null && month != null && month >= 1 && month <= 12

    const now = new Date()
    const defaultStart = firstDayOfMonth(now)
    const defaultEnd = lastDayOfMonth(now)

    let periodStart = defaultStart
    let periodEnd = defaultEnd
    if (useMonthMode) {
      periodStart = startOfDay(new Date(year!, month! - 1, 1))
      periodEnd = lastDayOfMonth(new Date(year!, month! - 1, 1))
    }

    const teacherSelect = {
      id: true,
      nome: true,
      valorPorHora: true,
      metodoPagamento: true,
      infosPagamento: true,
      periodoPagamentoInicio: true,
      periodoPagamentoTermino: true,
      periodoPagamentoPago: true,
      valorPorPeriodo: true,
      valorExtra: true,
      _count: { select: { financeObservations: true } },
      ...(useMonthMode && {
        paymentMonths: { where: { year: year!, month: month! }, take: 1 },
      }),
    } as const

    const teachers = await prisma.teacher.findMany({
      where: { status: 'ACTIVE' },
      select: teacherSelect,
      orderBy: { nome: 'asc' },
    })

    const lessonRecord = (prisma as { lessonRecord?: { findMany: (args: unknown) => Promise<unknown[]> } }).lessonRecord
    if (!lessonRecord?.findMany) {
      return NextResponse.json(
        { ok: false, message: 'Modelo LessonRecord não disponível. Rode: npx prisma generate' },
        { status: 503 }
      )
    }

    let globalStart = periodStart.getTime()
    let globalEnd = periodEnd.getTime()
    const teacherPeriods: { id: string; start: number; end: number }[] = []

    if (!useMonthMode) {
      for (const t of teachers) {
        const start = t.periodoPagamentoInicio ? startOfDay(t.periodoPagamentoInicio).getTime() : defaultStart.getTime()
        const end = t.periodoPagamentoTermino ? endOfDay(t.periodoPagamentoTermino).getTime() : defaultEnd.getTime()
        if (start < globalStart) globalStart = start
        if (end > globalEnd) globalEnd = end
        teacherPeriods.push({ id: t.id, start, end })
      }
    } else {
      globalStart = periodStart.getTime()
      globalEnd = periodEnd.getTime()
      for (const t of teachers) {
        const pm = 'paymentMonths' in t && Array.isArray(t.paymentMonths) && t.paymentMonths[0]
          ? (t.paymentMonths[0] as { periodoInicio: Date | null; periodoTermino: Date | null })
          : null
        const start = pm?.periodoInicio ? startOfDay(pm.periodoInicio).getTime() : globalStart
        const end = pm?.periodoTermino ? endOfDay(pm.periodoTermino).getTime() : globalEnd
        if (start < globalStart) globalStart = start
        if (end > globalEnd) globalEnd = end
        teacherPeriods.push({ id: t.id, start, end })
      }
    }

    const globalStartDate = new Date(globalStart)
    const globalEndDate = new Date(globalEnd)

    const startKey = toDateKey(globalStartDate)
    const endKey = toDateKey(globalEndDate)
    const holidayRows = await prisma.holiday.findMany({
      where: { dateKey: { gte: startKey, lte: endKey } },
      select: { dateKey: true },
    })
    const holidaySet = new Set(holidayRows.map((h) => h.dateKey))

    // Aulas canceladas não entram no cálculo de pagamento (apenas CONFIRMED)
    const lessonsInRange = await prisma.lesson.findMany({
      where: {
        startAt: { gte: globalStartDate, lte: globalEndDate },
        status: 'CONFIRMED',
      },
      select: {
        id: true,
        teacherId: true,
        startAt: true,
        durationMinutes: true,
      },
    })

    // Registros de aula cancelada não contam para pagamento
    // Também não contam aulas de alunos PAUSED a partir da data em que foram pausados
    const recordsInRange = await (prisma as any).lessonRecord.findMany({
      where: {
        lesson: {
          teacherId: { in: teachers.map((t) => t.id) },
          startAt: { gte: globalStartDate, lte: globalEndDate },
          enrollment: {
            OR: [
              { status: { not: 'PAUSED' } },
              { pausedAt: null },
            ],
          },
        },
        status: 'CONFIRMED',
      },
      select: {
        tempoAulaMinutos: true,
        lesson: {
          select: {
            teacherId: true,
            startAt: true,
            durationMinutes: true,
            enrollment: {
              select: {
                status: true,
                pausedAt: true,
              },
            },
          },
        },
      },
    })

    const filteredRecords = filterRecordsByPausedEnrollment(recordsInRange as PaymentRecord[])

    const list = teachers.map((t) => {
      const period = teacherPeriods.find((p) => p.id === t.id)!
      const valorPorHora = t.valorPorHora != null ? Number(t.valorPorHora) : 0
      const pm = useMonthMode && 'paymentMonths' in t && Array.isArray(t.paymentMonths) && t.paymentMonths[0]
        ? (t.paymentMonths[0] as { paymentStatus: string | null; valorPorPeriodo: unknown; valorExtra: unknown; periodoInicio: Date | null; periodoTermino: Date | null; teacherConfirmedAt: Date | null })
        : null

      const valorPorPeriodo = useMonthMode && pm?.valorPorPeriodo != null
        ? Number(pm.valorPorPeriodo)
        : (t.valorPorPeriodo != null ? Number(t.valorPorPeriodo) : 0)
      const valorExtra = useMonthMode && pm?.valorExtra != null
        ? Number(pm.valorExtra)
        : (t.valorExtra != null ? Number(t.valorExtra) : 0)
      const statusPagamento = useMonthMode && pm?.paymentStatus === 'PAGO'
        ? 'PAGO'
        : (useMonthMode ? 'EM_ABERTO' : (t.periodoPagamentoPago ? 'PAGO' : 'EM_ABERTO'))

      const { totalHorasRegistradas, valorAPagar } = computeValorAPagar({
        records: filteredRecords,
        teacherId: t.id,
        periodStart: period.start,
        periodEnd: period.end,
        holidaySet,
        valorPorHora,
        valorPorPeriodo,
        valorExtra,
      })
      const valorHoras = Math.round(totalHorasRegistradas * valorPorHora * 100) / 100

      let totalMinutosEstimados = 0
      let totalRegistrosEsperados = 0
      for (const l of lessonsInRange) {
        if (l.teacherId !== t.id) continue
        const startAt = new Date(l.startAt).getTime()
        if (startAt < period.start || startAt > period.end) continue
        if (holidaySet.has(toDateKey(l.startAt))) continue
        totalRegistrosEsperados += 1
        totalMinutosEstimados += l.durationMinutes ?? 60
      }
      const totalHorasEstimadas = Math.round((totalMinutosEstimados / 60) * 100) / 100

      const dataInicioISO = new Date(period.start).toISOString().slice(0, 10)
      const dataTerminoISO = new Date(period.end).toISOString().slice(0, 10)

      return {
        id: t.id,
        nome: t.nome,
        valorPorHora,
        dataInicio: dataInicioISO,
        dataTermino: dataTerminoISO,
        totalHorasEstimadas,
        totalHorasRegistradas,
        totalRegistrosEsperados,
        valorPorHoras: valorHoras,
        valorPorPeriodo,
        valorExtra,
        valorAPagar,
        metodoPagamento: t.metodoPagamento ?? null,
        infosPagamento: t.infosPagamento ?? null,
        statusPagamento: statusPagamento as 'PAGO' | 'EM_ABERTO',
        pagamentoProntoParaFazer: !!(pm?.teacherConfirmedAt),
        hasFinanceObservations: ((t as { _count?: { financeObservations: number } })._count?.financeObservations ?? 0) > 0,
      }
    })

    return NextResponse.json({
      ok: true,
      data: {
        professores: list,
        year: useMonthMode ? year : null,
        month: useMonthMode ? month : null,
      },
    })
  } catch (error) {
    console.error('[api/admin/financeiro/professores GET]', error)
    return NextResponse.json(
      { ok: false, message: 'Erro ao listar financeiro dos professores' },
      { status: 500 }
    )
  }
}
