/**
 * DELETE /api/admin/financeiro/observations/[id] – remove uma observação
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/auth'

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAdmin(request)
    if (!auth.authorized) {
      return NextResponse.json(
        { ok: false, message: auth.message || 'Não autorizado' },
        { status: auth.message?.includes('Não autenticado') ? 401 : 403 }
      )
    }
    const { id } = await params
    await prisma.financeObservation.delete({ where: { id } })
    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('[api/admin/financeiro/observations DELETE]', error)
    return NextResponse.json(
      { ok: false, message: 'Erro ao excluir observação' },
      { status: 500 }
    )
  }
}
