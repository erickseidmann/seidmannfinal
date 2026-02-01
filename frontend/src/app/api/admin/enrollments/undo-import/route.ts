/**
 * API Route: POST /api/admin/enrollments/undo-import
 * Exclui matrículas que foram adicionadas na última importação (somente admin).
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/auth'

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAdmin(request)
    if (!auth.authorized) {
      return NextResponse.json(
        { ok: false, message: auth.message || 'Não autorizado' },
        { status: auth.message?.includes('Não autenticado') ? 401 : 403 }
      )
    }

    const body = await request.json().catch(() => ({}))
    const enrollmentIds = Array.isArray(body.enrollmentIds) ? body.enrollmentIds : []
    if (enrollmentIds.length === 0) {
      return NextResponse.json(
        { ok: false, message: 'Nenhuma matrícula informada para excluir' },
        { status: 400 }
      )
    }

    const validIds = enrollmentIds.filter((id: unknown) => typeof id === 'string' && id.length > 0)
    if (validIds.length === 0) {
      return NextResponse.json(
        { ok: false, message: 'IDs de matrículas inválidos' },
        { status: 400 }
      )
    }

    const result = await prisma.enrollment.deleteMany({
      where: { id: { in: validIds } },
    })

    return NextResponse.json({
      ok: true,
      data: { deleted: result.count },
    })
  } catch (error) {
    console.error('[api/admin/enrollments/undo-import] Erro:', error)
    return NextResponse.json(
      { ok: false, message: 'Erro ao excluir última lista adicionada' },
      { status: 500 }
    )
  }
}
