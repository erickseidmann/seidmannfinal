/**
 * PATCH /api/admin/notifications/read-all
 * Marca todas as notificações não lidas do admin como lidas.
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/auth'
import { notificationRetentionCutoff } from '@/lib/notification-retention'

export async function PATCH(request: NextRequest) {
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
      return NextResponse.json({ ok: true, data: { marked: 0 } })
    }

    const cutoff = notificationRetentionCutoff()
    const now = new Date()

    const result = await prisma.adminNotification.updateMany({
      where: { userId, readAt: null, criadoEm: { gte: cutoff } },
      data: { readAt: now },
    })

    return NextResponse.json({
      ok: true,
      message: 'Todas as notificações foram marcadas como lidas',
      data: { marked: result.count, readAt: now.toISOString() },
    })
  } catch (error) {
    console.error('[api/admin/notifications/read-all PATCH]', error)
    return NextResponse.json(
      { ok: false, message: 'Erro ao marcar notificações como lidas' },
      { status: 500 }
    )
  }
}
