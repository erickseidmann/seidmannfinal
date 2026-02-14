/**
 * API Route: PATCH /api/admin/enrollments/[id]/marcar-aulas-adicionadas
 *
 * Marca o aluno como "já adicionei aulas", removendo da lista de novos matriculados.
 * Requer autenticação admin.
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/auth'

export async function PATCH(
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
    if (!id) {
      return NextResponse.json(
        { ok: false, message: 'ID do enrollment é obrigatório' },
        { status: 400 }
      )
    }

    const enrollment = await prisma.enrollment.findUnique({
      where: { id },
      select: { id: true, pendenteAdicionarAulas: true },
    })

    if (!enrollment) {
      return NextResponse.json(
        { ok: false, message: 'Matrícula não encontrada' },
        { status: 404 }
      )
    }

    await prisma.enrollment.update({
      where: { id },
      data: { pendenteAdicionarAulas: false },
    })

    return NextResponse.json({
      ok: true,
      message: 'Aluno removido da lista de novos matriculados.',
    })
  } catch (error) {
    console.error('[api/admin/enrollments/[id]/marcar-aulas-adicionadas]', error)
    return NextResponse.json(
      { ok: false, message: 'Erro ao atualizar matrícula' },
      { status: 500 }
    )
  }
}
