/**
 * API Route: POST /api/login
 * 
 * Login simples (sem JWT por enquanto).
 * Valida email e senha, retorna dados do usuário.
 * 
 * Proteções:
 * - Rate limiting por IP (5 tentativas / 15 minutos)
 * - Mensagem genérica de erro (não revela se email existe)
 * 
 * Endpoint usado pela página /login
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { isValidEmail } from '@/lib/validators'
import { checkRateLimit, getClientIP } from '@/lib/rateLimit'
import { createSession } from '@/lib/session'
import bcrypt from 'bcryptjs'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { email, senha } = body

    // Validações básicas (antes do rate limit)
    if (!email || typeof email !== 'string' || !email.trim()) {
      return NextResponse.json(
        { 
          ok: false,
          message: 'Email é obrigatório'
        },
        { status: 400 }
      )
    }

    if (!senha || typeof senha !== 'string') {
      return NextResponse.json(
        { 
          ok: false,
          message: 'Senha é obrigatória'
        },
        { status: 400 }
      )
    }

    if (!isValidEmail(email)) {
      return NextResponse.json(
        { 
          ok: false,
          message: 'Email inválido'
        },
        { status: 400 }
      )
    }

    // Rate limiting por IP (5 tentativas / 15 minutos)
    const clientIP = getClientIP(request)
    const rateLimit = checkRateLimit(clientIP, 5, 15 * 60 * 1000)

    if (!rateLimit.allowed) {
      const minutesUntilReset = Math.ceil((rateLimit.resetAt - Date.now()) / 60000)
      return NextResponse.json(
        { 
          ok: false,
          message: `Muitas tentativas. Tente novamente em ${minutesUntilReset} minuto(s).`
        },
        { status: 429 }
      )
    }

    // Normalizar email
    const normalizedEmail = email.trim().toLowerCase()

    // Buscar user por email
    const user = await prisma.user.findUnique({
      where: { email: normalizedEmail },
    })

    // Sempre retornar mensagem genérica (não revelar se email existe ou não)
    // Isso evita enumeração de emails cadastrados
    const genericErrorMessage = 'Credenciais inválidas'

    // Se não encontrou usuário OU senha inválida, retornar mesma mensagem
    if (!user) {
      return NextResponse.json(
        { 
          ok: false,
          message: genericErrorMessage
        },
        { status: 401 }
      )
    }

    // Comparar senha
    const senhaValida = await bcrypt.compare(senha, user.senha)

    if (!senhaValida) {
      return NextResponse.json(
        { 
          ok: false,
          message: genericErrorMessage
        },
        { status: 401 }
      )
    }

    // Verificar status do usuário
    // ADMIN com status ACTIVE pode fazer login sem verificar Enrollment
    // Outros usuários precisam ter Enrollment.status = ACTIVE
    if (user.role === 'ADMIN' && user.status === 'ACTIVE') {
      // Admin: login permitido diretamente
      const response = NextResponse.json({
        ok: true,
        data: {
          user: {
            id: user.id,
            nome: user.nome,
            email: user.email,
            whatsapp: user.whatsapp,
            role: user.role,
            status: user.status,
            createdAt: user.criadoEm,
          },
          redirectTo: '/admin', // Admin vai para dashboard
        },
      })

      // Criar sessão
      await createSession(response, {
        userId: user.id,
        email: user.email,
        role: user.role,
        status: user.status,
      })

      return response
    }

    // Para não-admin: verificar status do usuário
    if (user.status !== 'ACTIVE') {
      const statusMessage = 'Aguarde liberação do acesso. Entre em contato com a escola se necessário.'
      return NextResponse.json(
        {
          ok: false,
          message: statusMessage
        },
        { status: 403 }
      )
    }

    // Verificar se o Enrollment está ACTIVE
    // Buscar Enrollment mais recente do usuário (enrollment principal)
    const enrollment = await prisma.enrollment.findFirst({
      where: {
        userId: user.id,
      },
      orderBy: { criadoEm: 'desc' },
    })

    // Se não tem Enrollment ou status não é ACTIVE, bloquear login
    if (!enrollment || enrollment.status !== 'ACTIVE') {
      const statusMessage = 'Seu acesso ainda não foi liberado. Finalize contrato/pagamento ou aguarde confirmação.'
      return NextResponse.json(
        {
          ok: false,
          message: statusMessage
        },
        { status: 403 }
      )
    }

    // Login bem-sucedido - User.status = ACTIVE e Enrollment.status = ACTIVE (NUNCA retornar senha)
    const response = NextResponse.json({
      ok: true,
      data: {
        user: {
          id: user.id,
          nome: user.nome,
          email: user.email,
          whatsapp: user.whatsapp,
          role: user.role,
          status: user.status,
          createdAt: user.criadoEm,
        },
        redirectTo: '/', // Estudante vai para home
      },
    })

    // Criar sessão
    await createSession(response, {
      userId: user.id,
      email: user.email,
      role: user.role,
      status: user.status,
    })

    return response
  } catch (error) {
    console.error('Erro ao fazer login:', error)
    return NextResponse.json(
      { 
        ok: false,
        message: 'Erro interno do servidor'
      },
      { status: 500 }
    )
  }
}
