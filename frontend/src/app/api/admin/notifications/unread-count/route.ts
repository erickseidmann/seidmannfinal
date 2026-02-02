/**
 * GET /api/admin/notifications/unread-count
 * Retorna a quantidade de notificações não lidas do admin (para o sininho).
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
      return NextResponse.json({ ok: true, data: { unreadCount: 0 } })
    }

    const unreadCount = await prisma.adminNotification.count({
      where: { userId, readAt: null },
    })

    return NextResponse.json({ ok: true, data: { unreadCount } })
  } catch (error) {
    console.error('[api/admin/notifications/unread-count GET]', error)
    return NextResponse.json(
      { ok: false, message: 'Erro ao obter contagem' },
      { status: 500 }
    )
  }
}
