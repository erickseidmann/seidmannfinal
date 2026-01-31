/**
 * API Route: DELETE /api/admin/teacher-alerts/[id]
 *
 * Exclui um alerta de professor
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

    await prisma.teacherAlert.delete({
      where: { id },
    })

    return NextResponse.json({
      ok: true,
      message: 'Alerta excluído com sucesso',
    })
  } catch (error: unknown) {
    const prismaError = error as { code?: string }
    if (prismaError?.code === 'P2025') {
      return NextResponse.json(
        { ok: false, message: 'Alerta não encontrado' },
        { status: 404 }
      )
    }
    console.error('[api/admin/teacher-alerts/[id]] Erro ao excluir alerta:', error)
    return NextResponse.json(
      { ok: false, message: 'Erro ao excluir alerta' },
      { status: 500 }
    )
  }
}
