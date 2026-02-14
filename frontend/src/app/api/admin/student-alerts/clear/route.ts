/**
 * API Route: DELETE /api/admin/student-alerts/clear
 *
 * Exclui todas as notificações de alunos de uma vez.
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

    const result = await prisma.studentAlert.deleteMany({})

    return NextResponse.json({
      ok: true,
      message: `${result.count} notificação(ões) de alunos excluída(s)`,
      data: { count: result.count },
    })
  } catch (error) {
    console.error('[api/admin/student-alerts/clear] Erro ao excluir:', error)
    return NextResponse.json(
      { ok: false, message: 'Erro ao excluir notificações' },
      { status: 500 }
    )
  }
}
