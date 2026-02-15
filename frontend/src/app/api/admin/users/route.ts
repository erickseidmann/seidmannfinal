/**
 * API Route: GET /api/admin/users
 * POST /api/admin/users
 *
 * Usuários do ADM: apenas admin@seidmann.com. Lista só funcionários (email @seidmann.com).
 */

import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { requireSuperAdmin } from '@/lib/auth'
import bcrypt from 'bcryptjs'

const SEIDMANN_SUFFIX = '@seidmann.com'

export async function GET(request: NextRequest) {
  try {
    const auth = await requireSuperAdmin(request)
    if (!auth.authorized) {
      return NextResponse.json(
        { ok: false, message: auth.message || 'Não autorizado' },
        { status: auth.message?.includes('Não autenticado') ? 401 : 403 }
      )
    }

    const { searchParams } = new URL(request.url)
    const statusFilter = searchParams.get('status')
    const searchQuery = searchParams.get('search')?.trim() || ''

    const where: Prisma.UserWhereInput = {
      email: { endsWith: SEIDMANN_SUFFIX },
    }
    if (statusFilter && (statusFilter === 'ACTIVE' || statusFilter === 'PENDING' || statusFilter === 'BLOCKED')) where.status = statusFilter
    if (searchQuery) {
      where.OR = [
        { nome: { contains: searchQuery } },
        { email: { contains: searchQuery } },
        { whatsapp: { contains: searchQuery } },
        { funcao: { contains: searchQuery } },
      ]
    }

    const users = await prisma.user.findMany({
      where,
      select: {
        id: true,
        nome: true,
        email: true,
        whatsapp: true,
        role: true,
        status: true,
        funcao: true,
        emailPessoal: true,
        adminPages: true,
        criadoEm: true,
        atualizadoEm: true,
      },
      orderBy: { criadoEm: 'desc' },
      take: 200,
    })

    return NextResponse.json({
      ok: true,
      data: {
        users: users.map((u) => ({
          id: u.id,
          nome: u.nome,
          email: u.email,
          whatsapp: u.whatsapp,
          role: u.role,
          status: u.status,
          funcao: u.funcao,
          emailPessoal: u.emailPessoal ?? null,
          adminPages: Array.isArray(u.adminPages) ? u.adminPages : (u.adminPages as string[] | null) ?? [],
          criadoEm: u.criadoEm.toISOString(),
          atualizadoEm: u.atualizadoEm.toISOString(),
        })),
      },
    })
  } catch (error) {
    console.error('[api/admin/users] Erro ao listar usuários:', error)
    return NextResponse.json(
      { ok: false, message: 'Erro ao listar usuários' },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireSuperAdmin(request)
    if (!auth.authorized) {
      return NextResponse.json(
        { ok: false, message: auth.message || 'Não autorizado' },
        { status: auth.message?.includes('Não autenticado') ? 401 : 403 }
      )
    }

    const body = await request.json()
    const { nome, email, telefone, funcao, emailPessoal, adminPages, senha } = body
    const whatsapp = telefone ?? body.whatsapp ?? ''

    const normalizedEmail = (email || '').trim().toLowerCase()
    if (!nome || !normalizedEmail) {
      return NextResponse.json(
        { ok: false, message: 'Nome e email são obrigatórios' },
        { status: 400 }
      )
    }
    if (!normalizedEmail.endsWith(SEIDMANN_SUFFIX)) {
      return NextResponse.json(
        { ok: false, message: 'Email de acesso deve terminar com @seidmann.com' },
        { status: 400 }
      )
    }
    if (!senha || String(senha).length < 6) {
      return NextResponse.json(
        { ok: false, message: 'Senha temporária com pelo menos 6 caracteres é obrigatória' },
        { status: 400 }
      )
    }

    const existing = await prisma.user.findUnique({
      where: { email: normalizedEmail },
    })
    if (existing) {
      return NextResponse.json(
        { ok: false, message: 'Email já cadastrado' },
        { status: 409 }
      )
    }

    const passwordHash = await bcrypt.hash(String(senha), 10)
    const pages = Array.isArray(adminPages) ? adminPages : []

    const user = await prisma.user.create({
      data: {
        nome: nome.trim(),
        email: normalizedEmail,
        whatsapp: (whatsapp || '').trim() || '00000000000',
        senha: passwordHash,
        role: 'ADMIN',
        status: 'ACTIVE',
        funcao: (funcao || '').trim() || null,
        emailPessoal: (emailPessoal || '').trim() || null,
        adminPages: pages.length ? pages : undefined,
      },
      select: {
        id: true,
        nome: true,
        email: true,
        whatsapp: true,
        role: true,
        status: true,
        funcao: true,
        emailPessoal: true,
        adminPages: true,
        criadoEm: true,
        atualizadoEm: true,
      },
    })

    return NextResponse.json({
      ok: true,
      data: {
        user: {
          ...user,
          adminPages: Array.isArray(user.adminPages) ? user.adminPages : [],
          criadoEm: user.criadoEm.toISOString(),
          atualizadoEm: user.atualizadoEm.toISOString(),
        },
      },
    }, { status: 201 })
  } catch (error) {
    console.error('[api/admin/users] Erro ao criar usuário:', error)
    return NextResponse.json(
      { ok: false, message: 'Erro ao criar usuário' },
      { status: 500 }
    )
  }
}
