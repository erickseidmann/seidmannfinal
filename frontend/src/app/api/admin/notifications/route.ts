/**
 * GET /api/admin/notifications
 * Lista notificações do admin logado (ex.: professor confirmou valor, professor alterou dados).
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/auth'

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAdmin(request)
    if (!auth.authorized || !auth.session) {
      return NextResponse.json(
        { ok: false, message: auth.message || 'Não autorizado' },
        { status: auth.message?.includes('Não autenticado') ? 401 : 403 }
      )
    }

    const userId = auth.session.sub
    if (!prisma.adminNotification) {
      return NextResponse.json({
        ok: true,
        data: { notifications: [], unreadCount: 0 },
      })
    }

    const cutoff = new Date()
    cutoff.setDate(cutoff.getDate() - 15)

    const notifications = await prisma.adminNotification.findMany({
      where: { userId, criadoEm: { gte: cutoff } },
      orderBy: { criadoEm: 'desc' },
      take: 50,
    })

    const unreadCount = notifications.filter((n) => n.readAt == null).length

    return NextResponse.json({
      ok: true,
      data: {
        notifications: notifications.map((n) => ({
          id: n.id,
          message: n.message,
          readAt: n.readAt?.toISOString() ?? null,
          criadoEm: n.criadoEm.toISOString(),
        })),
        unreadCount,
      },
    })
  } catch (error) {
    console.error('[api/admin/notifications GET]', error)
    return NextResponse.json(
      { ok: false, message: 'Erro ao listar notificações' },
      { status: 500 }
    )
  }
}
