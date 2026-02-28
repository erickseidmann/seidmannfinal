/**
 * POST /api/auth/reset-password
 * Redefine a senha usando o token recebido por e-mail.
 */

import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { prisma } from '@/lib/prisma'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}))
    const token = typeof body.token === 'string' ? body.token.trim() : ''
    const newPassword = typeof body.newPassword === 'string' ? body.newPassword : ''

    if (!token) {
      return NextResponse.json(
        { ok: false, message: 'Link inválido ou expirado.' },
        { status: 400 }
      )
    }

    if (!newPassword || newPassword.length < 6) {
      return NextResponse.json(
        { ok: false, message: 'A senha deve ter no mínimo 6 caracteres.' },
        { status: 400 }
      )
    }

    const now = new Date()
    const resetRecord = await prisma.passwordResetToken.findUnique({
      where: { token },
      include: { user: { select: { id: true } } },
    })

    if (!resetRecord || resetRecord.expiresAt < now) {
      return NextResponse.json(
        { ok: false, message: 'Link inválido ou expirado. Solicite uma nova redefinição de senha.' },
        { status: 400 }
      )
    }

    const hash = await bcrypt.hash(newPassword, 10)
    await prisma.$transaction([
      prisma.user.update({
        where: { id: resetRecord.userId },
        data: { senha: hash, mustChangePassword: false },
      }),
      prisma.passwordResetToken.delete({ where: { id: resetRecord.id } }),
    ])

    return NextResponse.json({ ok: true, message: 'Senha alterada com sucesso. Faça login com a nova senha.' })
  } catch (error) {
    console.error('[api/auth/reset-password]', error)
    return NextResponse.json(
      { ok: false, message: 'Erro ao redefinir senha. Tente novamente.' },
      { status: 500 }
    )
  }
}
