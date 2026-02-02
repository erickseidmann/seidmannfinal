/**
 * GET /api/admin/teachers/check-availability?datetime=ISO
 * Para cada professor ativo: disponível nesse dia/hora?
 * Padrão: sem slots cadastrados = disponível em qualquer horário.
 * Com slots = disponível só se o horário cair dentro de algum slot.
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

    const availabilities: Record<string, boolean> = {}
    for (const t of teachers) {
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
      data: { availabilities },
    })
  } catch (error) {
    console.error('[api/admin/teachers/check-availability GET]', error)
    return NextResponse.json(
      { ok: false, message: 'Erro ao verificar disponibilidade' },
      { status: 500 }
    )
  }
}
