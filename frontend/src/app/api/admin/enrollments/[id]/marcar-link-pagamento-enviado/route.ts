/**
 * API Route: PATCH /api/admin/enrollments/[id]/marcar-link-pagamento-enviado
 *
 * Marca que o admin enviou o link de pagamento ao aluno (novos matriculados).
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
      select: { id: true },
    })

    if (!enrollment) {
      return NextResponse.json(
        { ok: false, message: 'Matrícula não encontrada' },
        { status: 404 }
      )
    }

    await prisma.enrollment.update({
      where: { id },
      data: { linkPagamentoEnviadoAt: new Date() },
    })

    return NextResponse.json({
      ok: true,
      message: 'Marcado como «enviei link pag».',
    })
  } catch (error) {
    console.error('[api/admin/enrollments/[id]/marcar-link-pagamento-enviado]', error)
    return NextResponse.json(
      { ok: false, message: 'Erro ao atualizar matrícula' },
      { status: 500 }
    )
  }
}
