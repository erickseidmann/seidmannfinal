/**
 * GET /api/professor/availability/week-summary
 * Resumo: minutos no padrão semanal + minutos de aulas na semana atual (domingo a sábado, fuso BR)
 * que se sobrepõem à disponibilidade.
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireTeacher } from '@/lib/auth'
import { getStartOfWeekInTZ, addDaysInTZ, ymdInTZ } from '@/lib/datetime'
import {
  computeUsedMinutesOverlappingSlots,
  totalWeeklyPatternAvailableMinutes,
  type TeacherAvailSlot,
} from '@/lib/teacher-availability-metrics'

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
      select: { id: true },
    })
    if (!teacher) {
      return NextResponse.json({ ok: false, message: 'Professor não encontrado' }, { status: 404 })
    }

    const slots = await prisma.teacherAvailabilitySlot.findMany({
      where: { teacherId: teacher.id },
      select: { dayOfWeek: true, startMinutes: true, endMinutes: true },
    })

    const totalWeeklyAvailableMinutes = totalWeeklyPatternAvailableMinutes(slots as TeacherAvailSlot[])

    const now = new Date()
    const weekAnchor = getStartOfWeekInTZ(now)
    const weekStartKey = ymdInTZ(weekAnchor)
    const periodStart = new Date(`${weekStartKey}T00:00:00-03:00`)
    const periodEndExclusive = new Date(periodStart.getTime() + 7 * 24 * 60 * 60 * 1000)

    const weekEndSaturday = addDaysInTZ(weekAnchor, 6)
    const weekEndKey = ymdInTZ(weekEndSaturday)

    const holidayRows = await prisma.holiday.findMany({
      where: { dateKey: { gte: weekStartKey, lte: weekEndKey } },
      select: { dateKey: true },
    })
    const holidaySet = new Set(holidayRows.map((h) => h.dateKey))

    const lessons = await prisma.lesson.findMany({
      where: {
        teacherId: teacher.id,
        startAt: { gte: periodStart, lt: periodEndExclusive },
        status: { in: ['CONFIRMED', 'REPOSICAO'] },
      },
      select: { startAt: true, durationMinutes: true },
    })

    const usedMinutesWeek = computeUsedMinutesOverlappingSlots(
      lessons,
      slots as TeacherAvailSlot[],
      periodStart.getTime(),
      periodEndExclusive.getTime(),
      holidaySet
    )

    const d0 = new Date(`${weekStartKey}T12:00:00-03:00`)
    const d1 = new Date(`${weekEndKey}T12:00:00-03:00`)
    const weekLabel = `${d0.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })} – ${d1.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })}`

    return NextResponse.json({
      ok: true,
      data: {
        weekStartKey,
        weekEndKey,
        weekLabel,
        totalWeeklyAvailableMinutes,
        usedMinutesWeek,
      },
    })
  } catch (error) {
    console.error('[api/professor/availability/week-summary GET]', error)
    return NextResponse.json(
      { ok: false, message: 'Erro ao carregar resumo da semana' },
      { status: 500 }
    )
  }
}
