/**
 * GET /api/admin/teachers/free-slots?dayOfWeeks=1,3,5&startMinutes=540&endMinutes=600
 * Retorna professores que têm o horário nos dias selecionados na disponibilidade e não têm aula nesse horário.
 * dayOfWeeks: 0=Dom, 1=Seg, ..., 6=Sáb (pelo menos 1 obrigatório)
 * startMinutes/endMinutes: ex. 540=09:00, 600=10:00
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/auth'

/** Retorna a próxima data para um dayOfWeek (0-6) a partir de hoje */
function nextDateForDayOfWeek(dayOfWeek: number): Date {
  const now = new Date()
  const currentDay = now.getDay()
  let daysAhead = dayOfWeek - currentDay
  if (daysAhead <= 0) daysAhead += 7
  const d = new Date(now)
  d.setDate(now.getDate() + daysAhead)
  d.setHours(0, 0, 0, 0)
  return d
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

    // Professores que têm o slot em TODOS os dias selecionados na disponibilidade
    const teachersWithSlot: string[] = []
    for (const t of teachers) {
      const teacherSlots = slotsByTeacher.get(t.id) ?? []
      const hasSlotForAllDays = dayOfWeeks.every((dow) =>
        teacherSlots.some(
          (slot) =>
            slot.dayOfWeek === dow &&
            startMinutes >= slot.startMinutes &&
            endMinutes <= slot.endMinutes
        )
      )
      if (hasSlotForAllDays) teachersWithSlot.push(t.id)
    }

    // Para cada (teacherId, dayOfWeek) em teachersWithSlot, calcular próxima data e verificar se tem aula
    const teacherIdsWithConflict = new Set<string>()
    for (const teacherId of teachersWithSlot) {
      for (const dow of dayOfWeeks) {
        const date = nextDateForDayOfWeek(dow)
        const startAt = new Date(date)
        startAt.setHours(Math.floor(startMinutes / 60), startMinutes % 60, 0, 0)
        const endAt = new Date(startAt.getTime() + (endMinutes - startMinutes) * 60 * 1000)
        const dayStart = new Date(date)
        dayStart.setHours(0, 0, 0, 0)
        const dayEnd = new Date(date)
        dayEnd.setHours(23, 59, 59, 999)
        const lessonsOnDay = await prisma.lesson.findMany({
          where: {
            teacherId,
            status: { not: 'CANCELLED' },
            startAt: { gte: dayStart, lte: dayEnd },
          },
          select: { startAt: true, durationMinutes: true },
        })
        const hasOverlap = lessonsOnDay.some((lesson) => {
          const lessonEnd = new Date(
            lesson.startAt.getTime() + (lesson.durationMinutes ?? 60) * 60 * 1000
          )
          return startAt < lessonEnd && endAt > lesson.startAt
        })
        if (hasOverlap) {
          teacherIdsWithConflict.add(teacherId)
          break
        }
      }
    }

    const freeTeacherIds = teachersWithSlot.filter((id) => !teacherIdsWithConflict.has(id))
    const result = teachers
      .filter((t) => freeTeacherIds.includes(t.id))
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
