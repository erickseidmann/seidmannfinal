/**
 * PATCH /api/admin/notifications/[id]/read
 * Marca uma notificação como lida.
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/auth'

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAdmin(request)
    if (!auth.authorized || !auth.session) {
      return NextResponse.json(
        { ok: false, message: auth.message || 'Não autorizado' },
        { status: auth.message?.includes('Não autenticado') ? 401 : 403 }
      )
    }

    const userId = auth.session.sub
    const { id } = await params

    const notification = await prisma.adminNotification.findFirst({
      where: { id, userId },
    })
    if (!notification) {
      return NextResponse.json(
        { ok: false, message: 'Notificação não encontrada' },
        { status: 404 }
      )
    }

    await prisma.adminNotification.update({
      where: { id },
      data: { readAt: new Date() },
    })

    return NextResponse.json({ ok: true, message: 'Marcado como lido' })
  } catch (error) {
    console.error('[api/admin/notifications/[id]/read PATCH]', error)
    return NextResponse.json(
      { ok: false, message: 'Erro ao marcar como lido' },
      { status: 500 }
    )
  }
}
