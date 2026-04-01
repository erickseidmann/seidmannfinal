/**
 * API: GET /api/admin/financeiro/professores?year=YYYY&month=M
 * Lista professores ACTIVE. Modo mês: só entram quem já existia até o fim do mês (criadoEm ≤ último dia),
 * alinhado à coluna "Data de Início" do admin. Valores vêm de TeacherPaymentMonth quando existir;
 * se o período cadastrado não cobrir o mês visualizado, usa o mês civil em UTC para listagem e cálculo.
 * Sem year/month: período e status vêm do cadastro do professor (periodoPagamentoInicio/Termino, periodoPagamentoPago).
 * Regra: o professor recebe por HORAS REGISTRADAS (LessonRecord), nunca pela estimativa (Lesson).
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/auth'
import { toDateKey, filterRecordsByPausedEnrollment, computeValorAPagar, type PaymentRecord } from '@/lib/finance'
import { resolveTeacherProofFileUrlFromAuditLogs } from '@/lib/finance/resolve-teacher-proof-url'
import {
  calendarMonthBoundsUtc,
  resolveTeacherPaymentMonthBoundsUtc,
  teacherPaymentBoundsFromDueDay,
  teacherPaymentPeriodBoundsUtc,
} from '@/lib/teacher-paid-period'
import { ymdUtc } from '@/lib/datetime'

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
    const periodEnd =
      useMonthMode && year != null && month != null
        ? lastDayOfMonth(new Date(year, month - 1, 1))
        : null

    const teacherSelect = {
      id: true,
      nome: true,
      criadoEm: true,
      valorPorHora: true,
      metodoPagamento: true,
      infosPagamento: true,
      periodoPagamentoInicio: true,
      periodoPagamentoTermino: true,
      paymentDueDay: true,
      periodoPagamentoPago: true,
      valorPorPeriodo: true,
      valorExtra: true,
      _count: { select: { financeObservations: true } },
      ...(useMonthMode && {
        paymentMonths: { where: { year: year!, month: month! }, take: 1 },
      }),
    } as const

    const teachers = await prisma.teacher.findMany({
      where:
        useMonthMode && periodEnd != null
          ? {
              status: 'ACTIVE',
              criadoEm: { lte: periodEnd },
            }
          : { status: 'ACTIVE' },
      select: teacherSelect,
      orderBy: { nome: 'asc' },
    })

    // No modo mês: buscar o período que TERMINA no mês selecionado (ex.: em abril mostrar 23/03–23/04, não 23/04–23/05).
    type PmRow = {
      teacherId: string
      periodoInicio: Date | null
      periodoTermino: Date | null
      paymentStatus: string | null
      valorPorPeriodo: unknown
      valorExtra: unknown
      teacherConfirmedAt: Date | null
      proofSentAt: Date | null
    }
    let periodEndsInMonthMap = new Map<string, PmRow>()
    // Mapa: teacherId|year|month -> fileUrl do comprovante anexado.
    const proofFileByTeacherYearMonth = new Map<string, string>()
    if (useMonthMode && year != null && month != null) {
      // Regra do mês visualizado: selecionar o período que VENCE no mês (periodoTermino no mês).
      // Usar limites UTC [início do mês, início do próximo mês) evita ambiguidades de fuso.
      const monthBounds = calendarMonthBoundsUtc(year, month)
      const firstDaySel = new Date(monthBounds.startMs)
      const nextMonthStart = new Date(monthBounds.endExclusiveMs)
      const rowsEnding = await prisma.teacherPaymentMonth.findMany({
        where: {
          teacherId: { in: teachers.map((t) => t.id) },
          periodoTermino: { gte: firstDaySel, lt: nextMonthStart },
        },
        select: {
          teacherId: true,
          periodoInicio: true,
          periodoTermino: true,
          paymentStatus: true,
          valorPorPeriodo: true,
          valorExtra: true,
          teacherConfirmedAt: true,
          proofSentAt: true,
        },
      })
      // Segurança para dados legados duplicados: preferir o período com termino mais recente no mês.
      rowsEnding
        .sort((a, b) => {
          const at = a.periodoTermino ? new Date(a.periodoTermino).getTime() : 0
          const bt = b.periodoTermino ? new Date(b.periodoTermino).getTime() : 0
          return at - bt
        })
        .forEach((r) => periodEndsInMonthMap.set(r.teacherId, r as PmRow))

      // Comprovante: último evento PROOF_SENT ou PROOF_REJECTED por professor/mês (mais recente vence).
      const proofLogs = await prisma.financeAuditLog.findMany({
        where: {
          entityType: 'TEACHER',
          entityId: { in: teachers.map((t) => t.id) },
          action: { in: ['PROOF_SENT', 'PROOF_REJECTED'] },
        },
        orderBy: { criadoEm: 'desc' },
        take: 800,
        select: { entityId: true, action: true, metadata: true },
      })

      const proofLogsByTeacher = new Map<string, { action: string; metadata: unknown }[]>()
      for (const l of proofLogs) {
        const arr = proofLogsByTeacher.get(l.entityId) ?? []
        arr.push({ action: l.action, metadata: l.metadata })
        proofLogsByTeacher.set(l.entityId, arr)
      }
      for (const t of teachers) {
        const mine = proofLogsByTeacher.get(t.id) ?? []
        const url = resolveTeacherProofFileUrlFromAuditLogs(mine, year!, month!)
        if (url) {
          proofFileByTeacherYearMonth.set(`${t.id}|${year}|${month}`, url)
        }
      }
    }

    const lessonRecord = (prisma as { lessonRecord?: { findMany: (args: unknown) => Promise<unknown[]> } }).lessonRecord
    if (!lessonRecord?.findMany) {
      return NextResponse.json(
        { ok: false, message: 'Modelo LessonRecord não disponível. Rode: npx prisma generate' },
        { status: 503 }
      )
    }

    const defCal = calendarMonthBoundsUtc(now.getFullYear(), now.getMonth() + 1)
    const selCal =
      useMonthMode && year != null && month != null ? calendarMonthBoundsUtc(year, month) : defCal
    let globalStart = selCal.startMs
    let globalEndExclusive = selCal.endExclusiveMs
    const teacherPeriods: { id: string; startMs: number; endExclusiveMs: number }[] = []

    if (!useMonthMode) {
      for (const t of teachers) {
        const b =
          teacherPaymentPeriodBoundsUtc(t.periodoPagamentoInicio ?? null, t.periodoPagamentoTermino ?? null) ?? defCal
        if (b.startMs < globalStart) globalStart = b.startMs
        if (b.endExclusiveMs > globalEndExclusive) globalEndExclusive = b.endExclusiveMs
        teacherPeriods.push({ id: t.id, startMs: b.startMs, endExclusiveMs: b.endExclusiveMs })
      }
    } else {
      globalStart = selCal.startMs
      globalEndExclusive = selCal.endExclusiveMs
      const mb = selCal
      for (const t of teachers) {
        const rowEndsInMonth = periodEndsInMonthMap.get(t.id)
        const hasPeriodEndingInMonth = !!rowEndsInMonth
        const pmFallback = 'paymentMonths' in t && Array.isArray(t.paymentMonths) && t.paymentMonths[0]
          ? (t.paymentMonths[0] as { periodoInicio: Date | null; periodoTermino: Date | null })
          : null
        const source = rowEndsInMonth ?? pmFallback
        const due = t.paymentDueDay
        let b: { startMs: number; endExclusiveMs: number } | null = null
        if (due != null && due >= 1 && due <= 31) {
          const p = teacherPaymentBoundsFromDueDay(year!, month!, due)
          b = teacherPaymentPeriodBoundsUtc(p.inicio, p.termino)
        }
        if (!b) {
          b =
            resolveTeacherPaymentMonthBoundsUtc(year!, month!, source?.periodoInicio ?? null, source?.periodoTermino ?? null) ??
            teacherPaymentPeriodBoundsUtc(source?.periodoInicio ?? null, source?.periodoTermino ?? null) ??
            selCal
        }
        if (b.startMs >= b.endExclusiveMs) b = selCal
        // Se NÃO houver período com vencimento no mês, mantém fallback por sobreposição
        // para legado. Se houver (ex.: 01/03→01/04 ao visualizar abril), preserva o período.
        if (!hasPeriodEndingInMonth) {
          const overlapsMonth =
            b.endExclusiveMs > mb.startMs && b.startMs < mb.endExclusiveMs
          if (!overlapsMonth) b = selCal
        }
        if (b.startMs < globalStart) globalStart = b.startMs
        if (b.endExclusiveMs > globalEndExclusive) globalEndExclusive = b.endExclusiveMs
        teacherPeriods.push({ id: t.id, startMs: b.startMs, endExclusiveMs: b.endExclusiveMs })
      }
    }

    const globalStartDate = new Date(globalStart)
    const globalEndExclusiveDate = new Date(globalEndExclusive)

    const startKey = toDateKey(globalStartDate)
    const endKey = toDateKey(new Date(globalEndExclusive - 1))
    const holidayRows = await prisma.holiday.findMany({
      where: { dateKey: { gte: startKey, lte: endKey } },
      select: { dateKey: true },
    })
    const holidaySet = new Set(holidayRows.map((h) => h.dateKey))

    // Aulas canceladas não entram no cálculo de pagamento (apenas CONFIRMED)
    const lessonsInRange = await prisma.lesson.findMany({
      where: {
        startAt: { gte: globalStartDate, lt: globalEndExclusiveDate },
        status: 'CONFIRMED',
        teacherId: { not: null },
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
          startAt: { gte: globalStartDate, lt: globalEndExclusiveDate },
        },
        status: { in: ['CONFIRMED', 'REPOSICAO'] },
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

    // Debug temporário: investigar cálculo de período para professora Keila.
    const DEBUG_KEILA = true
    if (DEBUG_KEILA) {
      const keila = teachers.find((t) => t.nome.toLowerCase().includes('keila'))
      if (keila) {
        const period = teacherPeriods.find((p) => p.id === keila.id)
        const selectedPm = periodEndsInMonthMap.get(keila.id)
        if (period) {
          const recordsForKeilaInWindow = filteredRecords.filter((r) => {
            if (r.lesson.teacherId !== keila.id) return false
            const ts = new Date(r.lesson.startAt).getTime()
            return ts >= period.startMs && ts < period.endExclusiveMs
          })
          console.log('[financeiro/professores][DEBUG_KEILA]', {
            teacherId: keila.id,
            teacherName: keila.nome,
            monthView: useMonthMode ? { year, month } : null,
            selectedTeacherPaymentMonth: selectedPm
              ? {
                  periodoInicio: selectedPm.periodoInicio?.toISOString?.() ?? null,
                  periodoTermino: selectedPm.periodoTermino?.toISOString?.() ?? null,
                  paymentStatus: selectedPm.paymentStatus ?? null,
                }
              : null,
            periodBoundsUsed: {
              startMs: period.startMs,
              endExclusiveMs: period.endExclusiveMs,
              startIso: new Date(period.startMs).toISOString(),
              endExclusiveIso: new Date(period.endExclusiveMs).toISOString(),
            },
            lessonRecordsFound: recordsForKeilaInWindow.length,
          })
        }
      }
    }

    const list = teachers.map((t) => {
      const period = teacherPeriods.find((p) => p.id === t.id)!
      const valorPorHora = t.valorPorHora != null ? Number(t.valorPorHora) : 0
      const pm = useMonthMode
        ? (periodEndsInMonthMap.get(t.id) ?? ('paymentMonths' in t && Array.isArray(t.paymentMonths) && t.paymentMonths[0]
            ? (t.paymentMonths[0] as {
                paymentStatus: string | null
                valorPorPeriodo: unknown
                valorExtra: unknown
                periodoInicio: Date | null
                periodoTermino: Date | null
                teacherConfirmedAt: Date | null
                proofSentAt: Date | null
              })
            : null))
        : null

      const valorPorPeriodo = useMonthMode && pm?.valorPorPeriodo != null
        ? Number(pm.valorPorPeriodo)
        : (t.valorPorPeriodo != null ? Number(t.valorPorPeriodo) : 0)
      const valorExtra = useMonthMode && pm?.valorExtra != null
        ? Number(pm.valorExtra)
        : (t.valorExtra != null ? Number(t.valorExtra) : 0)
      const rawPay = pm?.paymentStatus
      const proofFileUrlRow =
        useMonthMode && year != null && month != null
          ? proofFileByTeacherYearMonth.get(`${t.id}|${year}|${month}`) ?? null
          : null

      const statusPagamento =
        useMonthMode && rawPay === 'PAGO'
          ? 'PAGO'
          : useMonthMode && rawPay === 'NF_OK_AGUARDANDO'
            ? 'NF_OK_AGUARDANDO'
            : useMonthMode && rawPay === 'AGUARDANDO_REENVIO'
              ? 'AGUARDANDO_REENVIO'
              : useMonthMode
                ? 'EM_ABERTO'
                : t.periodoPagamentoPago
                  ? 'PAGO'
                  : 'EM_ABERTO'

      const { totalHorasRegistradas, valorAPagar } = computeValorAPagar({
        records: filteredRecords,
        teacherId: t.id,
        periodStart: period.startMs,
        periodEndExclusive: period.endExclusiveMs,
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
        if (startAt < period.startMs || startAt >= period.endExclusiveMs) continue
        if (holidaySet.has(toDateKey(l.startAt))) continue
        totalRegistrosEsperados += 1
        totalMinutosEstimados += l.durationMinutes ?? 60
      }
      const totalHorasEstimadas = Math.round((totalMinutosEstimados / 60) * 100) / 100

      const dataInicioISO = ymdUtc(new Date(period.startMs))
      const dataTerminoISO = ymdUtc(new Date(period.endExclusiveMs - 1))

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
        statusPagamento: statusPagamento as
          | 'PAGO'
          | 'EM_ABERTO'
          | 'NF_OK_AGUARDANDO'
          | 'AGUARDANDO_REENVIO',
        pagamentoProntoParaFazer:
          !!(pm?.teacherConfirmedAt) && statusPagamento === 'EM_ABERTO' && !!proofFileUrlRow,
        proofSentAt: useMonthMode ? (pm?.proofSentAt ? pm.proofSentAt.toISOString() : null) : null,
        proofFileUrl: proofFileUrlRow,
        hasFinanceObservations: ((t as { _count?: { financeObservations: number } })._count?.financeObservations ?? 0) > 0,
        criadoEm: t.criadoEm.toISOString(),
      }
    })

    // No modo mês: exibir professores cujo período de pagamento TEM ALGUM DIA no mês/ano selecionado (sobreposição).
    // Ex.: período 24/02–24/03 → aparece em fev e mar; período 23/03–23/04 → aparece em mar e abr (Maria em ambos).
    let professoresFinais = list
    if (useMonthMode && year != null && month != null) {
      const monthBounds = calendarMonthBoundsUtc(year, month)
      professoresFinais = list.filter((p) => {
        const period = teacherPeriods.find((tp) => tp.id === p.id)
        if (!period) return false
        // Regra de inclusão no mês visualizado:
        // 1) período que vence no mês (periodoTermino no mês, incluindo 1º dia 00:00),
        // 2) período que começa no mês,
        // 3) sobreposição geral (fallback/legado).
        const endsInMonth =
          period.endExclusiveMs >= monthBounds.startMs &&
          period.endExclusiveMs < monthBounds.endExclusiveMs
        const startsInMonth =
          period.startMs >= monthBounds.startMs &&
          period.startMs < monthBounds.endExclusiveMs
        const overlapsMonth =
          period.startMs < monthBounds.endExclusiveMs &&
          period.endExclusiveMs > monthBounds.startMs
        return endsInMonth || startsInMonth || overlapsMonth
      })
    }

    // Ordenação final: por dia de pagamento (1..31), depois por nome.
    const professoresOrdenados = [...professoresFinais].sort((a, b) => {
      const aDay = new Date(`${a.dataInicio}T12:00:00Z`).getUTCDate()
      const bDay = new Date(`${b.dataInicio}T12:00:00Z`).getUTCDate()
      if (aDay !== bDay) return aDay - bDay
      return a.nome.localeCompare(b.nome, 'pt-BR')
    })

    return NextResponse.json({
      ok: true,
      data: {
        professores: professoresOrdenados,
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
