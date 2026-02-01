/**
 * API Route: POST /api/admin/teachers/[id]/criar-acesso
 * Cria ou atualiza o login (User) do professor. Senha opcional: se não informada, usa 123456 e obriga troca no 1º acesso.
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/auth'
import bcrypt from 'bcryptjs'

const SENHA_PADRAO_PROFESSOR = '123456'

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

    const { id: teacherId } = await params
    const body = await request.json().catch(() => ({}))
    const senha = body?.senha != null ? String(body.senha).trim() : ''

    const teacher = await prisma.teacher.findUnique({
      where: { id: teacherId },
      select: { id: true, nome: true, email: true, whatsapp: true, userId: true },
    })

    if (!teacher) {
      return NextResponse.json(
        { ok: false, message: 'Professor não encontrado' },
        { status: 404 }
      )
    }

    const normalizedEmail = teacher.email.trim().toLowerCase()
    const useDefaultPassword = senha.length < 6
    const passwordToUse = useDefaultPassword ? SENHA_PADRAO_PROFESSOR : senha
    const passwordHash = await bcrypt.hash(passwordToUse, 10)

    if (teacher.userId) {
      await prisma.user.update({
        where: { id: teacher.userId },
        data: { senha: passwordHash, mustChangePassword: useDefaultPassword },
      })
      return NextResponse.json({
        ok: true,
        data: {
          message: useDefaultPassword
            ? 'Senha redefinida para a padrão (123456). O professor deve alterar no primeiro acesso.'
            : 'Senha do professor atualizada.',
        },
      })
    }

    const userExists = await prisma.user.findUnique({ where: { email: normalizedEmail } })
    if (userExists) {
      return NextResponse.json(
        { ok: false, message: 'Já existe um usuário com o email deste professor. Use outro email no cadastro do professor ou vincule o acesso manualmente.' },
        { status: 409 }
      )
    }

    const user = await prisma.user.create({
      data: {
        nome: teacher.nome,
        email: teacher.email,
        whatsapp: teacher.whatsapp || '00000000000',
        senha: passwordHash,
        role: 'TEACHER',
        status: 'ACTIVE',
        mustChangePassword: useDefaultPassword,
      },
    })

    await prisma.teacher.update({
      where: { id: teacherId },
      data: { userId: user.id },
    })

    return NextResponse.json({
      ok: true,
      data: {
        message: useDefaultPassword
          ? 'Acesso criado. Login: email do professor. Senha padrão: 123456 (o professor deve alterar no primeiro acesso).'
          : 'Acesso ao Dashboard Professores criado com a senha definida.',
      },
    })
  } catch (error) {
    console.error('[api/admin/teachers/[id]/criar-acesso] Erro:', error)
    return NextResponse.json(
      { ok: false, message: 'Erro ao criar acesso do professor' },
      { status: 500 }
    )
  }
}
