/**
 * API Route: POST /api/users
 * 
 * Cria um novo User e vincula com Enrollment se existir
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { isValidEmail, normalizePhone, requireMinDigits } from '@/lib/validators'
import bcrypt from 'bcryptjs'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { name, email, whatsapp, password } = body

    // Validações
    const errors: string[] = []

    if (!name || typeof name !== 'string' || !name.trim()) {
      errors.push('Nome é obrigatório')
    }

    if (!email || typeof email !== 'string' || !email.trim()) {
      errors.push('Email é obrigatório')
    } else if (!isValidEmail(email)) {
      errors.push('Email inválido')
    }

    if (!whatsapp || typeof whatsapp !== 'string' || !whatsapp.trim()) {
      errors.push('WhatsApp é obrigatório')
    } else {
      if (!requireMinDigits(whatsapp, 10)) {
        errors.push('WhatsApp deve ter no mínimo 10 dígitos')
      }
    }

    if (!password || typeof password !== 'string') {
      errors.push('Senha é obrigatória')
    } else if (password.length < 6) {
      errors.push('Senha deve ter no mínimo 6 caracteres')
    }

    if (errors.length > 0) {
      return NextResponse.json(
        { error: 'Dados inválidos', details: errors },
        { status: 400 }
      )
    }

    // Verificar se email já existe
    const existingUser = await prisma.user.findUnique({
      where: { email: email.trim().toLowerCase() },
    })

    if (existingUser) {
      return NextResponse.json(
        { error: 'Email já cadastrado' },
        { status: 409 }
      )
    }

    // Hash da senha
    const passwordHash = await bcrypt.hash(password, 10)

    // Normalizar dados
    const normalizedEmail = email.trim().toLowerCase()
    const normalizedWhatsapp = normalizePhone(whatsapp)

    // Criar user (schema: nome, senha)
    const user = await prisma.user.create({
      data: {
        nome: name.trim(),
        email: normalizedEmail,
        whatsapp: normalizedWhatsapp,
        senha: passwordHash,
      },
    })

    // Procurar Enrollment mais recente com mesmo email ou whatsapp
    const enrollment = await prisma.enrollment.findFirst({
      where: {
        AND: [
          { userId: null },
          {
            OR: [
              { email: normalizedEmail },
              { whatsapp: normalizedWhatsapp },
            ],
          },
        ],
      },
      orderBy: { criadoEm: 'desc' },
    })

    // Se encontrou, vincular e atualizar status
    if (enrollment) {
      await prisma.enrollment.update({
        where: { id: enrollment.id },
        data: {
          userId: user.id,
          status: 'REGISTERED',
        },
      })
    }

    // Retornar resposta (sem senha; nomes da API para o frontend)
    return NextResponse.json(
      {
        id: user.id,
        name: user.nome,
        email: user.email,
        whatsapp: user.whatsapp,
        createdAt: user.criadoEm,
      },
      { status: 201 }
    )
  } catch (error) {
    console.error('Erro ao criar user:', error)
    return NextResponse.json(
      { error: 'Erro interno do servidor' },
      { status: 500 }
    )
  }
}
