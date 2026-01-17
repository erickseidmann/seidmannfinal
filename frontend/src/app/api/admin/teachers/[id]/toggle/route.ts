/**
 * API Route: POST /api/admin/teachers/[id]/toggle
 * 
 * Ativa/desativa professor (toggle status ACTIVE/INACTIVE)
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

    // Verificar se o model existe no Prisma Client
    if (!prisma.teacher) {
      console.error('[api/admin/teachers/[id]/toggle] Model Teacher não encontrado no Prisma Client. Execute: npx prisma generate')
      return NextResponse.json(
        { ok: false, message: 'Modelo Teacher não disponível. Execute: npx prisma generate' },
        { status: 503 }
      )
    }

    const teacher = await prisma.teacher.findUnique({
      where: { id },
    })

    if (!teacher) {
      return NextResponse.json(
        { ok: false, message: 'Professor não encontrado' },
        { status: 404 }
      )
    }

    // Toggle: ACTIVE -> INACTIVE, INACTIVE -> ACTIVE
    const newStatus = teacher.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE'

    const updated = await prisma.teacher.update({
      where: { id },
      data: { status: newStatus },
    })

    return NextResponse.json({
      ok: true,
      data: {
        teacher: {
          id: updated.id,
          nome: updated.nome,
          status: updated.status,
        },
        message: `Professor ${newStatus === 'ACTIVE' ? 'ativado' : 'desativado'} com sucesso`,
      },
    })
  } catch (error) {
    console.error('[api/admin/teachers/[id]/toggle] Erro ao toggle professor:', error)
    return NextResponse.json(
      { ok: false, message: 'Erro ao alterar status do professor' },
      { status: 500 }
    )
  }
}
