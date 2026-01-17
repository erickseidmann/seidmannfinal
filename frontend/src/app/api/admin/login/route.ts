/**
 * API Route: POST /api/admin/login
 * 
 * Login específico para administradores.
 * Valida credenciais via ADMIN_EMAIL e ADMIN_PASSWORD do .env.
 * Cria usuário admin se não existir (idempotente).
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { setSessionCookie } from '@/lib/adminSession'
import bcrypt from 'bcryptjs'

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@seidmann.com'
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || ''
const ADMIN_NAME = process.env.ADMIN_NAME || 'Admin'

/**
 * Cria ou atualiza usuário admin no banco (idempotente)
 */
async function ensureAdminExists() {
  const normalizedEmail = ADMIN_EMAIL.trim().toLowerCase()
  const passwordHash = await bcrypt.hash(ADMIN_PASSWORD, 10)

  // Usar upsert para criar ou atualizar admin
  const admin = await prisma.user.upsert({
    where: { email: normalizedEmail },
    update: {
      // Sempre atualizar para garantir role, status e senha corretos
      role: 'ADMIN',
      status: 'ACTIVE',
      senha: passwordHash, // Atualiza senha se mudou no .env
      nome: ADMIN_NAME.trim(), // Atualiza nome se mudou
    },
    create: {
      nome: ADMIN_NAME.trim(),
      email: normalizedEmail,
      whatsapp: '00000000000', // Placeholder
      senha: passwordHash,
      role: 'ADMIN',
      status: 'ACTIVE',
    },
  })

  return admin
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { email, senha } = body

    // Validações básicas
    if (!email || typeof email !== 'string' || !email.trim()) {
      return NextResponse.json(
        { ok: false, message: 'Email é obrigatório' },
        { status: 400 }
      )
    }

    if (!senha || typeof senha !== 'string') {
      return NextResponse.json(
        { ok: false, message: 'Senha é obrigatória' },
        { status: 400 }
      )
    }

    const normalizedEmail = email.trim().toLowerCase()
    const normalizedAdminEmail = ADMIN_EMAIL.trim().toLowerCase()

    // Validar que é o email do admin
    if (normalizedEmail !== normalizedAdminEmail) {
      // Mensagem genérica para não revelar email do admin
      return NextResponse.json(
        { ok: false, message: 'Credenciais inválidas' },
        { status: 401 }
      )
    }

    // Garantir que admin existe no banco
    const admin = await ensureAdminExists()

    // Comparar senha
    const senhaValida = await bcrypt.compare(senha, admin.senha)

    if (!senhaValida) {
      return NextResponse.json(
        { ok: false, message: 'Credenciais inválidas' },
        { status: 401 }
      )
    }

    // Verificar role e status
    if (admin.role !== 'ADMIN') {
      return NextResponse.json(
        { ok: false, message: 'Acesso negado. Apenas administradores podem acessar.' },
        { status: 403 }
      )
    }

    if (admin.status !== 'ACTIVE') {
      return NextResponse.json(
        { ok: false, message: 'Aguarde liberação.' },
        { status: 403 }
      )
    }

    // Criar resposta com sessão
    const response = NextResponse.json({
      ok: true,
      data: {
        user: {
          id: admin.id,
          nome: admin.nome,
          email: admin.email,
          role: admin.role,
        },
      },
    })

    // Definir cookie de sessão
    await setSessionCookie(response, {
      sub: admin.id,
      role: 'ADMIN',
      email: admin.email,
    })

    return response
  } catch (error) {
    console.error('[api/admin/login] Erro ao fazer login admin:', error)
    return NextResponse.json(
      { ok: false, message: 'Erro interno do servidor' },
      { status: 500 }
    )
  }
}
