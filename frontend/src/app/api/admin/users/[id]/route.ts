/**
 * API Route: PATCH /api/admin/users/[id]
 * 
 * Atualizar usuário
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/auth'

export async function PATCH(
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
    const body = await request.json()
    const { nome, email, whatsapp, role, status } = body

    // Verificar se usuário existe
    const existing = await prisma.user.findUnique({
      where: { id },
    })

    if (!existing) {
      return NextResponse.json(
        { ok: false, message: 'Usuário não encontrado' },
        { status: 404 }
      )
    }

    // Se email mudou, verificar se não está em uso
    if (email && email !== existing.email) {
      const normalizedEmail = email.trim().toLowerCase()
      const emailInUse = await prisma.user.findUnique({
        where: { email: normalizedEmail },
      })

      if (emailInUse) {
        return NextResponse.json(
          { ok: false, message: 'Email já está em uso' },
          { status: 409 }
        )
      }
    }

    const updateData: any = {}
    if (nome) updateData.nome = nome.trim()
    if (email) updateData.email = email.trim().toLowerCase()
    if (whatsapp !== undefined) updateData.whatsapp = whatsapp.trim()
    if (role) updateData.role = role
    if (status) updateData.status = status

    const user = await prisma.user.update({
      where: { id },
      data: updateData,
      select: {
        id: true,
        nome: true,
        email: true,
        whatsapp: true,
        role: true,
        status: true,
        criadoEm: true,
        atualizadoEm: true,
      },
    })

    return NextResponse.json({
      ok: true,
      data: {
        user: {
          ...user,
          criadoEm: user.criadoEm.toISOString(),
          atualizadoEm: user.atualizadoEm.toISOString(),
        },
      },
    })
  } catch (error) {
    console.error('[api/admin/users/[id]] Erro ao atualizar usuário:', error)
    return NextResponse.json(
      { ok: false, message: 'Erro ao atualizar usuário' },
      { status: 500 }
    )
  }
}
