/**
 * GET /api/admin/financeiro/relatorios?type=receitas|despesas|inadimplencia|professores|geral&year=YYYY&month=M&format=json|csv
 * Relatórios financeiros com exportação CSV.
 */

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/auth'
import {
  toDateKey,
  filterRecordsByPausedEnrollment,
  computeValorAPagar,
  type PaymentRecord,
} from '@/lib/finance'

const querySchema = z.object({
  type: z.enum(['receitas', 'despesas', 'inadimplencia', 'professores', 'geral']),
  year: z.coerce.number().int().min(2000).max(2100),
  month: z.coerce.number().int().min(1).max(12).optional(),
  format: z.enum(['json', 'csv']).default('json'),
})

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

function firstDayOfMonth(y: number, m: number): Date {
  return startOfDay(new Date(y, m - 1, 1))
}

function lastDayOfMonth(y: number, m: number): Date {
  return endOfDay(new Date(y, m, 0))
}

function formatMoney(v: number): string {
  return (Math.round(v * 100) / 100).toFixed(2)
}

function escapeCsvCell(s: string): string {
  if (/[;"\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
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
    const parsed = querySchema.safeParse({
      type: searchParams.get('type') ?? undefined,
      year: searchParams.get('year') ?? undefined,
      month: searchParams.get('month') ?? undefined,
      format: searchParams.get('format') ?? 'json',
    })
    if (!parsed.success) {
      return NextResponse.json(
        { ok: false, message: 'Parâmetros inválidos', details: parsed.error.flatten() },
        { status: 400 }
      )
    }
    const { type, year, month, format } = parsed.data

    const monthsToProcess: { year: number; month: number }[] = month
      ? [{ year, month }]
      : Array.from({ length: 12 }, (_, i) => ({ year, month: i + 1 }))

    if (type === 'receitas') {
      const result = await buildReceitasReport(year, month, monthsToProcess)
      return sendReport(result, type, year, month, format, 'receitas')
    }
    if (type === 'despesas') {
      const result = await buildDespesasReport(year, month, monthsToProcess)
      return sendReport(result, type, year, month, format, 'despesas')
    }
    if (type === 'inadimplencia') {
      const result = await buildInadimplenciaReport(year, month, monthsToProcess)
      return sendReport(result, type, year, month, format, 'inadimplencia')
    }
    if (type === 'professores') {
      const result = await buildProfessoresReport(year, month, monthsToProcess)
      return sendReport(result, type, year, month, format, 'professores')
    }
    if (type === 'geral') {
      const result = await buildGeralReport(year, month, monthsToProcess)
      return sendReport(result, type, year, month, format, 'geral')
    }

    return NextResponse.json({ ok: false, message: 'Tipo inválido' }, { status: 400 })
  } catch (error) {
    console.error('[api/admin/financeiro/relatorios GET]', error)
    return NextResponse.json(
      { ok: false, message: 'Erro ao gerar relatório' },
      { status: 500 }
    )
  }
}

type CsvType = 'receitas' | 'despesas' | 'inadimplencia' | 'professores' | 'geral'

function sendReport(
  data: unknown,
  type: string,
  year: number,
  month: number | undefined,
  format: string,
  csvType: CsvType
): NextResponse {
  if (format === 'csv') {
    const csv = toCsv(csvType, data, month)
    const filename = `relatorio-${type}-${year}${month != null ? `-${month}` : ''}.csv`
    return new NextResponse('\uFEFF' + csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    })
  }
  return NextResponse.json({ ok: true, data })
}

function toCsv(type: CsvType, data: unknown, month: number | undefined): string {
  const rows: string[] = []
  const sep = ';'

  if (type === 'receitas') {
    const d = data as { items?: Array<{ aluno: string; valorMensalidade: number; status: string | null; month: number; year: number }> }
    rows.push(['Aluno', 'Valor Mensalidade', 'Status', 'Mês', 'Ano'].join(sep))
    for (const r of d.items ?? []) {
      rows.push([
        escapeCsvCell(r.aluno),
        formatMoney(r.valorMensalidade),
        escapeCsvCell(r.status ?? ''),
        String(r.month),
        String(r.year),
      ].join(sep))
    }
  } else if (type === 'despesas' && month != null) {
    const d = data as {
      professores?: Array<{ professor: string; horasRegistradas: number; valorPorHora: number; valorAPagar: number; status: string | null; month: number; year: number }>
      admin?: Array<{ nome: string; valor: number; status: string | null; month: number; year: number }>
      expenses?: Array<{ name: string; valor: number; status: string | null; month: number; year: number }>
    }
    rows.push(['Professor', 'Horas Registradas', 'Valor/Hora', 'Valor a Pagar', 'Status', 'Mês', 'Ano'].join(sep))
    for (const r of d.professores ?? []) {
      rows.push([
        escapeCsvCell(r.professor),
        formatMoney(r.horasRegistradas),
        formatMoney(r.valorPorHora),
        formatMoney(r.valorAPagar),
        escapeCsvCell(r.status ?? ''),
        String(r.month),
        String(r.year),
      ].join(sep))
    }
    rows.push('')
    rows.push(['Admin/Funcionário', 'Valor', 'Status', 'Mês', 'Ano'].join(sep))
    for (const r of d.admin ?? []) {
      rows.push([escapeCsvCell(r.nome), formatMoney(r.valor), escapeCsvCell(r.status ?? ''), String(r.month), String(r.year)].join(sep))
    }
    rows.push('')
    rows.push(['Despesa', 'Valor', 'Status', 'Mês', 'Ano'].join(sep))
    for (const r of d.expenses ?? []) {
      rows.push([escapeCsvCell(r.name), formatMoney(r.valor), escapeCsvCell(r.status ?? ''), String(r.month), String(r.year)].join(sep))
    }
  } else if (type === 'inadimplencia') {
    const d = data as { items?: Array<{ aluno: string; email: string; valorMensalidade: number; dueDay: number | null; mesesAtrasados: number }> }
    rows.push(['Aluno', 'Email', 'Valor Mensalidade', 'Dia Vencimento', 'Meses Atrasados'].join(sep))
    for (const r of d.items ?? []) {
      rows.push([
        escapeCsvCell(r.aluno),
        escapeCsvCell(r.email),
        formatMoney(r.valorMensalidade),
        r.dueDay != null ? String(r.dueDay) : '',
        String(r.mesesAtrasados),
      ].join(sep))
    }
  } else if (type === 'professores') {
    const d = data as { items?: Array<{ nome: string; totalHorasRegistradas: number; valorPorHora: number; valorAPagar: number; paymentStatus: string | null }> }
    rows.push(['Professor', 'Horas Registradas', 'Valor/Hora', 'Valor a Pagar', 'Status'].join(sep))
    for (const r of d.items ?? []) {
      rows.push([
        escapeCsvCell(r.nome),
        formatMoney(r.totalHorasRegistradas),
        formatMoney(r.valorPorHora),
        formatMoney(r.valorAPagar),
        escapeCsvCell(r.paymentStatus ?? ''),
      ].join(sep))
    }
  } else if (type === 'geral') {
    const d = data as { items?: Array<{ mes: number; ano: number; receita: number; despesaProfessores: number; despesaAdmin: number; despesaOutras: number; totalDespesas: number; saldo: number }> }
    rows.push(['Mês', 'Ano', 'Receita', 'Despesa Professores', 'Despesa Admin', 'Despesa Outras', 'Total Despesas', 'Saldo'].join(sep))
    for (const r of d.items ?? []) {
      rows.push([
        String(r.mes),
        String(r.ano),
        formatMoney(r.receita),
        formatMoney(r.despesaProfessores),
        formatMoney(r.despesaAdmin),
        formatMoney(r.despesaOutras),
        formatMoney(r.totalDespesas),
        formatMoney(r.saldo),
      ].join(sep))
    }
  }

  return rows.join('\r\n')
}

async function buildReceitasReport(
  year: number,
  month: number | undefined,
  monthsToProcess: { year: number; month: number }[]
) {
  const where = month != null
    ? { year, month }
    : { year, month: { gte: 1, lte: 12 } }

  const list = await prisma.enrollmentPaymentMonth.findMany({
    where,
    include: {
      enrollment: {
        select: {
          nome: true,
          valorMensalidade: true,
          paymentInfo: { select: { valorMensal: true } },
        },
      },
    },
    orderBy: [{ year: 'asc' }, { month: 'asc' }],
  })

  const items = list.map((pm) => {
    const e = pm.enrollment as { nome: string; valorMensalidade: unknown; paymentInfo?: { valorMensal: unknown } }
    const valor = e.valorMensalidade != null ? Number(e.valorMensalidade) : (e.paymentInfo?.valorMensal != null ? Number(e.paymentInfo.valorMensal) : 0)
    return {
      aluno: e.nome,
      valorMensalidade: Math.round(valor * 100) / 100,
      status: pm.paymentStatus,
      year: pm.year,
      month: pm.month,
    }
  })

  let totalPago = 0
  let totalPendente = 0
  let totalAtrasado = 0
  for (const pm of list) {
    const e = pm.enrollment as { valorMensalidade: unknown; paymentInfo?: { valorMensal: unknown } }
    const v = e.valorMensalidade != null ? Number(e.valorMensalidade) : (e.paymentInfo?.valorMensal != null ? Number(e.paymentInfo.valorMensal) : 0)
    if (pm.paymentStatus === 'PAGO') totalPago += v
    else if (pm.paymentStatus === 'ATRASADO') totalAtrasado += v
    else totalPendente += v
  }
  const totalGeral = totalPago + totalPendente + totalAtrasado

  if (month == null) {
    const porMes = monthsToProcess.map(({ year: y, month: m }) => {
      let pago = 0
      let pendente = 0
      let atrasado = 0
      for (const pm of list) {
        if (pm.year !== y || pm.month !== m) continue
        const e = pm.enrollment as { valorMensalidade: unknown; paymentInfo?: { valorMensal: unknown } }
        const v = e.valorMensalidade != null ? Number(e.valorMensalidade) : (e.paymentInfo?.valorMensal != null ? Number(e.paymentInfo.valorMensal) : 0)
        if (pm.paymentStatus === 'PAGO') pago += v
        else if (pm.paymentStatus === 'ATRASADO') atrasado += v
        else pendente += v
      }
      return {
        year: y,
        month: m,
        totalPago: Math.round(pago * 100) / 100,
        totalPendente: Math.round(pendente * 100) / 100,
        totalAtrasado: Math.round(atrasado * 100) / 100,
        totalGeral: Math.round((pago + pendente + atrasado) * 100) / 100,
      }
    })
    return { items: porMes, totalPago, totalPendente, totalAtrasado, totalGeral }
  }

  return { items, totalPago, totalPendente, totalAtrasado, totalGeral }
}

async function buildDespesasReport(
  year: number,
  month: number | undefined,
  monthsToProcess: { year: number; month: number }[]
) {
  const lessonRecord = (prisma as { lessonRecord?: { findMany: (args: unknown) => Promise<unknown[]> } }).lessonRecord

  const resultByMonth = monthsToProcess.map(({ year: y, month: m }) => ({
    year: y,
    month: m,
    professores: 0,
    adminStaff: 0,
    despesasAdmin: 0,
    total: 0,
    items: { professores: [] as any[], admin: [] as any[], expenses: [] as any[] },
  }))

  for (let i = 0; i < monthsToProcess.length; i++) {
    const { year: y, month: m } = monthsToProcess[i]
    const periodStart = firstDayOfMonth(y, m)
    const periodEnd = lastDayOfMonth(y, m)
    const startKey = toDateKey(periodStart)
    const endKey = toDateKey(periodEnd)
    const holidayRows = await prisma.holiday.findMany({
      where: { dateKey: { gte: startKey, lte: endKey } },
      select: { dateKey: true },
    })
    const holidaySet = new Set(holidayRows.map((h) => h.dateKey))

    const adminMonths = await prisma.adminUserPaymentMonth.findMany({
      where: { year: y, month: m },
      include: { user: { select: { nome: true } } },
    })
    let adminTotal = 0
    const adminItems: { nome: string; valor: number; status: string | null; month: number; year: number }[] = []
    for (const am of adminMonths) {
      const v = am.valor != null ? Number(am.valor) : 0
      adminTotal += v
      adminItems.push({ nome: (am.user as { nome: string }).nome, valor: v, status: am.paymentStatus, month: m, year: y })
    }

    const expenses = await prisma.adminExpense.findMany({
      where: { year: y, month: m },
    })
    let expensesTotal = 0
    const expenseItems: { name: string; valor: number; status: string | null; month: number; year: number }[] = []
    for (const ex of expenses) {
      const v = Number(ex.valor)
      expensesTotal += v
      expenseItems.push({ name: ex.name, valor: v, status: ex.paymentStatus, month: m, year: y })
    }

    let professoresTotal = 0
    const professorItems: { professor: string; horasRegistradas: number; valorPorHora: number; valorAPagar: number; status: string | null; month: number; year: number }[] = []

    if (lessonRecord?.findMany) {
      const teachers = await prisma.teacher.findMany({
        where: { status: 'ACTIVE' },
        select: {
          id: true,
          nome: true,
          valorPorHora: true,
          valorPorPeriodo: true,
          valorExtra: true,
        },
      })
      const paymentMonthsThisMonth = await prisma.teacherPaymentMonth.findMany({
        where: { year: y, month: m },
        select: { teacherId: true, valorPorPeriodo: true, valorExtra: true, paymentStatus: true },
      })
      const recordsInRange = await (lessonRecord as any).findMany({
        where: {
          lesson: {
            teacherId: { in: teachers.map((t) => t.id) },
            startAt: { gte: periodStart, lte: periodEnd },
            status: 'CONFIRMED',
            enrollment: {
              OR: [{ status: { not: 'PAUSED' } }, { pausedAt: null }],
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
              enrollment: { select: { status: true, pausedAt: true } },
            },
          },
        },
      })
      const filteredRecords = filterRecordsByPausedEnrollment(recordsInRange as PaymentRecord[])

      for (const t of teachers) {
        const pm = paymentMonthsThisMonth.find((p) => p.teacherId === t.id)
        const valorPorHora = t.valorPorHora != null ? Number(t.valorPorHora) : 0
        const valorPorPeriodo = pm?.valorPorPeriodo != null ? Number(pm.valorPorPeriodo) : (t.valorPorPeriodo != null ? Number(t.valorPorPeriodo) : 0)
        const valorExtra = pm?.valorExtra != null ? Number(pm.valorExtra) : (t.valorExtra != null ? Number(t.valorExtra) : 0)
        const { totalHorasRegistradas, valorAPagar } = computeValorAPagar({
          records: filteredRecords,
          teacherId: t.id,
          periodStart: periodStart.getTime(),
          periodEnd: periodEnd.getTime(),
          holidaySet,
          valorPorHora,
          valorPorPeriodo,
          valorExtra,
        })
        professoresTotal += valorAPagar
        professorItems.push({
          professor: t.nome,
          horasRegistradas: totalHorasRegistradas,
          valorPorHora,
          valorAPagar,
          status: pm?.paymentStatus ?? null,
          month: m,
          year: y,
        })
      }
    }

    const total = professoresTotal + adminTotal + expensesTotal
    resultByMonth[i].professores = Math.round(professoresTotal * 100) / 100
    resultByMonth[i].adminStaff = Math.round(adminTotal * 100) / 100
    resultByMonth[i].despesasAdmin = Math.round(expensesTotal * 100) / 100
    resultByMonth[i].total = Math.round(total * 100) / 100
    resultByMonth[i].items = { professores: professorItems, admin: adminItems, expenses: expenseItems }
  }

  if (month != null) {
    const single = resultByMonth[0]
    return {
      professores: single.items.professores,
      admin: single.items.admin,
      expenses: single.items.expenses,
      totalProfessores: single.professores,
      totalAdminStaff: single.adminStaff,
      totalDespesasAdmin: single.despesasAdmin,
      total: single.total,
    }
  }
  return {
    items: resultByMonth,
    totalProfessores: Math.round(resultByMonth.reduce((s, d) => s + d.professores, 0) * 100) / 100,
    totalAdminStaff: Math.round(resultByMonth.reduce((s, d) => s + d.adminStaff, 0) * 100) / 100,
    totalDespesasAdmin: Math.round(resultByMonth.reduce((s, d) => s + d.despesasAdmin, 0) * 100) / 100,
    total: Math.round(resultByMonth.reduce((s, d) => s + d.total, 0) * 100) / 100,
  }
}

async function buildInadimplenciaReport(
  _year: number,
  month: number | undefined,
  monthsToProcess: { year: number; month: number }[]
) {
  const where =
    month != null
      ? { paymentStatus: 'ATRASADO' as const, year: monthsToProcess[0].year, month }
      : { paymentStatus: 'ATRASADO' as const, year: monthsToProcess[0].year, month: { gte: 1, lte: 12 } }

  const atrasados = await prisma.enrollmentPaymentMonth.findMany({
    where,
    include: {
      enrollment: {
        select: {
          id: true,
          nome: true,
          email: true,
          valorMensalidade: true,
          diaPagamento: true,
          user: { select: { email: true } },
          paymentInfo: { select: { valorMensal: true, dueDay: true } },
        },
      },
    },
  })

  const countByEnrollment = new Map<string, number>()
  for (const pm of atrasados) {
    const n = countByEnrollment.get(pm.enrollmentId) ?? 0
    countByEnrollment.set(pm.enrollmentId, n + 1)
  }

  const byEnrollment = new Map<string, { enrollment: typeof atrasados[0]['enrollment']; mesesAtrasados: number }>()
  for (const pm of atrasados) {
    const mesesAtrasados = countByEnrollment.get(pm.enrollmentId) ?? 1
    const existing = byEnrollment.get(pm.enrollmentId)
    if (!existing || existing.mesesAtrasados < mesesAtrasados) {
      byEnrollment.set(pm.enrollmentId, { enrollment: pm.enrollment, mesesAtrasados })
    }
  }

  const items = Array.from(byEnrollment.entries())
    .map(([, v]) => {
      const e = v.enrollment as {
        nome: string
        email: string
        valorMensalidade: unknown
        diaPagamento: number | null
        user?: { email: string } | null
        paymentInfo?: { valorMensal: unknown; dueDay: number | null } | null
      }
      const valor = e.valorMensalidade != null ? Number(e.valorMensalidade) : (e.paymentInfo?.valorMensal != null ? Number(e.paymentInfo.valorMensal) : 0)
      return {
        aluno: e.nome,
        email: e.user?.email ?? e.email,
        valorMensalidade: Math.round(valor * 100) / 100,
        dueDay: e.diaPagamento ?? e.paymentInfo?.dueDay ?? null,
        mesesAtrasados: v.mesesAtrasados,
      }
    })
    .sort((a, b) => b.mesesAtrasados - a.mesesAtrasados)

  return { items }
}

async function buildProfessoresReport(
  year: number,
  month: number | undefined,
  monthsToProcess: { year: number; month: number }[]
) {
  const target = month != null ? { year, month } : monthsToProcess[0]
  const y = target.year
  const m = target.month
  const periodStart = firstDayOfMonth(y, m)
  const periodEnd = lastDayOfMonth(y, m)
  const startKey = toDateKey(periodStart)
  const endKey = toDateKey(periodEnd)
  const holidayRows = await prisma.holiday.findMany({
    where: { dateKey: { gte: startKey, lte: endKey } },
    select: { dateKey: true },
  })
  const holidaySet = new Set(holidayRows.map((h) => h.dateKey))

  const lessonRecord = (prisma as { lessonRecord?: { findMany: (args: unknown) => Promise<unknown[]> } }).lessonRecord
  const teachers = await prisma.teacher.findMany({
    where: { status: 'ACTIVE' },
    select: {
      id: true,
      nome: true,
      valorPorHora: true,
      valorPorPeriodo: true,
      valorExtra: true,
      paymentMonths: { where: { year: y, month: m }, take: 1 },
    },
  })

  let filteredRecords: PaymentRecord[] = []
  if (lessonRecord?.findMany) {
    const recordsInRange = await (lessonRecord as any).findMany({
      where: {
        lesson: {
          teacherId: { in: teachers.map((t) => t.id) },
          startAt: { gte: periodStart, lte: periodEnd },
          status: 'CONFIRMED',
          enrollment: {
            OR: [{ status: { not: 'PAUSED' } }, { pausedAt: null }],
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
            enrollment: { select: { status: true, pausedAt: true } },
          },
        },
      },
    })
    filteredRecords = filterRecordsByPausedEnrollment(recordsInRange as PaymentRecord[])
  }

  const items: { nome: string; totalHorasRegistradas: number; valorPorHora: number; valorAPagar: number; paymentStatus: string | null }[] = []
  let totalGeral = 0
  for (const t of teachers) {
    const pm = t.paymentMonths?.[0] as { paymentStatus: string | null; valorPorPeriodo: unknown; valorExtra: unknown } | undefined
    const valorPorHora = t.valorPorHora != null ? Number(t.valorPorHora) : 0
    const valorPorPeriodo = pm?.valorPorPeriodo != null ? Number(pm.valorPorPeriodo) : (t.valorPorPeriodo != null ? Number(t.valorPorPeriodo) : 0)
    const valorExtra = pm?.valorExtra != null ? Number(pm.valorExtra) : (t.valorExtra != null ? Number(t.valorExtra) : 0)
    const { totalHorasRegistradas, valorAPagar } = computeValorAPagar({
      records: filteredRecords,
      teacherId: t.id,
      periodStart: periodStart.getTime(),
      periodEnd: periodEnd.getTime(),
      holidaySet,
      valorPorHora,
      valorPorPeriodo,
      valorExtra,
    })
    totalGeral += valorAPagar
    items.push({
      nome: t.nome,
      totalHorasRegistradas,
      valorPorHora,
      valorAPagar,
      paymentStatus: pm?.paymentStatus ?? null,
    })
  }

  return { items, totalGeral: Math.round(totalGeral * 100) / 100 }
}

async function buildGeralReport(
  year: number,
  month: number | undefined,
  monthsToProcess: { year: number; month: number }[]
) {
  const receitasData = await buildReceitasReport(year, month, monthsToProcess)
  const despesasData = await buildDespesasReport(year, month, monthsToProcess)

  const receitasPorMes = Array.isArray(receitasData.items)
    ? (receitasData.items as Array<{ year: number; month: number; totalPago?: number }>)
    : []
  const despesasPorMes = Array.isArray(despesasData.items)
    ? (despesasData.items as Array<{ year: number; month: number; professores: number; adminStaff: number; despesasAdmin: number; total: number }>)
    : []

  const items = monthsToProcess.map(({ year: y, month: m }) => {
    let receita = 0
    if (month != null && monthsToProcess.length === 1) {
      receita = (receitasData as { totalPago?: number }).totalPago ?? 0
    } else {
      const rec = receitasPorMes.find((r) => r.year === y && r.month === m)
      receita = rec?.totalPago ?? 0
    }
    let despesaProfessores = 0
    let despesaAdmin = 0
    let despesaOutras = 0
    let totalDespesas = 0
    if (month != null && monthsToProcess.length === 1 && !Array.isArray(despesasData.items)) {
      const d = despesasData as { totalProfessores?: number; totalAdminStaff?: number; totalDespesasAdmin?: number; total?: number }
      despesaProfessores = d.totalProfessores ?? 0
      despesaAdmin = d.totalAdminStaff ?? 0
      despesaOutras = d.totalDespesasAdmin ?? 0
      totalDespesas = d.total ?? 0
    } else {
      const des = despesasPorMes.find((d) => d.year === y && d.month === m)
      despesaProfessores = des?.professores ?? 0
      despesaAdmin = des?.adminStaff ?? 0
      despesaOutras = des?.despesasAdmin ?? 0
      totalDespesas = des?.total ?? 0
    }
    const saldo = receita - totalDespesas
    return {
      mes: m,
      ano: y,
      receita: Math.round(receita * 100) / 100,
      despesaProfessores: Math.round(despesaProfessores * 100) / 100,
      despesaAdmin: Math.round(despesaAdmin * 100) / 100,
      despesaOutras: Math.round(despesaOutras * 100) / 100,
      totalDespesas: Math.round(totalDespesas * 100) / 100,
      saldo: Math.round(saldo * 100) / 100,
    }
  })

  return { items }
}
