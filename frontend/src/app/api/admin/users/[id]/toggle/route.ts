/**
 * API Route: POST /api/admin/users/[id]/toggle
 * 
 * Ativa/desativa usuário (toggle status ACTIVE/INACTIVE)
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/auth'

export async function POST(
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

    const user = await prisma.user.findUnique({
      where: { id },
    })

    if (!user) {
      return NextResponse.json(
        { ok: false, message: 'Usuário não encontrado' },
        { status: 404 }
      )
    }

    // Toggle: ACTIVE -> INACTIVE, INACTIVE -> ACTIVE
    // Se estiver PENDING ou BLOCKED, ativar para ACTIVE
    let newStatus: string
    if (user.status === 'ACTIVE') {
      newStatus = 'INACTIVE'
    } else if (user.status === 'INACTIVE') {
      newStatus = 'ACTIVE'
    } else {
      // PENDING ou BLOCKED -> ACTIVE
      newStatus = 'ACTIVE'
    }

    const updated = await prisma.user.update({
      where: { id },
      data: { status: newStatus as any },
      select: {
        id: true,
        nome: true,
        email: true,
        status: true,
      },
    })

    return NextResponse.json({
      ok: true,
      data: {
        user: updated,
        message: `Usuário ${newStatus === 'ACTIVE' ? 'ativado' : 'desativado'} com sucesso`,
      },
    })
  } catch (error) {
    console.error('[api/admin/users/[id]/toggle] Erro ao toggle usuário:', error)
    return NextResponse.json(
      { ok: false, message: 'Erro ao alterar status do usuário' },
      { status: 500 }
    )
  }
}
