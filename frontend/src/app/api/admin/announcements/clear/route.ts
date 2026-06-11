/**
 * API Route: DELETE /api/admin/announcements/clear
 *
 * Exclui todos os anúncios de uma vez.
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/auth'

export async function DELETE(request: NextRequest) {
  try {
    const auth = await requireAdmin(request)
    if (!auth.authorized) {
      return NextResponse.json(
        { ok: false, message: auth.message || 'Não autorizado' },
        { status: auth.message?.includes('Não autenticado') ? 401 : 403 }
      )
    }

    if (!prisma.announcement) {
      return NextResponse.json(
        { ok: false, message: 'Modelo Announcement não disponível' },
        { status: 503 }
      )
    }

    const result = await prisma.announcement.deleteMany({})

    return NextResponse.json({
      ok: true,
      message: `${result.count} anúncio(s) excluído(s)`,
      data: { count: result.count },
    })
  } catch (error) {
    console.error('[api/admin/announcements/clear] Erro ao excluir:', error)
    return NextResponse.json(
      { ok: false, message: 'Erro ao excluir anúncios' },
      { status: 500 }
    )
  }
}
