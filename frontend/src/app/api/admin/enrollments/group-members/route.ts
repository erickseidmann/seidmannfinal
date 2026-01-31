/**
 * GET /api/admin/enrollments/group-members?nomeGrupo=xxx
 * Retorna enrollments do grupo (id, nome) para uso em registros de aula.
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

    const { searchParams } = new URL(request.url)
    const nomeGrupo = searchParams.get('nomeGrupo')?.trim()
    if (!nomeGrupo) {
      return NextResponse.json(
        { ok: false, message: 'nomeGrupo é obrigatório' },
        { status: 400 }
      )
    }

    const enrollments = await prisma.enrollment.findMany({
      where: {
        tipoAula: 'GRUPO',
        nomeGrupo,
      },
      select: { id: true, nome: true },
      orderBy: { nome: 'asc' },
    })

    return NextResponse.json({ ok: true, data: { enrollments } })
  } catch (error) {
    console.error('[api/admin/enrollments/group-members GET]', error)
    return NextResponse.json(
      { ok: false, message: 'Erro ao listar membros do grupo' },
      { status: 500 }
    )
  }
}
