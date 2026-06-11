/**
 * GET /api/admin/teachers/stats
 * Contagens para os cubos: substituídos (nota 1), 4-5 estrelas, problemas (nota 2), solicitações de professor.
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/auth'

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAdmin(request)
    if (!auth.authorized) {
      return NextResponse.json(
        { ok: false, message: auth.message || 'Não autorizado' },
        { status: auth.message?.includes('Não autenticado') ? 401 : 403 }
      )
    }

    const activeOnly = { status: { not: 'INACTIVE' as const } }
    const [nota1Count, nota2Count, nota45Count, inactiveCount, teacherRequestsCount] =
      await Promise.all([
      prisma.teacher.count({ where: { nota: 1, ...activeOnly } }),
      prisma.teacher.count({ where: { nota: 2, ...activeOnly } }),
      prisma.teacher.count({ where: { nota: { in: [4, 5] }, ...activeOnly } }),
      prisma.teacher.count({ where: { status: 'INACTIVE' } }),
      (async () => {
        try {
          return await prisma.teacherRequest.count()
        } catch {
          return 0
        }
      })(),
    ])

    return NextResponse.json({
      ok: true,
      data: {
        nota1: nota1Count,
        nota2: nota2Count,
        nota45: nota45Count,
        inativos: inactiveCount,
        teacherRequests: teacherRequestsCount,
      },
    })
  } catch (error) {
    console.error('[api/admin/teachers/stats] Erro:', error)
    return NextResponse.json(
      { ok: false, message: 'Erro ao carregar estatísticas' },
      { status: 500 }
    )
  }
}
