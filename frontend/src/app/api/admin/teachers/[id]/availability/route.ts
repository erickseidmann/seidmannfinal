/**
 * GET  /api/admin/teachers/[id]/availability — lista horários disponíveis do professor
 * POST /api/admin/teachers/[id]/availability — adiciona um horário (body: dayOfWeek, startMinutes, endMinutes)
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
