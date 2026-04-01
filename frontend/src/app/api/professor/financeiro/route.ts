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
import { resolveTeacherProofFileUrlFromAuditLogs } from '@/lib/finance/resolve-teacher-proof-url'
import {
  calendarMonthBoundsUtc,
  inferDueDayUtcFromSavedPeriod,
  teacherPaymentBoundsFromDueDay,
  teacherPaymentPeriodBoundsUtc,
  resolveTeacherPaymentMonthBoundsUtc,
} from '@/lib/teacher-paid-period'
import { ymdUtc } from '@/lib/datetime'
import { computePercentHorariosDisponiveisUsados } from '@/lib/teacher-availability-metrics'
import { getTeacherPaymentMarkedPaidAt } from '@/lib/finance/teacher-payment-marked-paid-at'

async function resolvePaymentMarkedPaidAtFromAudit(
  teacherId: string,
  y: number,
  m: number
): Promise<string | null> {
  const logs = await prisma.financeAuditLog.findMany({
    where: {
      entityType: 'TEACHER',
      entityId: teacherId,
      action: 'PAYMENT_STATUS_CHANGED',
    },
    orderBy: { criadoEm: 'desc' },
    take: 120,
    select: { criadoEm: true, newValue: true },
  })
  for (const log of logs) {
    const nv = log.newValue as { paymentStatus?: string; year?: number; month?: number } | null
    if (nv?.paymentStatus === 'PAGO' && nv.year === y && nv.month === m) {
      return log.criadoEm.toISOString()
    }
  }
  return null
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
        paymentDueDay: true,
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
    type StatusPagamentoProfessor =
      | 'PAGO'
      | 'EM_ABERTO'
      | 'NF_OK_AGUARDANDO'
      | 'AGUARDANDO_REENVIO'
    let statusPagamento: StatusPagamentoProfessor = teacher.periodoPagamentoPago ? 'PAGO' : 'EM_ABERTO'
    let pagamentoProntoParaFazer = false

    let teacherConfirmedAt: string | null = null
    let proofSentAt: string | null = null
    let proofFileUrl: string | null = null
    let pm: Awaited<ReturnType<typeof prisma.teacherPaymentMonth.findUnique>> = null
    if (useMonthMode) {
      pm = await prisma.teacherPaymentMonth.findUnique({
        where: { teacherId_year_month: { teacherId: teacher.id, year: year!, month: month! } },
      })

      let dueEffective: number | null =
        teacher.paymentDueDay != null && teacher.paymentDueDay >= 1 && teacher.paymentDueDay <= 31
          ? teacher.paymentDueDay
          : null

      if (dueEffective == null) {
        const rows = await prisma.teacherPaymentMonth.findMany({
          where: {
            teacherId: teacher.id,
            periodoInicio: { not: null },
            periodoTermino: { not: null },
          },
          select: { periodoInicio: true, periodoTermino: true },
          orderBy: [{ year: 'asc' }, { month: 'asc' }],
          take: 48,
        })
        const counts = new Map<number, number>()
        for (const r of rows) {
          const d = inferDueDayUtcFromSavedPeriod(r.periodoInicio, r.periodoTermino)
          if (d != null && d >= 1 && d <= 31) counts.set(d, (counts.get(d) ?? 0) + 1)
        }
        let best: number | null = null
        let bestC = 0
        const entries = [...counts.entries()].sort((a, b) => a[0] - b[0])
        for (const [d, c] of entries) {
          if (c > bestC) {
            best = d
            bestC = c
          }
        }
        if (bestC > 0) dueEffective = best
      }

      let b: { startMs: number; endExclusiveMs: number } | null = null
      if (dueEffective != null) {
        const p = teacherPaymentBoundsFromDueDay(year!, month!, dueEffective)
        b = teacherPaymentPeriodBoundsUtc(p.inicio, p.termino)
      }
      if (!b) {
        b = pm ? resolveTeacherPaymentMonthBoundsUtc(year!, month!, pm.periodoInicio, pm.periodoTermino) : null
      }
      if (!b) {
        const anyPm = await prisma.teacherPaymentMonth.findFirst({
          where: {
            teacherId: teacher.id,
            periodoInicio: { not: null },
            periodoTermino: { not: null },
          },
          orderBy: [{ year: 'desc' }, { month: 'desc' }],
          select: { periodoInicio: true, periodoTermino: true },
        })
        const inferred = inferDueDayUtcFromSavedPeriod(anyPm?.periodoInicio ?? null, anyPm?.periodoTermino ?? null)
        if (inferred != null) {
          const p = teacherPaymentBoundsFromDueDay(year!, month!, inferred)
          b = teacherPaymentPeriodBoundsUtc(p.inicio, p.termino)
        }
      }
      if (!b) {
        const fromTeacherGlobal = inferDueDayUtcFromSavedPeriod(
          teacher.periodoPagamentoInicio ?? null,
          teacher.periodoPagamentoTermino ?? null
        )
        if (fromTeacherGlobal != null) {
          const p = teacherPaymentBoundsFromDueDay(year!, month!, fromTeacherGlobal)
          b = teacherPaymentPeriodBoundsUtc(p.inicio, p.termino)
        }
      }
      if (b) {
        periodStartMs = b.startMs
        periodEndExclusiveMs = b.endExclusiveMs
      } else {
        const cal = calendarMonthBoundsUtc(year!, month!)
        periodStartMs = cal.startMs
        periodEndExclusiveMs = cal.endExclusiveMs
      }
      if (pm) {
        if (pm.valorPorPeriodo != null) valorPorPeriodo = Number(pm.valorPorPeriodo)
        if (pm.valorExtra != null) valorExtra = Number(pm.valorExtra)
        const raw = pm.paymentStatus
        if (raw === 'PAGO') statusPagamento = 'PAGO'
        else if (raw === 'NF_OK_AGUARDANDO') statusPagamento = 'NF_OK_AGUARDANDO'
        else if (raw === 'AGUARDANDO_REENVIO') statusPagamento = 'AGUARDANDO_REENVIO'
        else statusPagamento = 'EM_ABERTO'
        if (pm.teacherConfirmedAt) teacherConfirmedAt = pm.teacherConfirmedAt.toISOString()
        if (pm.proofSentAt) proofSentAt = pm.proofSentAt.toISOString()
      }

      const proofLogs = await prisma.financeAuditLog.findMany({
        where: {
          entityType: 'TEACHER',
          entityId: teacher.id,
          action: { in: ['PROOF_SENT', 'PROOF_REJECTED'] },
        },
        orderBy: { criadoEm: 'desc' },
        take: 80,
        select: { action: true, metadata: true },
      })
      proofFileUrl = resolveTeacherProofFileUrlFromAuditLogs(proofLogs, year!, month!)
      pagamentoProntoParaFazer =
        !!teacherConfirmedAt &&
        statusPagamento === 'EM_ABERTO' &&
        !!proofFileUrl
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

    const availabilitySlots = await prisma.teacherAvailabilitySlot.findMany({
      where: { teacherId: teacher.id },
      select: { dayOfWeek: true, startMinutes: true, endMinutes: true },
    })

    const lessonsInRange = await prisma.lesson.findMany({
      where: {
        teacherId: teacher.id,
        startAt: { gte: periodStart, lt: periodEndExclusive },
        status: { in: ['CONFIRMED', 'REPOSICAO'] },
      },
      select: { id: true, startAt: true, durationMinutes: true, record: { select: { id: true } } },
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
    let aulasComRegistro = 0
    for (const l of lessonsInRange) {
      const startAt = new Date(l.startAt).getTime()
      if (startAt < periodStartMs || startAt >= periodEndExclusiveMs) continue
      if (holidaySet.has(toDateKey(l.startAt))) continue
      totalRegistrosEsperados += 1
      totalMinutosEstimados += l.durationMinutes ?? 60
      if (l.record) aulasComRegistro += 1
    }
    const totalHorasEstimadas = Math.round((totalMinutosEstimados / 60) * 100) / 100

    const percentHorariosDisponiveisUsados = computePercentHorariosDisponiveisUsados({
      periodStartMs,
      periodEndExclusiveMs,
      holidaySet,
      slots: availabilitySlots,
      lessons: lessonsInRange.map((l) => ({
        startAt: l.startAt,
        durationMinutes: l.durationMinutes,
      })),
    })

    const percentRegistrosFeitos =
      totalRegistrosEsperados > 0
        ? Math.min(100, Math.round((100 * aulasComRegistro) / totalRegistrosEsperados))
        : null

    const dataInicioStr = ymdUtc(periodStart)
    const dataTerminoStr = ymdUtc(new Date(periodEndExclusiveMs - 1))

    let paymentMarkedPaidAt: string | null = null
    if (useMonthMode && statusPagamento === 'PAGO') {
      const fromDb = await getTeacherPaymentMarkedPaidAt(teacher.id, year!, month!)
      paymentMarkedPaidAt =
        fromDb != null
          ? fromDb.toISOString()
          : await resolvePaymentMarkedPaidAtFromAudit(teacher.id, year!, month!)
    }

    const data = {
      professorNome: teacher.nome,
      valorPorHora,
      dataInicio: dataInicioStr,
      dataTermino: dataTerminoStr,
      totalHorasEstimadas,
      totalHorasRegistradas,
      totalRegistrosEsperados,
      aulasComRegistro,
      percentHorariosDisponiveisUsados,
      semDisponibilidadeCadastrada: availabilitySlots.length === 0,
      percentRegistrosFeitos,
      valorPorHoras,
      valorPorPeriodo,
      valorExtra,
      valorAPagar,
      registrosDetalhados,
      metodoPagamento: teacher.metodoPagamento ?? null,
      infosPagamento: teacher.infosPagamento ?? null,
      statusPagamento,
      pagamentoProntoParaFazer,
      paymentMarkedPaidAt,
      valorPago: useMonthMode && statusPagamento === 'PAGO' ? valorAPagar : null,
      teacherConfirmedAt,
      proofSentAt,
      proofFileUrl,
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
