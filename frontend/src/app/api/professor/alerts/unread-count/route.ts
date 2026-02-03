/**
 * GET /api/professor/alerts/unread-count
 * Retorna apenas a quantidade de notificações não lidas (para a bolinha na sidebar).
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

    if (!prisma.teacherAlert) {
      return NextResponse.json({ ok: true, data: { unreadCount: 0 } })
    }

    const cutoff = new Date()
    cutoff.setDate(cutoff.getDate() - 15)

    // Só contar notificações exibidas no Início (apenas últimos 15 dias)
    const unreadCount = await prisma.teacherAlert.count({
      where: {
        teacherId: teacher.id,
        isActive: true,
        readAt: null,
        type: { in: ['PAYMENT_DONE', 'NEW_ANNOUNCEMENT', 'NEW_STUDENT'] },
        criadoEm: { gte: cutoff },
      },
    })

    return NextResponse.json({ ok: true, data: { unreadCount } })
  } catch (error) {
    console.error('[api/professor/alerts/unread-count GET]', error)
    return NextResponse.json(
      { ok: false, message: 'Erro ao obter contagem' },
      { status: 500 }
    )
  }
}
