/**
 * API Route: POST /api/cadastro
 * 
 * Cria um novo usuário (User) no sistema.
 * Tenta vincular com Enrollment existente por email/whatsapp.
 * Endpoint usado pela página /cadastro
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { isValidEmail, normalizePhone, requireMinDigits } from '@/lib/validators'
import { createUniqueTrackingCode } from '@/lib/trackingCode'
import bcrypt from 'bcryptjs'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { nome, email, whatsapp, senha } = body

    // Validações
    const errors: string[] = []

    if (!nome || typeof nome !== 'string' || !nome.trim()) {
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

    if (!senha || typeof senha !== 'string') {
      errors.push('Senha é obrigatória')
    } else if (senha.length < 6) {
      errors.push('Senha deve ter no mínimo 6 caracteres')
    }

    if (errors.length > 0) {
      return NextResponse.json(
        { 
          ok: false,
          message: 'Dados inválidos: ' + errors.join(', ')
        },
        { status: 400 }
      )
    }

    // Normalizar dados
    const normalizedEmail = email.trim().toLowerCase()
    const normalizedWhatsapp = normalizePhone(whatsapp)

    // Verificar se email já existe
    const existingUser = await prisma.user.findUnique({
      where: { email: normalizedEmail },
    })

    if (existingUser) {
      return NextResponse.json(
        { 
          ok: false,
          message: 'Email já cadastrado'
        },
        { status: 409 }
      )
    }

    // Hash da senha (10 salt rounds)
    const senhaHash = await bcrypt.hash(senha, 10)

    // Criar User
    const user = await prisma.user.create({
      data: {
        nome: nome.trim(),
        email: normalizedEmail,
        whatsapp: normalizedWhatsapp,
        senha: senhaHash,
      },
    })

    // Buscar Enrollment mais recente com mesmo email ou whatsapp
    // Se existir e não tiver userId, vincular
    let enrollment = await prisma.enrollment.findFirst({
      where: {
        userId: null,
        OR: [
          { email: normalizedEmail },
          { whatsapp: normalizedWhatsapp },
        ],
      },
      orderBy: { criadoEm: 'desc' },
    })

    // Se não encontrou Enrollment, criar um novo vinculado ao User
    // Com status REGISTERED e campos opcionais null (para completar depois)
    if (!enrollment) {
      // Gerar trackingCode único
      const trackingCode = await createUniqueTrackingCode()

      enrollment = await prisma.enrollment.create({
        data: {
          nome: user.nome,
          email: normalizedEmail,
          whatsapp: normalizedWhatsapp,
          userId: user.id,
          idioma: null,        // Será preenchido quando completar a matrícula
          nivel: null,         // Será preenchido quando completar a matrícula
          objetivo: null,
          disponibilidade: null,
          status: 'REGISTERED',
          trackingCode, // Código único para acompanhamento
        },
      })
    } else {
      // Vincular Enrollment existente com User
      // Se não tem trackingCode, gerar um
      if (!enrollment.trackingCode) {
        const trackingCode = await createUniqueTrackingCode()
        await prisma.enrollment.update({
          where: { id: enrollment.id },
          data: {
            userId: user.id,
            status: 'REGISTERED',
            trackingCode,
          },
        })
        // Buscar novamente para ter o trackingCode
        enrollment = await prisma.enrollment.findUnique({
          where: { id: enrollment.id },
        })
      } else {
        await prisma.enrollment.update({
          where: { id: enrollment.id },
          data: {
            userId: user.id,
            status: 'REGISTERED',
          },
        })
      }
    }

    // Retornar resposta padronizada (NUNCA retornar senha)
    // Incluir próximo passo recomendado: /contrato
    return NextResponse.json(
      {
        ok: true,
        data: {
          user: {
            id: user.id,
            nome: user.nome,
            email: user.email,
            whatsapp: user.whatsapp,
            createdAt: user.criadoEm,
          },
          next: '/contrato', // Próximo passo: aceitar contrato
        },
      },
      { status: 201 }
    )
  } catch (error) {
    console.error('Erro ao criar cadastro:', error)
    return NextResponse.json(
      { 
        ok: false,
        message: 'Erro interno do servidor'
      },
      { status: 500 }
    )
  }
}
