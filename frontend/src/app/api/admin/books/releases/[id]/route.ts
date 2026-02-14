/**
 * API Route: DELETE /api/admin/books/releases/[id]
 * Revoga o acesso de um aluno a um livro (remove a liberação)
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/auth'

export async function DELETE(
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

    if (!prisma.bookRelease) {
      return NextResponse.json(
        { ok: false, message: 'Modelo não disponível' },
        { status: 503 }
      )
    }

    await prisma.bookRelease.delete({
      where: { id },
    })

    return NextResponse.json({
      ok: true,
      message: 'Acesso revogado com sucesso',
    })
  } catch (error: unknown) {
    const prismaError = error as { code?: string }
    if (prismaError?.code === 'P2025') {
      return NextResponse.json(
        { ok: false, message: 'Liberação não encontrada' },
        { status: 404 }
      )
    }
    console.error('[api/admin/books/releases/[id]] Erro ao revogar:', error)
    return NextResponse.json(
      { ok: false, message: 'Erro ao revogar acesso' },
      { status: 500 }
    )
  }
}
