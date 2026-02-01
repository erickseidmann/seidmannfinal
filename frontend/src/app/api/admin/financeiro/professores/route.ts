/**
 * API: GET /api/admin/financeiro/professores
 * Lista professores ativos; cada um com seu próprio período (periodoPagamentoInicio/Termino).
 * Horas e valor a pagar são calculados no período específico de cada professor.
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

    const now = new Date()
    const defaultStart = firstDayOfMonth(now)
    const defaultEnd = lastDayOfMonth(now)

    const teachers = await prisma.teacher.findMany({
      where: { status: 'ACTIVE' },
      select: {
        id: true,
        nome: true,
        valorPorHora: true,
        periodoPagamentoInicio: true,
        periodoPagamentoTermino: true,
      },
      orderBy: { nome: 'asc' },
    })

    const lessonRecord = (prisma as { lessonRecord?: { findMany: (args: unknown) => Promise<unknown[]> } }).lessonRecord
    if (!lessonRecord?.findMany) {
      return NextResponse.json(
        { ok: false, message: 'Modelo LessonRecord não disponível. Rode: npx prisma generate' },
        { status: 503 }
      )
    }

    // Período global para buscar dados: do menor início ao maior término entre os professores
    let globalStart = defaultStart.getTime()
    let globalEnd = defaultEnd.getTime()
    const teacherPeriods: { id: string; start: number; end: number }[] = []

    for (const t of teachers) {
      const start = t.periodoPagamentoInicio ? startOfDay(t.periodoPagamentoInicio).getTime() : defaultStart.getTime()
      const end = t.periodoPagamentoTermino ? endOfDay(t.periodoPagamentoTermino).getTime() : defaultEnd.getTime()
      if (start < globalStart) globalStart = start
      if (end > globalEnd) globalEnd = end
      teacherPeriods.push({ id: t.id, start, end })
    }

    const globalStartDate = new Date(globalStart)
    const globalEndDate = new Date(globalEnd)

    // Aulas no intervalo global (para contagem por professor no período dele)
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

    const recordsInRange = await (prisma as any).lessonRecord.findMany({
      where: {
        lesson: {
          teacherId: { in: teachers.map((t) => t.id) },
          startAt: { gte: globalStartDate, lte: globalEndDate },
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
          },
        },
      },
    })

    const list = teachers.map((t) => {
      const period = teacherPeriods.find((p) => p.id === t.id)!
      const valorPorHora = t.valorPorHora != null ? Number(t.valorPorHora) : 0

      let totalMinutos = 0
      let totalRegistrosEsperados = 0

      for (const r of recordsInRange) {
        const lesson = r.lesson as { teacherId: string; startAt: Date; durationMinutes: number }
        if (lesson.teacherId !== t.id) continue
        const startAt = new Date(lesson.startAt).getTime()
        if (startAt < period.start || startAt > period.end) continue
        const mins = r.tempoAulaMinutos ?? lesson.durationMinutes ?? 60
        totalMinutos += mins
      }

      for (const l of lessonsInRange) {
        if (l.teacherId !== t.id) continue
        const startAt = new Date(l.startAt).getTime()
        if (startAt < period.start || startAt > period.end) continue
        totalRegistrosEsperados += 1
      }

      const totalHorasRegistradas = Math.round((totalMinutos / 60) * 100) / 100
      const valorAPagar = Math.round(totalHorasRegistradas * valorPorHora * 100) / 100

      const dataInicioISO = new Date(period.start).toISOString().slice(0, 10)
      const dataTerminoISO = new Date(period.end).toISOString().slice(0, 10)

      return {
        id: t.id,
        nome: t.nome,
        valorPorHora,
        dataInicio: dataInicioISO,
        dataTermino: dataTerminoISO,
        totalHorasRegistradas,
        totalRegistrosEsperados,
        valorAPagar,
      }
    })

    return NextResponse.json({
      ok: true,
      data: {
        professores: list,
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
