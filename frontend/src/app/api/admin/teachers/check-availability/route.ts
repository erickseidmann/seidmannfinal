/**
 * GET /api/admin/teachers/check-availability?datetime=ISO&durationMinutes=60&excludeLessonId=xxx
 * Para cada professor ativo: disponível nesse dia/hora?
 * - Sem slots cadastrados = disponível em qualquer horário.
 * - Com slots = disponível só se o horário cair dentro de algum slot.
 * - Se já tem outra aula no mesmo horário (sobreposição), indisponível e retorna conflito (já tem aula com ...).
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/auth'

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
    const datetimeParam = searchParams.get('datetime')
    const durationMinutes = Math.max(0, parseInt(searchParams.get('durationMinutes') ?? '60', 10) || 60)
    const excludeLessonId = searchParams.get('excludeLessonId') ?? null

    if (!datetimeParam) {
      return NextResponse.json(
        { ok: false, message: 'Parâmetro datetime (ISO) é obrigatório' },
        { status: 400 }
      )
    }
    const dt = new Date(datetimeParam)
    if (Number.isNaN(dt.getTime())) {
      return NextResponse.json(
        { ok: false, message: 'Data/hora inválida' },
        { status: 400 }
      )
    }
    const dayOfWeek = dt.getDay()
    const minutesOfDay = dt.getHours() * 60 + dt.getMinutes()
    const startAt = new Date(dt)
    const endAt = new Date(dt.getTime() + durationMinutes * 60 * 1000)

    const teachers = await prisma.teacher.findMany({
      where: { status: 'ACTIVE' },
      select: { id: true },
    })
    const teacherIds = teachers.map((t) => t.id)

    const slots = await prisma.teacherAvailabilitySlot.findMany({
      where: { teacherId: { in: teacherIds } },
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

    const existingLessons = await prisma.lesson.findMany({
      where: {
        teacherId: { in: teacherIds },
        status: { not: 'CANCELLED' },
        ...(excludeLessonId ? { id: { not: excludeLessonId } } : {}),
      },
      select: {
        teacherId: true,
        startAt: true,
        durationMinutes: true,
        enrollment: { select: { nome: true } },
      },
    })

    const conflicts: Record<string, string> = {}
    for (const l of existingLessons) {
      const lessonStart = new Date(l.startAt)
      const lessonEnd = new Date(lessonStart.getTime() + (l.durationMinutes ?? 60) * 60 * 1000)
      if (startAt < lessonEnd && endAt > lessonStart) {
        const studentName = (l.enrollment as { nome: string })?.nome ?? 'aluno'
        if (!conflicts[l.teacherId] || conflicts[l.teacherId] === studentName) {
          conflicts[l.teacherId] = studentName
        }
      }
    }

    const availabilities: Record<string, boolean> = {}
    for (const t of teachers) {
      if (conflicts[t.id]) {
        availabilities[t.id] = false
        continue
      }
      const teacherSlots = slotsByTeacher.get(t.id)
      if (!teacherSlots || teacherSlots.length === 0) {
        availabilities[t.id] = true
        continue
      }
      const inSlot = teacherSlots.some(
        (slot) =>
          slot.dayOfWeek === dayOfWeek &&
          minutesOfDay >= slot.startMinutes &&
          minutesOfDay < slot.endMinutes
      )
      availabilities[t.id] = inSlot
    }

    return NextResponse.json({
      ok: true,
      data: { availabilities, conflicts },
    })
  } catch (error) {
    console.error('[api/admin/teachers/check-availability GET]', error)
    return NextResponse.json(
      { ok: false, message: 'Erro ao verificar disponibilidade' },
      { status: 500 }
    )
  }
}
