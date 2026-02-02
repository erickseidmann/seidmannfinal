/**
 * PATCH /api/professor/alerts/[id]/read
 * Marca um alerta como lido (readAt = now).
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireTeacher } from '@/lib/auth'

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
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

    const { id } = await params
    const alert = await prisma.teacherAlert.findFirst({
      where: { id, teacherId: teacher.id },
    })
    if (!alert) {
      return NextResponse.json(
        { ok: false, message: 'Notificação não encontrada' },
        { status: 404 }
      )
    }

    await prisma.teacherAlert.update({
      where: { id },
      data: { readAt: new Date() },
    })

    return NextResponse.json({ ok: true, message: 'Marcado como lido' })
  } catch (error) {
    console.error('[api/professor/alerts/[id]/read PATCH]', error)
    return NextResponse.json(
      { ok: false, message: 'Erro ao marcar como lido' },
      { status: 500 }
    )
  }
}
