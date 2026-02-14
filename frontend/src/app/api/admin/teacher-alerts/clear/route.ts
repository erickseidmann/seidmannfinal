/**
 * API Route: DELETE /api/admin/teacher-alerts/clear
 *
 * Exclui todas as notificações de professores de uma vez.
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

    if (!prisma.teacherAlert) {
      return NextResponse.json(
        { ok: false, message: 'Modelo TeacherAlert não disponível' },
        { status: 503 }
      )
    }

    const result = await prisma.teacherAlert.deleteMany({})

    return NextResponse.json({
      ok: true,
      message: `${result.count} notificação(ões) de professores excluída(s)`,
      data: { count: result.count },
    })
  } catch (error) {
    console.error('[api/admin/teacher-alerts/clear] Erro ao excluir:', error)
    return NextResponse.json(
      { ok: false, message: 'Erro ao excluir notificações' },
      { status: 500 }
    )
  }
}
