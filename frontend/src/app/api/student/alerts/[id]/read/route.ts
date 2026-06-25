/**
 * PATCH /api/student/alerts/[id]/read – marca notificação como lida
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireStudent } from '@/lib/auth'

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireStudent(request)
    if (!auth.authorized || !auth.session) {
      return NextResponse.json(
        { ok: false, message: auth.message || 'Não autorizado' },
        { status: auth.session ? 403 : 401 }
      )
    }

    const enrollments = await prisma.enrollment.findMany({
      where: { userId: auth.session.userId },
      select: { id: true },
    })
    const enrollmentIds = enrollments.map((e) => e.id)
    if (enrollmentIds.length === 0) {
      return NextResponse.json(
        { ok: false, message: 'Nenhuma matrícula encontrada' },
        { status: 404 }
      )
    }

    const { id } = await params
    const alert = await prisma.studentAlert.findFirst({
      where: { id, enrollmentId: { in: enrollmentIds } },
    })
    if (!alert) {
      return NextResponse.json(
        { ok: false, message: 'Notificação não encontrada' },
        { status: 404 }
      )
    }

    await prisma.studentAlert.update({
      where: { id },
      data: { readAt: new Date() },
    })

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('[api/student/alerts/[id]/read PATCH]', error)
    return NextResponse.json(
      { ok: false, message: 'Erro ao marcar como lido' },
      { status: 500 }
    )
  }
}
