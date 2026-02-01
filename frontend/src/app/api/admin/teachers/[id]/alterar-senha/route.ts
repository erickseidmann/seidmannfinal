/**
 * API Route: POST /api/admin/teachers/[id]/alterar-senha
 * Admin altera a senha do professor. Nova senha não exige troca no próximo acesso.
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/auth'
import bcrypt from 'bcryptjs'

export async function POST(
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

    const { id: teacherId } = await params
    const body = await request.json()
    const { novaSenha } = body

    if (!novaSenha || typeof novaSenha !== 'string' || novaSenha.trim().length < 6) {
      return NextResponse.json(
        { ok: false, message: 'Nova senha é obrigatória e deve ter no mínimo 6 caracteres' },
        { status: 400 }
      )
    }

    const teacher = await prisma.teacher.findUnique({
      where: { id: teacherId },
      select: { id: true, nome: true, userId: true },
    })

    if (!teacher) {
      return NextResponse.json(
        { ok: false, message: 'Professor não encontrado' },
        { status: 404 }
      )
    }

    if (!teacher.userId) {
      return NextResponse.json(
        { ok: false, message: 'Este professor ainda não tem acesso ao dashboard. Crie o acesso primeiro.' },
        { status: 400 }
      )
    }

    const passwordHash = await bcrypt.hash(novaSenha.trim(), 10)
    await prisma.user.update({
      where: { id: teacher.userId },
      data: { senha: passwordHash, mustChangePassword: false },
    })

    return NextResponse.json({
      ok: true,
      data: { message: 'Senha do professor alterada. Ele pode usar a nova senha no próximo login.' },
    })
  } catch (error) {
    console.error('[api/admin/teachers/[id]/alterar-senha] Erro:', error)
    return NextResponse.json(
      { ok: false, message: 'Erro ao alterar senha do professor' },
      { status: 500 }
    )
  }
}
