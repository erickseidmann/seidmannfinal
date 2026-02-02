/**
 * GET /api/admin/chat/unread-count
 * Retorna quantidade de mensagens não lidas no chat (para a bolinha na sidebar).
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
        { status: auth.session ? 403 : 401 }
      )
    }

    const currentUserId = auth.session.sub

    const myParticipants = await prisma.conversationParticipant.findMany({
      where: { userId: currentUserId },
      select: { conversationId: true, lastReadAt: true },
    })

    let total = 0
    for (const p of myParticipants) {
      const since = p.lastReadAt ?? new Date(0)
      const count = await prisma.chatMessage.count({
        where: {
          conversationId: p.conversationId,
          senderId: { not: currentUserId },
          criadoEm: { gt: since },
        },
      })
      total += count
    }

    return NextResponse.json({ ok: true, data: { unreadCount: total } })
  } catch (error) {
    console.error('[api/admin/chat/unread-count GET]', error)
    return NextResponse.json(
      { ok: false, message: 'Erro ao obter contagem' },
      { status: 500 }
    )
  }
}
