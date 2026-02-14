/**
 * API Route: GET /api/professor/availability
 * 
 * Retorna os slots de disponibilidade do professor logado
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireTeacher } from '@/lib/auth'

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
      return NextResponse.json(
        { ok: false, message: 'Professor não encontrado' },
        { status: 404 }
      )
    }

    const slots = await prisma.teacherAvailabilitySlot.findMany({
      where: { teacherId: teacher.id },
      orderBy: [{ dayOfWeek: 'asc' }, { startMinutes: 'asc' }],
    })

    return NextResponse.json({
      ok: true,
      data: {
        slots: slots.map((s) => ({
          dayOfWeek: s.dayOfWeek,
          startMinutes: s.startMinutes,
          endMinutes: s.endMinutes,
        })),
      },
    })
  } catch (error) {
    console.error('[api/professor/availability GET]', error)
    return NextResponse.json(
      { ok: false, message: 'Erro ao buscar disponibilidade' },
      { status: 500 }
    )
  }
}
