/**
 * DELETE /api/professor/alerts/[id] – professor exclui (remove) uma notificação
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireTeacher } from '@/lib/auth'

export async function DELETE(
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
    await prisma.teacherAlert.delete({ where: { id } })
    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('[api/professor/alerts DELETE]', error)
    return NextResponse.json(
      { ok: false, message: 'Erro ao excluir notificação' },
      { status: 500 }
    )
  }
}
