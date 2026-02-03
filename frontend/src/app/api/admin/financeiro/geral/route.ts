/**
 * GET /api/admin/financeiro/geral?year=YYYY
 * Retorna entradas e saídas reais por mês para o ano (Financeiro – Geral).
 * Entradas = soma das mensalidades (valorMensalidade) dos alunos com EnrollmentPaymentMonth PAGO no mês.
 * Saídas = soma do valor a pagar aos professores com TeacherPaymentMonth PAGO no mês.
 * Regra: horas usadas no cálculo são sempre as REGISTRADAS (LessonRecord), nunca as estimadas (Lesson).
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/auth'

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

function toDateKey(d: Date): string {
  const y = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${mm}-${day}`
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
    const dados: { mes: string; mesNum: number; entradas: number; saidas: number }[] = []

    // 1) Entradas por mês: EnrollmentPaymentMonth com paymentStatus PAGO + valor do enrollment (valorMensalidade ou paymentInfo.valorMensal)
    for (let month = 1; month <= 12; month++) {
      const paidMonths = await prisma.enrollmentPaymentMonth.findMany({
        where: { year, month, paymentStatus: 'PAGO' },
        include: {
          enrollment: {
            select: {
              valorMensalidade: true,
              paymentInfo: { select: { valorMensal: true } },
            },
          },
        },
      })
      let entradas = 0
      for (const pm of paidMonths) {
        const e = pm.enrollment as { valorMensalidade: unknown; paymentInfo?: { valorMensal: unknown } }
        const val = e.valorMensalidade != null ? Number(e.valorMensalidade) : (e.paymentInfo?.valorMensal != null ? Number(e.paymentInfo.valorMensal) : 0)
        entradas += val
      }
      dados.push({
        mes: MESES[month - 1],
        mesNum: month,
        entradas: Math.round(entradas * 100) / 100,
        saidas: 0, // preenchido abaixo
      })
    }

    // 2) Saídas por mês: TeacherPaymentMonth com paymentStatus PAGO + calcular valorAPagar (mesma lógica do financeiro professores)
    const lessonRecord = (prisma as { lessonRecord?: { findMany: (args: unknown) => Promise<unknown[]> } }).lessonRecord
    if (!lessonRecord?.findMany) {
      return NextResponse.json({
        ok: true,
        data: {
          year,
          meses: MESES,
          dados,
          totalEntradas: dados.reduce((s, d) => s + d.entradas, 0),
          totalSaidas: 0,
          saldo: dados.reduce((s, d) => s + d.entradas, 0),
        },
      })
    }

    const teachers = await prisma.teacher.findMany({
      where: { status: 'ACTIVE' },
      select: {
        id: true,
        valorPorHora: true,
        valorPorPeriodo: true,
        valorExtra: true,
        paymentMonths: true,
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
        where: { year, month, paymentStatus: 'PAGO' },
        select: {
          teacherId: true,
          valorPorPeriodo: true,
          valorExtra: true,
          periodoInicio: true,
          periodoTermino: true,
        },
      })

      const teacherIdsPagos = new Set(paymentMonthsThisMonth.map((pm) => pm.teacherId))
      if (teacherIdsPagos.size === 0) {
        dados[month - 1].saidas = 0
        continue
      }

      // Aulas canceladas não entram no cálculo de saídas (apenas CONFIRMED)
      // Também não contam aulas de alunos PAUSED a partir da data em que foram pausados
      const recordsInRange = await lessonRecord.findMany({
        where: {
          lesson: {
            teacherId: { in: Array.from(teacherIdsPagos) },
            startAt: { gte: periodStart, lte: periodEnd },
            status: 'CONFIRMED',
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

      // Filtrar manualmente aulas de alunos pausados (a partir da data pausedAt)
      const filteredRecords = recordsInRange.filter((r: { lesson: { startAt: Date; enrollment: { status: string; pausedAt: Date | null } } }) => {
        const enrollment = r.lesson.enrollment
        if (enrollment.status === 'PAUSED' && enrollment.pausedAt) {
          const pausedAt = new Date(enrollment.pausedAt)
          pausedAt.setHours(0, 0, 0, 0)
          const lessonDate = new Date(r.lesson.startAt)
          lessonDate.setHours(0, 0, 0, 0)
          return lessonDate < pausedAt
        }
        return true
      })

      let totalSaidasMes = 0
      for (const pm of paymentMonthsThisMonth) {
        const t = teachers.find((x) => x.id === pm.teacherId)
        const valorPorHora = t?.valorPorHora != null ? Number(t.valorPorHora) : 0
        const valorPorPeriodo = pm.valorPorPeriodo != null ? Number(pm.valorPorPeriodo) : (t?.valorPorPeriodo != null ? Number(t.valorPorPeriodo) : 0)
        const valorExtra = pm.valorExtra != null ? Number(pm.valorExtra) : (t?.valorExtra != null ? Number(t.valorExtra) : 0)

        let totalMinutos = 0
        for (const r of filteredRecords) {
          const lesson = r.lesson as { teacherId: string; startAt: Date; durationMinutes: number }
          if (lesson.teacherId !== pm.teacherId) continue
          if (holidaySet.has(toDateKey(new Date(lesson.startAt)))) continue
          const mins = (r as { tempoAulaMinutos: number | null }).tempoAulaMinutos ?? lesson.durationMinutes ?? 60
          totalMinutos += mins
        }
        const totalHoras = totalMinutos / 60 // horas registradas (LessonRecord)
        const valorHoras = totalHoras * valorPorHora
        const valorAPagar = Math.round((valorHoras + valorPorPeriodo + valorExtra) * 100) / 100
        totalSaidasMes += valorAPagar
      }
      dados[month - 1].saidas = Math.round(totalSaidasMes * 100) / 100
    }

    const totalEntradas = Math.round(dados.reduce((s, d) => s + d.entradas, 0) * 100) / 100
    const totalSaidas = Math.round(dados.reduce((s, d) => s + d.saidas, 0) * 100) / 100
    const saldo = Math.round((totalEntradas - totalSaidas) * 100) / 100

    return NextResponse.json({
      ok: true,
      data: {
        year,
        meses: MESES,
        dados,
        totalEntradas,
        totalSaidas,
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
