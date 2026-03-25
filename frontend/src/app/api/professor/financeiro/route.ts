/**
 * GET /api/professor/financeiro?year=YYYY&month=M
 * Dados financeiros do professor logado (somente leitura). Mesma lógica do admin mas para um único professor.
 *
 * Regra: o professor recebe por HORAS REGISTRADAS (registros de aula), nunca pela estimativa (aulas agendadas).
 * Período: [início, fim exclusivo), igual a teacher-paid-period.ts (ex.: dia do vencimento não entra no ciclo).
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireTeacher } from '@/lib/auth'
import { toDateKey, filterRecordsByPausedEnrollment, computeValorAPagar, type PaymentRecord } from '@/lib/finance'
import { teacherPaymentPeriodBoundsUtc, calendarMonthBoundsUtc } from '@/lib/teacher-paid-period'
import { ymdInTZ } from '@/lib/datetime'

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
    const defaultBounds = calendarMonthBoundsUtc(now.getFullYear(), now.getMonth() + 1)

    let periodStartMs = defaultBounds.startMs
    let periodEndExclusiveMs = defaultBounds.endExclusiveMs
    let valorPorPeriodo = teacher.valorPorPeriodo != null ? Number(teacher.valorPorPeriodo) : 0
    let valorExtra = teacher.valorExtra != null ? Number(teacher.valorExtra) : 0
    let statusPagamento: 'PAGO' | 'EM_ABERTO' = teacher.periodoPagamentoPago ? 'PAGO' : 'EM_ABERTO'

    let teacherConfirmedAt: string | null = null
    let proofSentAt: string | null = null
    if (useMonthMode) {
      const pm = await prisma.teacherPaymentMonth.findUnique({
        where: { teacherId_year_month: { teacherId: teacher.id, year: year!, month: month! } },
      })
      if (pm) {
        const b = teacherPaymentPeriodBoundsUtc(pm.periodoInicio, pm.periodoTermino)
        if (b) {
          periodStartMs = b.startMs
          periodEndExclusiveMs = b.endExclusiveMs
        } else {
          const cal = calendarMonthBoundsUtc(year!, month!)
          periodStartMs = cal.startMs
          periodEndExclusiveMs = cal.endExclusiveMs
        }
        if (pm.valorPorPeriodo != null) valorPorPeriodo = Number(pm.valorPorPeriodo)
        if (pm.valorExtra != null) valorExtra = Number(pm.valorExtra)
        statusPagamento = pm.paymentStatus === 'PAGO' ? 'PAGO' : 'EM_ABERTO'
        if (pm.teacherConfirmedAt) teacherConfirmedAt = pm.teacherConfirmedAt.toISOString()
        if (pm.proofSentAt) proofSentAt = pm.proofSentAt.toISOString()
      } else {
        const cal = calendarMonthBoundsUtc(year!, month!)
        periodStartMs = cal.startMs
        periodEndExclusiveMs = cal.endExclusiveMs
      }
    } else {
      const b = teacherPaymentPeriodBoundsUtc(teacher.periodoPagamentoInicio ?? null, teacher.periodoPagamentoTermino ?? null)
      if (b) {
        periodStartMs = b.startMs
        periodEndExclusiveMs = b.endExclusiveMs
      }
    }

    const periodStart = new Date(periodStartMs)
    const periodEndExclusive = new Date(periodEndExclusiveMs)
    const startKey = toDateKey(periodStart)
    const endKey = toDateKey(new Date(periodEndExclusiveMs - 1))

    const holidayRows = await prisma.holiday.findMany({
      where: { dateKey: { gte: startKey, lte: endKey } },
      select: { dateKey: true },
    })
    const holidaySet = new Set(holidayRows.map((h) => h.dateKey))

    const lessonsInRange = await prisma.lesson.findMany({
      where: {
        teacherId: teacher.id,
        startAt: { gte: periodStart, lt: periodEndExclusive },
        status: { in: ['CONFIRMED', 'REPOSICAO'] },
      },
      select: { id: true, startAt: true, durationMinutes: true },
    })

    const lessonRecord = (prisma as { lessonRecord?: { findMany: (args: unknown) => Promise<unknown[]> } }).lessonRecord
    let recordsInRange: {
      tempoAulaMinutos: number | null
      presence: string
      lesson: {
        startAt: Date
        durationMinutes: number
        teacherId: string
        enrollment: { status: string; pausedAt: Date | null; nome: string }
      }
    }[] = []
    if (lessonRecord?.findMany) {
      const records = await lessonRecord.findMany({
        where: {
          lesson: {
            teacherId: teacher.id,
            startAt: { gte: periodStart, lt: periodEndExclusive },
            enrollment: {
              OR: [
                { status: { not: 'PAUSED' } },
                { pausedAt: null },
              ],
            },
          },
          status: { in: ['CONFIRMED', 'REPOSICAO'] },
        },
        select: {
          tempoAulaMinutos: true,
          presence: true,
          lesson: {
            select: {
              teacherId: true,
              startAt: true,
              durationMinutes: true,
              enrollment: {
                select: {
                  status: true,
                  pausedAt: true,
                  nome: true,
                },
              },
            },
          },
        },
      }) as typeof recordsInRange
      recordsInRange = records
    }

    const filteredRecords = filterRecordsByPausedEnrollment(recordsInRange as PaymentRecord[])

    const valorPorHora = teacher.valorPorHora != null ? Number(teacher.valorPorHora) : 0
    const { totalHorasRegistradas, valorAPagar } = computeValorAPagar({
      records: filteredRecords,
      teacherId: teacher.id,
      periodStart: periodStartMs,
      periodEndExclusive: periodEndExclusiveMs,
      holidaySet,
      valorPorHora,
      valorPorPeriodo,
      valorExtra,
    })
    const valorPorHoras = Math.round(totalHorasRegistradas * valorPorHora * 100) / 100

    const registrosDetalhados: {
      startAt: string
      alunoNome: string
      tempoAulaMinutos: number
      presence: string
      valorRecebido: number
    }[] = []
    for (const rec of recordsInRange) {
      if (rec.lesson.teacherId !== teacher.id) continue
      const t0 = new Date(rec.lesson.startAt).getTime()
      if (t0 < periodStartMs || t0 >= periodEndExclusiveMs) continue
      if (holidaySet.has(toDateKey(rec.lesson.startAt))) continue
      const asPayment: PaymentRecord = {
        tempoAulaMinutos: rec.tempoAulaMinutos,
        lesson: {
          teacherId: rec.lesson.teacherId,
          startAt: rec.lesson.startAt,
          durationMinutes: rec.lesson.durationMinutes,
          enrollment: { status: rec.lesson.enrollment.status, pausedAt: rec.lesson.enrollment.pausedAt },
        },
      }
      if (!filterRecordsByPausedEnrollment([asPayment]).length) continue
      const mins = rec.tempoAulaMinutos ?? rec.lesson.durationMinutes ?? 60
      const horas = mins / 60
      const valorRecebido = Math.round(horas * valorPorHora * 100) / 100
      registrosDetalhados.push({
        startAt: rec.lesson.startAt.toISOString(),
        alunoNome: rec.lesson.enrollment.nome ?? '—',
        tempoAulaMinutos: mins,
        presence: rec.presence ?? 'PRESENTE',
        valorRecebido,
      })
    }
    registrosDetalhados.sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime())

    let totalMinutosEstimados = 0
    let totalRegistrosEsperados = 0
    for (const l of lessonsInRange) {
      const startAt = new Date(l.startAt).getTime()
      if (startAt < periodStartMs || startAt >= periodEndExclusiveMs) continue
      if (holidaySet.has(toDateKey(l.startAt))) continue
      totalRegistrosEsperados += 1
      totalMinutosEstimados += l.durationMinutes ?? 60
    }
    const totalHorasEstimadas = Math.round((totalMinutosEstimados / 60) * 100) / 100

    const dataInicioStr = ymdInTZ(periodStart)
    const dataTerminoStr = ymdInTZ(new Date(periodEndExclusiveMs - 1))

    const data = {
      professorNome: teacher.nome,
      valorPorHora,
      dataInicio: dataInicioStr,
      dataTermino: dataTerminoStr,
      totalHorasEstimadas,
      totalHorasRegistradas,
      totalRegistrosEsperados,
      valorPorHoras,
      valorPorPeriodo,
      valorExtra,
      valorAPagar,
      registrosDetalhados,
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
