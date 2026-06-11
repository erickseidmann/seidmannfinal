/**
 * API Route: POST /api/auth/login
 * 
 * Login simples (sem JWT por enquanto)
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { isValidEmail } from '@/lib/validators'
import bcrypt from 'bcryptjs'
import {
  LOGIN_ERROR_EMAIL_NOT_FOUND,
  LOGIN_ERROR_WRONG_PASSWORD,
} from '@/lib/login-messages'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { email, password } = body

    // Validações
    if (!email || typeof email !== 'string' || !email.trim()) {
      return NextResponse.json(
        { error: 'Email é obrigatório' },
        { status: 400 }
      )
    }

    if (!password || typeof password !== 'string') {
      return NextResponse.json(
        { error: 'Senha é obrigatória' },
        { status: 400 }
      )
    }

    if (!isValidEmail(email)) {
      return NextResponse.json(
        { error: 'Email inválido' },
        { status: 400 }
      )
    }

    // Buscar user por email
    const user = await prisma.user.findUnique({
      where: { email: email.trim().toLowerCase() },
    })

    if (!user) {
      return NextResponse.json({ error: LOGIN_ERROR_EMAIL_NOT_FOUND }, { status: 401 })
    }

    const passwordMatch = await bcrypt.compare(password, user.senha)

    if (!passwordMatch) {
      return NextResponse.json({ error: LOGIN_ERROR_WRONG_PASSWORD }, { status: 401 })
    }

    // Retornar sucesso (sem passwordHash)
    return NextResponse.json({
      ok: true,
      user: {
        id: user.id,
        name: user.nome,
        email: user.email,
        whatsapp: user.whatsapp,
      },
    })
  } catch (error) {
    console.error('Erro ao fazer login:', error)
    return NextResponse.json(
      { error: 'Erro interno do servidor' },
      { status: 500 }
    )
  }
}
