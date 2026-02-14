/**
 * GET  /api/admin/teachers/[id]/availability — lista horários disponíveis do professor
 * POST /api/admin/teachers/[id]/availability — adiciona um horário (body: dayOfWeek, startMinutes, endMinutes)
 * PUT  /api/admin/teachers/[id]/availability — substitui todos os horários (body: { slots: [{ dayOfWeek, startMinutes, endMinutes }] })
 * DELETE /api/admin/teachers/[id]/availability?slotId=xxx — remove um horário
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/auth'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAdmin(_request)
    if (!auth.authorized) {
      return NextResponse.json(
        { ok: false, message: auth.message || 'Não autorizado' },
        { status: auth.message?.includes('Não autenticado') ? 401 : 403 }
      )
    }
    const { id: teacherId } = await params
    const slots = await prisma.teacherAvailabilitySlot.findMany({
      where: { teacherId },
      orderBy: [{ dayOfWeek: 'asc' }, { startMinutes: 'asc' }],
    })
    return NextResponse.json({
      ok: true,
      data: {
        slots: slots.map((s) => ({
          id: s.id,
          dayOfWeek: s.dayOfWeek,
          startMinutes: s.startMinutes,
          endMinutes: s.endMinutes,
        })),
      },
    })
  } catch (error) {
    console.error('[api/admin/teachers/[id]/availability GET]', error)
    return NextResponse.json(
      { ok: false, message: 'Erro ao listar horários' },
      { status: 500 }
    )
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAdmin(request)
    if (!auth.authorized) {
      return NextResponse.json(
        { ok: false, message: auth.message || 'Não autorizado' },
        { status: auth.message?.includes('Não autenticado') ? 401 : 403 }
      )
    }
    const { id: teacherId } = await params
    const teacher = await prisma.teacher.findUnique({ where: { id: teacherId } })
    if (!teacher) {
      return NextResponse.json(
        { ok: false, message: 'Professor não encontrado' },
        { status: 404 }
      )
    }
    const body = await request.json().catch(() => ({}))
    const dayOfWeek = body.dayOfWeek != null ? Number(body.dayOfWeek) : null
    const startMinutes = body.startMinutes != null ? Number(body.startMinutes) : null
    const endMinutes = body.endMinutes != null ? Number(body.endMinutes) : null
    if (
      dayOfWeek == null ||
      dayOfWeek < 0 ||
      dayOfWeek > 6 ||
      startMinutes == null ||
      startMinutes < 0 ||
      startMinutes > 1439 ||
      endMinutes == null ||
      endMinutes < 0 ||
      endMinutes > 1439 ||
      startMinutes >= endMinutes
    ) {
      return NextResponse.json(
        { ok: false, message: 'dayOfWeek (0-6), startMinutes e endMinutes válidos obrigatórios; início < fim' },
        { status: 400 }
      )
    }
    const slot = await prisma.teacherAvailabilitySlot.create({
      data: { teacherId, dayOfWeek, startMinutes, endMinutes },
    })
    return NextResponse.json({
      ok: true,
      data: {
        slot: {
          id: slot.id,
          dayOfWeek: slot.dayOfWeek,
          startMinutes: slot.startMinutes,
          endMinutes: slot.endMinutes,
        },
      },
    })
  } catch (error: unknown) {
    console.error('[api/admin/teachers/[id]/availability POST]', error)
    const message =
      error instanceof Error
        ? error.message
        : (error as { message?: string })?.message ?? 'Erro ao adicionar horário. Rode: npx prisma migrate deploy e npx prisma generate.'
    return NextResponse.json(
      { ok: false, message },
      { status: 500 }
    )
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAdmin(request)
    if (!auth.authorized) {
      return NextResponse.json(
        { ok: false, message: auth.message || 'Não autorizado' },
        { status: auth.message?.includes('Não autenticado') ? 401 : 403 }
      )
    }
    const { id: teacherId } = await params
    const teacher = await prisma.teacher.findUnique({ where: { id: teacherId } })
    if (!teacher) {
      return NextResponse.json(
        { ok: false, message: 'Professor não encontrado' },
        { status: 404 }
      )
    }
    const body = await request.json().catch(() => ({}))
    const slots = Array.isArray(body.slots) ? body.slots : []
    const valid = slots.every(
      (s: unknown) =>
        typeof s === 'object' &&
        s != null &&
        typeof (s as { dayOfWeek?: unknown }).dayOfWeek === 'number' &&
        typeof (s as { startMinutes?: unknown }).startMinutes === 'number' &&
        typeof (s as { endMinutes?: unknown }).endMinutes === 'number'
    )
    if (!valid) {
      return NextResponse.json(
        { ok: false, message: 'Body deve conter slots: [{ dayOfWeek, startMinutes, endMinutes }]' },
        { status: 400 }
      )
    }
    for (const s of slots as { dayOfWeek: number; startMinutes: number; endMinutes: number }[]) {
      if (
        s.dayOfWeek < 0 || s.dayOfWeek > 6 ||
        s.startMinutes < 0 || s.startMinutes > 1439 ||
        s.endMinutes < 0 || s.endMinutes > 1439 ||
        s.startMinutes >= s.endMinutes
      ) {
        return NextResponse.json(
          { ok: false, message: 'Cada slot deve ter dayOfWeek 0-6, startMinutes e endMinutes válidos (início < fim)' },
          { status: 400 }
        )
      }
    }

    // Se slots.length === 0, significa que o professor está disponível em todos os horários
    // Não precisa validar conflitos nesse caso
    if (slots.length > 0) {
      // Buscar todas as aulas futuras do professor (exceto canceladas)
      const hoje = new Date()
      hoje.setHours(0, 0, 0, 0)
      
      const lessons = await prisma.lesson.findMany({
        where: {
          teacherId,
          status: { not: 'CANCELLED' },
          startAt: { gte: hoje },
        },
        select: {
          id: true,
          startAt: true,
          durationMinutes: true,
          enrollment: {
            select: {
              nome: true,
            },
          },
        },
      })

      // Verificar se alguma aula está fora dos slots marcados
      const conflicts: Array<{ aluno: string; dia: string; horario: string }> = []
      
      for (const lesson of lessons) {
        const lessonStart = new Date(lesson.startAt)
        const dayOfWeek = lessonStart.getDay()
        const startMinutes = lessonStart.getHours() * 60 + lessonStart.getMinutes()
        const durationMinutes = lesson.durationMinutes ?? 60
        const endMinutes = startMinutes + durationMinutes

        // Verificar se a aula está dentro de algum slot
        const isWithinSlot = slots.some(
          (slot) =>
            slot.dayOfWeek === dayOfWeek &&
            startMinutes >= slot.startMinutes &&
            endMinutes <= slot.endMinutes
        )

        if (!isWithinSlot) {
          const diasSemana = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']
          const hora = Math.floor(startMinutes / 60)
            .toString()
            .padStart(2, '0')
          const minuto = (startMinutes % 60).toString().padStart(2, '0')
          conflicts.push({
            aluno: lesson.enrollment?.nome ?? 'Aluno desconhecido',
            dia: diasSemana[dayOfWeek],
            horario: `${hora}:${minuto}`,
          })
        }
      }

      if (conflicts.length > 0) {
        return NextResponse.json(
          {
            ok: false,
            message: 'O professor já tem aulas na agenda fora desses horários. Troque esses alunos primeiro.',
            conflicts,
          },
          { status: 400 }
        )
      }
    }

    await prisma.teacherAvailabilitySlot.deleteMany({ where: { teacherId } })
    if (slots.length > 0) {
      await prisma.teacherAvailabilitySlot.createMany({
        data: (slots as { dayOfWeek: number; startMinutes: number; endMinutes: number }[]).map((s) => ({
          teacherId,
          dayOfWeek: s.dayOfWeek,
          startMinutes: s.startMinutes,
          endMinutes: s.endMinutes,
        })),
      })
    }
    const updated = await prisma.teacherAvailabilitySlot.findMany({
      where: { teacherId },
      orderBy: [{ dayOfWeek: 'asc' }, { startMinutes: 'asc' }],
    })
    return NextResponse.json({
      ok: true,
      data: {
        slots: updated.map((s) => ({
          id: s.id,
          dayOfWeek: s.dayOfWeek,
          startMinutes: s.startMinutes,
          endMinutes: s.endMinutes,
        })),
      },
    })
  } catch (error) {
    console.error('[api/admin/teachers/[id]/availability PUT]', error)
    return NextResponse.json(
      { ok: false, message: 'Erro ao salvar horários' },
      { status: 500 }
    )
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAdmin(request)
    if (!auth.authorized) {
      return NextResponse.json(
        { ok: false, message: auth.message || 'Não autorizado' },
        { status: auth.message?.includes('Não autenticado') ? 401 : 403 }
      )
    }
    const { id: teacherId } = await params
    const { searchParams } = new URL(request.url)
    const slotId = searchParams.get('slotId')
    if (!slotId) {
      return NextResponse.json(
        { ok: false, message: 'slotId é obrigatório' },
        { status: 400 }
      )
    }
    const slot = await prisma.teacherAvailabilitySlot.findFirst({
      where: { id: slotId, teacherId },
    })
    if (!slot) {
      return NextResponse.json(
        { ok: false, message: 'Horário não encontrado' },
        { status: 404 }
      )
    }
    await prisma.teacherAvailabilitySlot.delete({ where: { id: slotId } })
    return NextResponse.json({ ok: true, message: 'Horário removido' })
  } catch (error) {
    console.error('[api/admin/teachers/[id]/availability DELETE]', error)
    return NextResponse.json(
      { ok: false, message: 'Erro ao remover horário' },
      { status: 500 }
    )
  }
}
