/**
 * API Route: POST /api/admin/enrollments/[id]/alterar-senha
 * Admin redefine a senha do aluno (User vinculado à matrícula).
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/auth'
import bcrypt from 'bcryptjs'

const SENHA_PADRAO_ALUNO = '123456'

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

    const { id: enrollmentId } = await params
    const body = await request.json().catch(() => ({}))
    const novaSenha = typeof body.novaSenha === 'string' ? body.novaSenha.trim() : ''
    const obrigarAlteracaoProximoLogin = body.obrigarAlteracaoProximoLogin !== false

    const enrollment = await prisma.enrollment.findUnique({
      where: { id: enrollmentId },
      include: { user: true },
    })

    if (!enrollment) {
      return NextResponse.json(
        { ok: false, message: 'Aluno não encontrado' },
        { status: 404 }
      )
    }

    if (!enrollment.userId || !enrollment.user) {
      return NextResponse.json(
        { ok: false, message: 'Este aluno ainda não possui acesso. Use "Criar acesso" primeiro.' },
        { status: 400 }
      )
    }

    const senhaFinal = novaSenha.length >= 6 ? novaSenha : SENHA_PADRAO_ALUNO
    const passwordHash = await bcrypt.hash(senhaFinal, 10)

    await prisma.user.update({
      where: { id: enrollment.userId },
      data: {
        senha: passwordHash,
        mustChangePassword: obrigarAlteracaoProximoLogin,
      },
    })

    return NextResponse.json({
      ok: true,
      data: {
        message: obrigarAlteracaoProximoLogin
          ? 'Senha redefinida. O aluno deverá alterá-la no próximo login.'
          : 'Senha redefinida com sucesso.',
      },
    })
  } catch (error) {
    console.error('[api/admin/enrollments/[id]/alterar-senha] Erro:', error)
    return NextResponse.json(
      { ok: false, message: 'Erro ao redefinir senha' },
      { status: 500 }
    )
  }
}
