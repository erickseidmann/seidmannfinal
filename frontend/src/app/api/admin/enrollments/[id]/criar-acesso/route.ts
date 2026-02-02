/**
 * API Route: POST /api/admin/enrollments/[id]/criar-acesso
 * Cria conta de login (User) para o aluno com senha padrão 123456 e obriga alteração no 1º login.
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/auth'
import bcrypt from 'bcryptjs'

const SENHA_PADRAO_ALUNO = '123456'

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

    const { id: enrollmentId } = await params

    const enrollment = await prisma.enrollment.findUnique({
      where: { id: enrollmentId },
      select: { id: true, nome: true, email: true, whatsapp: true, userId: true },
    })

    if (!enrollment) {
      return NextResponse.json(
        { ok: false, message: 'Aluno não encontrado' },
        { status: 404 }
      )
    }

    if (enrollment.userId) {
      return NextResponse.json(
        { ok: false, message: 'Este aluno já possui acesso. Use "Redefinir senha" para alterar a senha.' },
        { status: 400 }
      )
    }

    const normalizedEmail = enrollment.email.trim().toLowerCase()
    const existingUser = await prisma.user.findUnique({
      where: { email: normalizedEmail },
      select: { id: true, role: true },
    })

    if (existingUser && existingUser.role === 'STUDENT') {
      await prisma.enrollment.update({
        where: { id: enrollmentId },
        data: { userId: existingUser.id },
      })
      return NextResponse.json({
        ok: true,
        data: {
          message: 'Acesso vinculado ao usuário existente com este e-mail. O aluno já pode fazer login.',
        },
      })
    }

    if (existingUser) {
      return NextResponse.json(
        { ok: false, message: 'Já existe um usuário (admin/professor) com este e-mail. Use outro e-mail no cadastro do aluno.' },
        { status: 400 }
      )
    }

    const passwordHash = await bcrypt.hash(SENHA_PADRAO_ALUNO, 10)
    const user = await prisma.user.create({
      data: {
        nome: enrollment.nome,
        email: normalizedEmail,
        whatsapp: enrollment.whatsapp,
        senha: passwordHash,
        role: 'STUDENT',
        status: 'ACTIVE',
        mustChangePassword: true,
      },
    })

    await prisma.enrollment.update({
      where: { id: enrollmentId },
      data: { userId: user.id },
    })

    return NextResponse.json({
      ok: true,
      data: {
        message: 'Acesso criado. O aluno pode entrar com o e-mail e a senha padrão 123456. Será obrigado a alterar a senha no primeiro login.',
      },
    })
  } catch (error) {
    console.error('[api/admin/enrollments/[id]/criar-acesso] Erro:', error)
    return NextResponse.json(
      { ok: false, message: 'Erro ao criar acesso' },
      { status: 500 }
    )
  }
}
