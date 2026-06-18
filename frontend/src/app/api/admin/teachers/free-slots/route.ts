/**
 * GET /api/admin/teachers/free-slots?dayOfWeeks=1,3,5&startMinutes=540&endMinutes=600
 * Retorna professores que têm o horário nos dias selecionados na disponibilidade e não têm aula nesse horário.
 * dayOfWeeks: 0=Dom, 1=Seg, ..., 6=Sáb (pelo menos 1 obrigatório)
 * startMinutes/endMinutes: ex. 540=09:00, 600=10:00
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/auth'
import { LESSON_STATUSES_SCHEDULED } from '@/lib/lesson-status'
import { startOfCalendarDayBrazilDateKey, ymdInTZ } from '@/lib/datetime'
import {
  lessonConflictsWithWeeklySlot,
  teacherMatchesAvailabilitySlots,
} from '@/lib/teacher-free-slots'

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
    const dayOfWeeksParam = searchParams.get('dayOfWeeks')
    const startMinutes = Math.max(0, parseInt(searchParams.get('startMinutes') ?? '540', 10) || 540)
    const endMinutes = Math.max(0, parseInt(searchParams.get('endMinutes') ?? '600', 10) || 600)

    if (!dayOfWeeksParam || !dayOfWeeksParam.trim()) {
      return NextResponse.json(
        { ok: false, message: 'Selecione ao menos um dia da semana (dayOfWeeks)' },
        { status: 400 }
      )
    }
    const dayOfWeeks = dayOfWeeksParam
      .split(',')
      .map((s) => parseInt(s.trim(), 10))
      .filter((d) => d >= 0 && d <= 6)
    if (dayOfWeeks.length === 0) {
      return NextResponse.json(
        { ok: false, message: 'Selecione ao menos um dia da semana válido (0-6)' },
        { status: 400 }
      )
    }

    if (endMinutes <= startMinutes) {
      return NextResponse.json(
        { ok: false, message: 'O horário final deve ser depois do horário inicial' },
        { status: 400 }
      )
    }

    const teachers = await prisma.teacher.findMany({
      where: { status: 'ACTIVE' },
      select: { id: true, nome: true, idiomasFala: true, idiomasEnsina: true },
    })
    const slots = await prisma.teacherAvailabilitySlot.findMany({
      where: { teacherId: { in: teachers.map((t) => t.id) } },
      select: { teacherId: true, dayOfWeek: true, startMinutes: true, endMinutes: true },
    })
    const slotsByTeacher = new Map<string, { dayOfWeek: number; startMinutes: number; endMinutes: number }[]>()
    for (const s of slots) {
      if (!slotsByTeacher.has(s.teacherId)) slotsByTeacher.set(s.teacherId, [])
      slotsByTeacher.get(s.teacherId)!.push({
        dayOfWeek: s.dayOfWeek,
        startMinutes: s.startMinutes,
        endMinutes: s.endMinutes,
      })
    }

    const teachersWithSlot = teachers
      .filter((t) =>
        teacherMatchesAvailabilitySlots(
          slotsByTeacher.get(t.id) ?? [],
          dayOfWeeks,
          startMinutes,
          endMinutes
        )
      )
      .map((t) => t.id)

    const todayKey = ymdInTZ(new Date())
    const lessonsFromToday = startOfCalendarDayBrazilDateKey(todayKey) ?? new Date()

    const lessons = await prisma.lesson.findMany({
      where: {
        teacherId: { in: teachersWithSlot },
        status: { in: [...LESSON_STATUSES_SCHEDULED] },
        startAt: { gte: lessonsFromToday },
      },
      select: { teacherId: true, startAt: true, durationMinutes: true },
    })

    const teacherIdsWithConflict = new Set<string>()
    for (const lesson of lessons) {
      if (!lesson.teacherId) continue
      if (
        lessonConflictsWithWeeklySlot({
          lessonStartAt: lesson.startAt,
          durationMinutes: lesson.durationMinutes ?? 60,
          dayOfWeeks,
          slotStartMinutes: startMinutes,
          slotEndMinutes: endMinutes,
        })
      ) {
        teacherIdsWithConflict.add(lesson.teacherId)
      }
    }

    const freeTeacherIds = new Set(
      teachersWithSlot.filter((id) => !teacherIdsWithConflict.has(id))
    )
    const result = teachers
      .filter((t) => freeTeacherIds.has(t.id))
      .map((t) => ({
        id: t.id,
        nome: t.nome,
        idiomasFala: Array.isArray(t.idiomasFala) ? t.idiomasFala : (t.idiomasFala ? [t.idiomasFala] : []),
        idiomasEnsina: Array.isArray(t.idiomasEnsina) ? t.idiomasEnsina : (t.idiomasEnsina ? [t.idiomasEnsina] : []),
      }))

    return NextResponse.json({
      ok: true,
      data: { teachers: result },
    })
  } catch (error) {
    console.error('[api/admin/teachers/free-slots]', error)
    return NextResponse.json(
      { ok: false, message: 'Erro ao buscar horários livres' },
      { status: 500 }
    )
  }
}
