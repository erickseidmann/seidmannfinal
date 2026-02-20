/**
 * GET /api/professor/financeiro?year=YYYY&month=M
 * Dados financeiros do professor logado (somente leitura). Mesma lógica do admin mas para um único professor.
 *
 * Regra: o professor recebe por HORAS REGISTRADAS (registros de aula), nunca pela estimativa (aulas agendadas).
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireTeacher } from '@/lib/auth'
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
    const auth = await requireTeacher(request)
    if (!auth.authorized || !auth.session) {
      return NextResponse.json(
        { ok: false, message: auth.message || 'Não autorizado' },
        { status: auth.message?.includes('Não autenticado') ? 401 : 403 }
      )
    }

    const teacher = await prisma.teacher.findFirst({
      where: { userId: auth.session.userId },
      select: {
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
      },
    })
    if (!teacher) {
      return NextResponse.json(
        { ok: false, message: 'Professor não encontrado' },
        { status: 404 }
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
    let valorPorPeriodo = teacher.valorPorPeriodo != null ? Number(teacher.valorPorPeriodo) : 0
    let valorExtra = teacher.valorExtra != null ? Number(teacher.valorExtra) : 0
    let statusPagamento: 'PAGO' | 'EM_ABERTO' = teacher.periodoPagamentoPago ? 'PAGO' : 'EM_ABERTO'

    let teacherConfirmedAt: string | null = null
    let proofSentAt: string | null = null
    if (useMonthMode) {
      periodStart = startOfDay(new Date(year!, month! - 1, 1))
      periodEnd = lastDayOfMonth(new Date(year!, month! - 1, 1))
      const pm = await prisma.teacherPaymentMonth.findUnique({
        where: { teacherId_year_month: { teacherId: teacher.id, year: year!, month: month! } },
      })
      if (pm) {
        if (pm.periodoInicio) periodStart = startOfDay(pm.periodoInicio)
        if (pm.periodoTermino) periodEnd = endOfDay(pm.periodoTermino)
        if (pm.valorPorPeriodo != null) valorPorPeriodo = Number(pm.valorPorPeriodo)
        if (pm.valorExtra != null) valorExtra = Number(pm.valorExtra)
        statusPagamento = pm.paymentStatus === 'PAGO' ? 'PAGO' : 'EM_ABERTO'
        if (pm.teacherConfirmedAt) teacherConfirmedAt = pm.teacherConfirmedAt.toISOString()
        if (pm.proofSentAt) proofSentAt = pm.proofSentAt.toISOString()
      }
    } else {
      if (teacher.periodoPagamentoInicio) periodStart = startOfDay(teacher.periodoPagamentoInicio)
      if (teacher.periodoPagamentoTermino) periodEnd = endOfDay(teacher.periodoPagamentoTermino)
    }

    const periodStartTime = periodStart.getTime()
    const periodEndTime = periodEnd.getTime()
    const startKey = toDateKey(periodStart)
    const endKey = toDateKey(periodEnd)

    const holidayRows = await prisma.holiday.findMany({
      where: { dateKey: { gte: startKey, lte: endKey } },
      select: { dateKey: true },
    })
    const holidaySet = new Set(holidayRows.map((h) => h.dateKey))

    const lessonsInRange = await prisma.lesson.findMany({
      where: {
        teacherId: teacher.id,
        startAt: { gte: periodStart, lte: periodEnd },
        status: 'CONFIRMED',
      },
      select: { id: true, startAt: true, durationMinutes: true },
    })

    const lessonRecord = (prisma as { lessonRecord?: { findMany: (args: unknown) => Promise<unknown[]> } }).lessonRecord
    let recordsInRange: { tempoAulaMinutos: number | null; lesson: { startAt: Date; durationMinutes: number; enrollment: { status: string; pausedAt: Date | null } } }[] = []
    if (lessonRecord?.findMany) {
      const records = await lessonRecord.findMany({
        where: {
          lesson: {
            teacherId: teacher.id,
            startAt: { gte: periodStart, lte: periodEnd },
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
      }) as { tempoAulaMinutos: number | null; lesson: { startAt: Date; durationMinutes: number; enrollment: { status: string; pausedAt: Date | null } } }[]
      recordsInRange = records
    }

    const filteredRecords = filterRecordsByPausedEnrollment(recordsInRange as PaymentRecord[])

    const valorPorHora = teacher.valorPorHora != null ? Number(teacher.valorPorHora) : 0
    const { totalHorasRegistradas, valorAPagar } = computeValorAPagar({
      records: filteredRecords,
      teacherId: teacher.id,
      periodStart: periodStartTime,
      periodEnd: periodEndTime,
      holidaySet,
      valorPorHora,
      valorPorPeriodo,
      valorExtra,
    })
    const valorPorHoras = Math.round(totalHorasRegistradas * valorPorHora * 100) / 100

    let totalMinutosEstimados = 0
    let totalRegistrosEsperados = 0
    for (const l of lessonsInRange) {
      const startAt = new Date(l.startAt).getTime()
      if (startAt < periodStartTime || startAt > periodEndTime) continue
      if (holidaySet.has(toDateKey(l.startAt))) continue
      totalRegistrosEsperados += 1
      totalMinutosEstimados += l.durationMinutes ?? 60
    }
    const totalHorasEstimadas = Math.round((totalMinutosEstimados / 60) * 100) / 100

    const data = {
      professorNome: teacher.nome,
      valorPorHora,
      dataInicio: periodStart.toISOString().slice(0, 10),
      dataTermino: periodEnd.toISOString().slice(0, 10),
      totalHorasEstimadas,
      totalHorasRegistradas,
      totalRegistrosEsperados,
      valorPorHoras,
      valorPorPeriodo,
      valorExtra,
      valorAPagar,
      metodoPagamento: teacher.metodoPagamento ?? null,
      infosPagamento: teacher.infosPagamento ?? null,
      statusPagamento,
      teacherConfirmedAt,
      proofSentAt,
      year: useMonthMode ? year : null,
      month: useMonthMode ? month : null,
    }

    return NextResponse.json({ ok: true, data })
  } catch (error) {
    console.error('[api/professor/financeiro GET]', error)
    return NextResponse.json(
      { ok: false, message: 'Erro ao carregar dados financeiros' },
      { status: 500 }
    )
  }
}
