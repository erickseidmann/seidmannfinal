/**
 * GET /api/admin/lessons/enrollments-with-full-week?weekStart=ISO
 * Retorna IDs de matrículas (enrollments) que já têm a frequência correta na semana.
 * Aula cancelada não conta; reposição conta.
 * Semana = segunda 00:00 a sábado 23:59 (weekStart = segunda 00:00).
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/auth'

function getSaturdayEnd(monday: Date): Date {
  const sat = new Date(monday)
  sat.setDate(sat.getDate() + 5)
  sat.setHours(23, 59, 59, 999)
  return sat
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
    const weekStartParam = request.nextUrl.searchParams.get('weekStart')
    if (!weekStartParam) {
      return NextResponse.json(
        { ok: false, message: 'Parâmetro weekStart (segunda-feira ISO) é obrigatório' },
        { status: 400 }
      )
    }
    const monday = new Date(weekStartParam)
    if (Number.isNaN(monday.getTime())) {
      return NextResponse.json(
        { ok: false, message: 'weekStart inválido' },
        { status: 400 }
      )
    }
    monday.setHours(0, 0, 0, 0)
    const saturdayEnd = getSaturdayEnd(monday)

    const enrollments = await prisma.enrollment.findMany({
      where: { status: { in: ['ACTIVE', 'PAUSED'] } },
      select: { id: true, frequenciaSemanal: true },
    })

    const lessonsInWeek = await prisma.lesson.findMany({
      where: {
        startAt: { gte: monday, lte: saturdayEnd },
        status: { in: ['CONFIRMED', 'REPOSICAO'] },
      },
      select: { enrollmentId: true },
    })

    const countByEnrollment = new Map<string, number>()
    for (const l of lessonsInWeek) {
      countByEnrollment.set(l.enrollmentId, (countByEnrollment.get(l.enrollmentId) ?? 0) + 1)
    }

    const enrollmentIds: string[] = []
    for (const e of enrollments) {
      const freq = e.frequenciaSemanal
      if (freq == null) continue
      const count = countByEnrollment.get(e.id) ?? 0
      if (count >= freq) enrollmentIds.push(e.id)
    }

    return NextResponse.json({
      ok: true,
      data: { enrollmentIds },
    })
  } catch (error) {
    console.error('[api/admin/lessons/enrollments-with-full-week]', error)
    return NextResponse.json(
      { ok: false, message: 'Erro ao verificar frequência' },
      { status: 500 }
    )
  }
}
