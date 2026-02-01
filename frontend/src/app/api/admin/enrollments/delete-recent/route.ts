/**
 * API Route: POST /api/admin/enrollments/delete-recent
 * Exclui matrículas criadas nos últimos X minutos (padrão 30). Somente admin.
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
    const minutes = typeof body.minutes === 'number' ? Math.min(1440, Math.max(1, body.minutes)) : 30

    const since = new Date(Date.now() - minutes * 60 * 1000)

    const result = await prisma.enrollment.deleteMany({
      where: { criadoEm: { gte: since } },
    })

    return NextResponse.json({
      ok: true,
      data: { deleted: result.count, minutes },
    })
  } catch (error) {
    console.error('[api/admin/enrollments/delete-recent] Erro:', error)
    return NextResponse.json(
      { ok: false, message: 'Erro ao excluir alunos recentes' },
      { status: 500 }
    )
  }
}
