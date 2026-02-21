/**
 * GET /api/admin/financeiro/geral?year=YYYY
 * Retorna entradas, previsão de entradas e todas as saídas (professores, admin, gastos) por mês.
 * Entradas = mensalidades PAGO. Previsão = mensalidades ainda não pagas (ativos no mês).
 * Saídas = professores (pago + a pagar) + admin (pago + a pagar) + gastos (pago + a pagar).
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

const SUPER_ADMIN_EMAIL = 'admin@seidmann.com'

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

function wasActiveInMonth(
  status: string,
  inactiveAt: Date | null,
  pausedAt: Date | null,
  year: number,
  month: number
): boolean {
  if (status !== 'INACTIVE') return true
  if (!inactiveAt) return false
  const d = new Date(inactiveAt)
  const anoInativo = d.getFullYear()
  const mesInativo = d.getMonth() + 1
  return year < anoInativo || (year === anoInativo && month < mesInativo)
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
    const year = yearParam ? parseInt(yearParam, 10) : new Date().getFullYear()
    if (Number.isNaN(year) || year < 2000 || year > 2100) {
      return NextResponse.json(
        { ok: false, message: 'Ano inválido (use year=YYYY)' },
        { status: 400 }
      )
    }

    const MESES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']
    type DadoMes = {
      mes: string
      mesNum: number
      entradas: number
      entradasPrevistas: number
      saidasProfessores: number
      saidasProfessoresAPagar: number
      saidasAdmin: number
      saidasAdminAPagar: number
      saidasGastos: number
      saidasGastosAPagar: number
    }
    const dados: DadoMes[] = MESES.map((mes, i) => ({
      mes,
      mesNum: i + 1,
      entradas: 0,
      entradasPrevistas: 0,
      saidasProfessores: 0,
      saidasProfessoresAPagar: 0,
      saidasAdmin: 0,
      saidasAdminAPagar: 0,
      saidasGastos: 0,
      saidasGastosAPagar: 0,
    }))

    // 1) Entradas e previsão por mês
    const allPaymentMonths = await prisma.enrollmentPaymentMonth.findMany({
      where: { year },
      include: {
        enrollment: {
          select: {
            id: true,
            status: true,
            inactiveAt: true,
            pausedAt: true,
            valorMensalidade: true,
            paymentInfo: { select: { valorMensal: true } },
          },
        },
      },
    })

    const allEnrollments = await prisma.enrollment.findMany({
      where: {
        status: { in: ['ACTIVE', 'PAUSED', 'INACTIVE'] },
        OR: [{ valorMensalidade: { not: null } }, { paymentInfo: { valorMensal: { not: null } } }],
      },
      select: {
        id: true,
        status: true,
        inactiveAt: true,
        pausedAt: true,
        valorMensalidade: true,
        paymentInfo: { select: { valorMensal: true } },
      },
    })

    for (let month = 1; month <= 12; month++) {
      let entradas = 0
      let entradasPrevistas = 0
      const paidIds = new Set(
        allPaymentMonths
          .filter((pm) => pm.year === year && pm.month === month && pm.paymentStatus === 'PAGO')
          .map((pm) => pm.enrollmentId)
      )
      for (const e of allEnrollments) {
        const enr = e as { status: string; inactiveAt: Date | null; pausedAt: Date | null; valorMensalidade: unknown; paymentInfo?: { valorMensal: unknown } }
        if (!wasActiveInMonth(enr.status, enr.inactiveAt, enr.pausedAt, year, month)) continue
        const val = enr.valorMensalidade != null ? Number(enr.valorMensalidade) : (enr.paymentInfo?.valorMensal != null ? Number(enr.paymentInfo.valorMensal) : 0)
        if (val <= 0) continue
        if (paidIds.has(e.id)) {
          entradas += val
        } else {
          entradasPrevistas += val
        }
      }
      dados[month - 1].entradas = Math.round(entradas * 100) / 100
      dados[month - 1].entradasPrevistas = Math.round(entradasPrevistas * 100) / 100
    }

    // 2) Saídas professores (pago + a pagar)
    const lessonRecord = (prisma as { lessonRecord?: { findMany: (args: unknown) => Promise<unknown[]> } }).lessonRecord
    if (lessonRecord?.findMany) {
      const teachers = await prisma.teacher.findMany({
        where: { status: 'ACTIVE' },
        select: {
          id: true,
          valorPorHora: true,
          valorPorPeriodo: true,
          valorExtra: true,
        },
      })

      for (let month = 1; month <= 12; month++) {
        const periodStart = firstDayOfMonth(year, month)
        const periodEnd = lastDayOfMonth(year, month)
        const startKey = toDateKey(periodStart)
        const endKey = toDateKey(periodEnd)
        const holidayRows = await prisma.holiday.findMany({
          where: { dateKey: { gte: startKey, lte: endKey } },
          select: { dateKey: true },
        })
        const holidaySet = new Set(holidayRows.map((h) => h.dateKey))

        const paymentMonthsThisMonth = await prisma.teacherPaymentMonth.findMany({
          where: { year, month },
          select: {
            teacherId: true,
            paymentStatus: true,
            valorPorPeriodo: true,
            valorExtra: true,
            periodoInicio: true,
            periodoTermino: true,
          },
        })

        const recordsInRange = await lessonRecord.findMany({
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

        let saidasProfPago = 0
        let saidasProfAPagar = 0
        const teacherIdsWithRecords = new Set(
          filteredRecords.map((r: PaymentRecord) => (r.lesson as { teacherId: string }).teacherId)
        )
        for (const t of teachers) {
          if (!teacherIdsWithRecords.has(t.id)) continue
          const pm = paymentMonthsThisMonth.find((p) => p.teacherId === t.id)
          const valorPorHora = t.valorPorHora != null ? Number(t.valorPorHora) : 0
          const valorPorPeriodo =
            pm?.valorPorPeriodo != null ? Number(pm.valorPorPeriodo) : (t.valorPorPeriodo != null ? Number(t.valorPorPeriodo) : 0)
          const valorExtra = pm?.valorExtra != null ? Number(pm.valorExtra) : (t.valorExtra != null ? Number(t.valorExtra) : 0)
          const { valorAPagar } = computeValorAPagar({
            records: filteredRecords,
            teacherId: t.id,
            periodStart: periodStart.getTime(),
            periodEnd: periodEnd.getTime(),
            holidaySet,
            valorPorHora,
            valorPorPeriodo,
            valorExtra,
          })
          if (pm?.paymentStatus === 'PAGO') {
            saidasProfPago += valorAPagar
          } else {
            saidasProfAPagar += valorAPagar
          }
        }
        dados[month - 1].saidasProfessores = Math.round(saidasProfPago * 100) / 100
        dados[month - 1].saidasProfessoresAPagar = Math.round(saidasProfAPagar * 100) / 100
      }
    }

    // 3) Saídas admin (pago + a pagar)
    if (prisma.adminUserPaymentMonth) {
      const adminUsers = await prisma.user.findMany({
        where: { role: 'ADMIN', email: { not: SUPER_ADMIN_EMAIL } },
        select: { id: true },
      })
      const adminPayments = await prisma.adminUserPaymentMonth.findMany({
        where: { year },
      })
      const previousPayments = await prisma.adminUserPaymentMonth.findMany({
        where: { year: { lte: year } },
        select: { userId: true, year: true, month: true, valor: true },
      })
      const previousByUser = new Map<string, { year: number; month: number; valor: number }[]>()
      for (const p of previousPayments) {
        if (p.valor != null) {
          const list = previousByUser.get(p.userId) ?? []
          list.push({ year: p.year, month: p.month, valor: Number(p.valor) })
          previousByUser.set(p.userId, list)
        }
      }
      for (const list of previousByUser.values()) {
        list.sort((a, b) => (a.year !== b.year ? b.year - a.year : b.month - a.month))
      }

      for (let month = 1; month <= 12; month++) {
        let adminPago = 0
        let adminAPagar = 0
        for (const u of adminUsers) {
          const pm = adminPayments.find((p) => p.userId === u.id && p.year === year && p.month === month)
          let valor = pm?.valor != null ? Number(pm.valor) : 0
          if (valor === 0) {
            const prevList = previousByUser.get(u.id)
            if (prevList) {
              const prev = prevList.find((p) => p.year < year || (p.year === year && p.month < month))
              valor = prev?.valor ?? 0
            }
          }
          if (valor <= 0) continue
          if (pm?.paymentStatus === 'PAGO') adminPago += valor
          else adminAPagar += valor
        }
        dados[month - 1].saidasAdmin = Math.round(adminPago * 100) / 100
        dados[month - 1].saidasAdminAPagar = Math.round(adminAPagar * 100) / 100
      }
    }

    // 4) Saídas gastos (admin expenses)
    if (prisma.adminExpense) {
      const expenses = await prisma.adminExpense.findMany({
        where: { year },
      })
      for (let month = 1; month <= 12; month++) {
        let gastosPago = 0
        let gastosAPagar = 0
        for (const e of expenses) {
          if (e.year !== year || e.month !== month) continue
          const v = Number(e.valor)
          if (e.paymentStatus === 'PAGO') gastosPago += v
          else gastosAPagar += v
        }
        dados[month - 1].saidasGastos = Math.round(gastosPago * 100) / 100
        dados[month - 1].saidasGastosAPagar = Math.round(gastosAPagar * 100) / 100
      }
    }

    const totalEntradas = Math.round(dados.reduce((s, d) => s + d.entradas, 0) * 100) / 100
    const totalEntradasPrevistas = Math.round(dados.reduce((s, d) => s + d.entradasPrevistas, 0) * 100) / 100
    const totalSaidas =
      Math.round(
        dados.reduce(
          (s, d) =>
            s +
            d.saidasProfessores +
            d.saidasProfessoresAPagar +
            d.saidasAdmin +
            d.saidasAdminAPagar +
            d.saidasGastos +
            d.saidasGastosAPagar,
          0
        ) * 100
      ) / 100
    const totalSaidasPagas = Math.round(
      dados.reduce((s, d) => s + d.saidasProfessores + d.saidasAdmin + d.saidasGastos, 0) * 100
    ) / 100
    const totalSaidasAPagar = Math.round(
      dados.reduce(
        (s, d) => s + d.saidasProfessoresAPagar + d.saidasAdminAPagar + d.saidasGastosAPagar,
        0
      ) * 100
    ) / 100
    const saldo = Math.round((totalEntradas - totalSaidasPagas) * 100) / 100

    return NextResponse.json({
      ok: true,
      data: {
        year,
        meses: MESES,
        dados,
        totalEntradas,
        totalEntradasPrevistas,
        totalSaidas,
        totalSaidasPagas,
        totalSaidasAPagar,
        saldo,
      },
    })
  } catch (error) {
    console.error('[api/admin/financeiro/geral GET]', error)
    return NextResponse.json(
      { ok: false, message: 'Erro ao carregar dados do financeiro geral' },
      { status: 500 }
    )
  }
}
