/**
 * API Route: POST /api/login
 *
 * Valida email e senha, retorna dados do usuário.
 *
 * Proteções:
 * - Rate limiting por IP (5 tentativas / 15 min) — desativado em NODE_ENV=development
 * - Mensagem genérica de erro (não revela se email existe)
 *
 * Endpoint usado pela página /login
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { isValidEmail } from '@/lib/validators'
import { checkRateLimit, getClientIP } from '@/lib/rateLimit'
import { createSession } from '@/lib/session'
import { setSessionCookie } from '@/lib/adminSession'
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

    // Buscar user por email (inclui adminPages e mustChangePassword para professor)
    const user = await prisma.user.findUnique({
      where: { email: normalizedEmail },
      select: {
        id: true,
        nome: true,
        email: true,
        whatsapp: true,
        senha: true,
        role: true,
        status: true,
        criadoEm: true,
        adminPages: true,
        mustChangePassword: true,
      },
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
    if (user.role === 'ADMIN' && user.status === 'ACTIVE') {
      // Admin: login permitido diretamente; único login identifica automaticamente
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
          redirectTo: '/admin/dashboard',
        },
      })

      await createSession(response, {
        userId: user.id,
        email: user.email,
        role: user.role,
        status: user.status,
      })
      const adminPages: string[] | undefined = Array.isArray(user.adminPages) ? (user.adminPages as string[]) : undefined
      await setSessionCookie(response, {
        sub: user.id,
        role: 'ADMIN',
        email: user.email,
        adminPages,
      })

      return response
    }

    // Professor: login com role TEACHER e status ACTIVE → Dashboard Professores (ou alterar-senha se primeira vez)
    if (user.role === 'TEACHER' && user.status === 'ACTIVE') {
      const mustChangePassword = Boolean((user as { mustChangePassword?: boolean }).mustChangePassword)
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
            mustChangePassword,
          },
          redirectTo: mustChangePassword ? '/dashboard-professores/alterar-senha' : '/dashboard-professores',
        },
      })

      await createSession(response, {
        userId: user.id,
        email: user.email,
        role: user.role,
        status: user.status,
      })

      return response
    }

    // Para aluno (STUDENT): verificar status do usuário
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

    // Login bem-sucedido - Estudante: redirecionar para alterar-senha se obrigatório
    const mustChangePassword = Boolean((user as { mustChangePassword?: boolean }).mustChangePassword)
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
          mustChangePassword,
        },
        redirectTo: mustChangePassword ? '/dashboard-aluno/alterar-senha' : '/dashboard-aluno',
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
