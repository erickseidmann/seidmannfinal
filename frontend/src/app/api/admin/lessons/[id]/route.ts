/**
 * API: PATCH /api/admin/lessons/[id] (atualizar aula)
 *      GET /api/admin/lessons/[id] (obter uma aula)
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/auth'

export async function GET(
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

    if (!prisma.lesson) {
      return NextResponse.json(
        { ok: false, message: 'Modelo Lesson não disponível. Rode: npx prisma generate && npx prisma migrate dev' },
        { status: 503 }
      )
    }

    const { id } = await params
    const lesson = await prisma.lesson.findUnique({
      where: { id },
      include: {
        enrollment: { select: { id: true, nome: true, frequenciaSemanal: true } },
        teacher: { select: { id: true, nome: true } },
      },
    })

    if (!lesson) {
      return NextResponse.json(
        { ok: false, message: 'Aula não encontrada' },
        { status: 404 }
      )
    }

    return NextResponse.json({ ok: true, data: { lesson } })
  } catch (error) {
    console.error('[api/admin/lessons/[id] GET]', error)
    return NextResponse.json(
      { ok: false, message: 'Erro ao buscar aula' },
      { status: 500 }
    )
  }
}

export async function PATCH(
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

    if (!prisma.lesson) {
      return NextResponse.json(
        { ok: false, message: 'Modelo Lesson não disponível. Rode: npx prisma generate && npx prisma migrate dev' },
        { status: 503 }
      )
    }

    const { id } = await params
    const body = await request.json()
    const {
      enrollmentId,
      teacherId,
      status,
      startAt: startAtStr,
      durationMinutes,
      notes,
    } = body

    const updateData: {
      enrollmentId?: string
      teacherId?: string
      status?: 'CONFIRMED' | 'CANCELLED' | 'REPOSICAO'
      startAt?: Date
      durationMinutes?: number
      notes?: string | null
    } = {}

    if (enrollmentId != null) updateData.enrollmentId = enrollmentId
    if (teacherId != null) updateData.teacherId = teacherId
    if (status != null && ['CONFIRMED', 'CANCELLED', 'REPOSICAO'].includes(status)) {
      updateData.status = status
    }
    if (startAtStr != null) {
      const d = new Date(startAtStr)
      if (!Number.isNaN(d.getTime())) updateData.startAt = d
    }
    if (durationMinutes != null) updateData.durationMinutes = Number(durationMinutes) || 60
    if (notes !== undefined) updateData.notes = notes?.trim() || null

    const lesson = await prisma.lesson.update({
      where: { id },
      data: updateData,
      include: {
        enrollment: { select: { id: true, nome: true, frequenciaSemanal: true } },
        teacher: { select: { id: true, nome: true } },
      },
    })

    return NextResponse.json({ ok: true, data: { lesson } })
  } catch (error) {
    console.error('[api/admin/lessons/[id] PATCH]', error)
    return NextResponse.json(
      { ok: false, message: 'Erro ao atualizar aula' },
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

    if (!prisma.lesson) {
      return NextResponse.json(
        { ok: false, message: 'Modelo Lesson não disponível. Rode: npx prisma generate && npx prisma migrate dev' },
        { status: 503 }
      )
    }

    const { id } = await params
    await prisma.lesson.delete({ where: { id } })

    return NextResponse.json({ ok: true, data: { deleted: id } })
  } catch (error) {
    console.error('[api/admin/lessons/[id] DELETE]', error)
    return NextResponse.json(
      { ok: false, message: 'Erro ao excluir aula' },
      { status: 500 }
    )
  }
}
