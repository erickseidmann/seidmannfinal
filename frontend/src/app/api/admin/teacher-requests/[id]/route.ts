/**
 * DELETE /api/admin/teacher-requests/[id] - Remove uma solicitação de professor
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/auth'

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const auth = await requireAdmin(request)
    if (!auth.authorized) {
      return NextResponse.json(
        { ok: false, message: auth.message || 'Não autorizado' },
        { status: auth.message?.includes('Não autenticado') ? 401 : 403 }
      )
    }
    const { id } = params
    await prisma.teacherRequest.delete({ where: { id } })
    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('[api/admin/teacher-requests DELETE]', error)
    return NextResponse.json(
      { ok: false, message: 'Erro ao excluir solicitação' },
      { status: 500 }
    )
  }
}
