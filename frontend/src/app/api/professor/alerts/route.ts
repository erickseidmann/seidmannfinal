/**
 * GET /api/professor/alerts
 * Lista alertas/notificações do professor logado (ex.: pagamento realizado).
 * Retorna alerts e unreadCount para a bolinha na sidebar.
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
      return NextResponse.json(
        { ok: true, data: { alerts: [], unreadCount: 0 } }
      )
    }

    const cutoff = new Date()
    cutoff.setDate(cutoff.getDate() - 15)

    // Só exibir no Início: pagamento enviado, novo anúncio, novo aluno (apenas últimos 15 dias)
    // Notificações lidas há mais de 2 dias não são exibidas
    const twoDaysAgo = new Date()
    twoDaysAgo.setDate(twoDaysAgo.getDate() - 2)
    const TIPOS_NOTIFICACAO = ['PAYMENT_DONE', 'NEW_ANNOUNCEMENT', 'NEW_STUDENT'] as const
    const alerts = await prisma.teacherAlert.findMany({
      where: {
        teacherId: teacher.id,
        isActive: true,
        type: { in: [...TIPOS_NOTIFICACAO] },
        criadoEm: { gte: cutoff },
        OR: [
          { readAt: null },
          { readAt: { gte: twoDaysAgo } },
        ],
      },
      orderBy: { criadoEm: 'desc' },
      take: 50,
      select: {
        id: true,
        message: true,
        type: true,
        level: true,
        readAt: true,
        criadoEm: true,
      },
    })

    const unreadCount = alerts.filter((a) => a.readAt == null).length

    return NextResponse.json({
      ok: true,
      data: {
        alerts: alerts.map((a) => ({
          id: a.id,
          message: a.message,
          type: a.type,
          level: a.level,
          readAt: a.readAt?.toISOString() ?? null,
          criadoEm: a.criadoEm.toISOString(),
        })),
        unreadCount,
      },
    })
  } catch (error) {
    console.error('[api/professor/alerts GET]', error)
    return NextResponse.json(
      { ok: false, message: 'Erro ao listar notificações' },
      { status: 500 }
    )
  }
}
