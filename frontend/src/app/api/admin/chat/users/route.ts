/**
 * GET /api/admin/chat/users
 * Lista usuários com quem o admin pode iniciar chat (outros ADMs, professores, alunos).
 */

import { NextRequest, NextResponse } from 'next/server'
import { Prisma, type UserRole } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/auth'

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAdmin(request)
    if (!auth.authorized || !auth.session) {
      return NextResponse.json(
        { ok: false, message: auth.message || 'Não autorizado' },
        { status: auth.session ? 403 : 401 }
      )
    }

    const currentUserId = auth.session.sub
    const search = request.nextUrl.searchParams.get('search')?.trim() || ''

    const where: Prisma.UserWhereInput = {
      id: { not: currentUserId },
      role: { in: ['ADMIN', 'TEACHER', 'STUDENT'] as UserRole[] },
    }
    if (search) {
      where.OR = [
        { nome: { contains: search } },
        { email: { contains: search } },
      ]
    }

    const inactiveTeacherUserIds = new Set(
      (
        await prisma.teacher.findMany({
          where: { status: 'INACTIVE', userId: { not: null } },
          select: { userId: true },
        })
      )
        .map((t) => t.userId)
        .filter((id): id is string => id != null)
    )

    const users = await prisma.user.findMany({
      where: {
        ...where,
        status: 'ACTIVE',
      },
      select: {
        id: true,
        nome: true,
        email: true,
        role: true,
      },
      orderBy: [{ role: 'asc' }, { nome: 'asc' }],
      take: 100,
    })

    const filtered = users.filter(
      (u) => !(u.role === 'TEACHER' && inactiveTeacherUserIds.has(u.id))
    )

    const roleLabel: Record<string, string> = {
      ADMIN: 'Funcionário',
      TEACHER: 'Professor',
      STUDENT: 'Aluno',
    }

    return NextResponse.json({
      ok: true,
      data: filtered.map((u) => ({
        id: u.id,
        nome: u.nome,
        email: u.email,
        role: u.role,
        roleLabel: roleLabel[u.role] ?? u.role,
      })),
    })
  } catch (error) {
    console.error('[api/admin/chat/users GET]', error)
    return NextResponse.json(
      { ok: false, message: 'Erro ao listar usuários' },
      { status: 500 }
    )
  }
}
