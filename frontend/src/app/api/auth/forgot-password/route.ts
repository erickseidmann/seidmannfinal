/**
 * POST /api/auth/forgot-password
 * Solicita recuperação de senha. Envia e-mail com link para redefinir (alunos e professores).
 */

import { NextRequest, NextResponse } from 'next/server'
import { randomBytes } from 'crypto'
import { prisma } from '@/lib/prisma'
import { sendEmail } from '@/lib/email'

const TOKEN_EXPIRES_HOURS = 1

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}))
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json(
        { ok: false, message: 'Informe um e-mail válido.' },
        { status: 400 }
      )
    }

    const user = await prisma.user.findUnique({
      where: { email },
      select: { id: true, nome: true, email: true, role: true },
    })

    if (!user) {
      return NextResponse.json(
        { ok: false, message: 'O e-mail não está cadastrado. Entre em contato com a gestão.' },
        { status: 404 }
      )
    }

    if (user.role !== 'STUDENT' && user.role !== 'TEACHER') {
      return NextResponse.json(
        { ok: false, message: 'O e-mail não está cadastrado. Entre em contato com a gestão.' },
        { status: 404 }
      )
    }

    const token = randomBytes(32).toString('hex')
    const expiresAt = new Date(Date.now() + TOKEN_EXPIRES_HOURS * 60 * 60 * 1000)

    await prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        token,
        expiresAt,
      },
    })

    const baseUrl = process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || ''
    const resetUrl = baseUrl
      ? `${baseUrl.replace(/\/$/, '')}/redefinir-senha?token=${encodeURIComponent(token)}`
      : `${request.nextUrl.origin}/redefinir-senha?token=${encodeURIComponent(token)}`

    const subject = 'Redefinição de senha - Seidmann Institute'
    const text = `Olá, ${user.nome}!\n\nVocê solicitou a redefinição de senha. Acesse o link abaixo (válido por ${TOKEN_EXPIRES_HOURS} hora(s)):\n\n${resetUrl}\n\nSe não foi você, ignore este e-mail.\n\nSeidmann Institute`
    try {
      await sendEmail({
        to: user.email,
        subject,
        text,
      })
    } catch (emailErr) {
      console.error('[api/auth/forgot-password] Erro ao enviar e-mail:', emailErr)
    }

    return NextResponse.json({ ok: true, message: 'Se existir uma conta com este e-mail, você receberá um link para redefinir a senha. Verifique também a pasta de spam.' })
  } catch (error) {
    console.error('[api/auth/forgot-password]', error)
    return NextResponse.json(
      { ok: false, message: 'Erro ao processar solicitação. Tente novamente.' },
      { status: 500 }
    )
  }
}
