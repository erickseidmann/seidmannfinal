/**
 * GET /api/professor/chat/users
 * Lista usuários com quem o professor pode iniciar chat (ADMs e alunos apenas).
 * Professores NÃO podem conversar diretamente com outros professores.
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireTeacher } from '@/lib/auth'

export async function GET(request: NextRequest) {
  try {
    const auth = await requireTeacher(request)
    if (!auth.authorized || !auth.session) {
      return NextResponse.json(
        { ok: false, message: auth.message || 'Não autorizado' },
        { status: auth.session ? 403 : 401 }
      )
    }

    const currentUserId = auth.session.userId
    const search = request.nextUrl.searchParams.get('search')?.trim() || ''

    const where: { id?: { not: string }; role: unknown; status?: string } = {
      id: { not: currentUserId },
      role: { in: ['ADMIN', 'STUDENT'] }, // Professores não podem conversar com outros professores
    }
    if (search) {
      where.OR = [
        { nome: { contains: search } },
        { email: { contains: search } },
      ] as unknown[]
    }

    const users = await prisma.user.findMany({
      where,
      select: {
        id: true,
        nome: true,
        email: true,
        role: true,
      },
      orderBy: [{ role: 'asc' }, { nome: 'asc' }],
      take: 100,
    })

    const roleLabel: Record<string, string> = {
      ADMIN: 'Funcionário',
      TEACHER: 'Professor',
      STUDENT: 'Aluno',
    }

    return NextResponse.json({
      ok: true,
      data: users.map((u) => ({
        id: u.id,
        nome: u.nome,
        email: u.email,
        role: u.role,
        roleLabel: roleLabel[u.role] ?? u.role,
      })),
    })
  } catch (error) {
    console.error('[api/professor/chat/users GET]', error)
    return NextResponse.json(
      { ok: false, message: 'Erro ao listar usuários' },
      { status: 500 }
    )
  }
}
