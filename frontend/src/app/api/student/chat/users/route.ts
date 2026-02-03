/**
 * GET /api/student/chat/users
 * Lista usuários com quem o aluno pode iniciar chat (professores e funcionários).
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireStudent } from '@/lib/auth'

function getSectorLabelFromPages(adminPages: unknown): string | null {
  const pages = Array.isArray(adminPages) ? (adminPages as string[]) : []
  if (pages.includes('financeiro')) return 'Financeiro'
  if (pages.some((p) => p === 'calendario' || p === 'registros-aulas')) return 'Gestão de aulas'
  if (pages.includes('livros')) return 'Material'
  return null
}

export async function GET(request: NextRequest) {
  try {
    const auth = await requireStudent(request)
    if (!auth.authorized || !auth.session) {
      return NextResponse.json(
        { ok: false, message: auth.message || 'Não autorizado' },
        { status: auth.session ? 403 : 401 }
      )
    }

    const currentUserId = auth.session.userId
    const search = request.nextUrl.searchParams.get('search')?.trim() || ''

    const where: { id?: { not: string }; role: unknown; OR?: unknown[] } = {
      id: { not: currentUserId },
      role: { in: ['ADMIN', 'TEACHER'] },
    }
    if (search) {
      where.OR = [
        { nome: { contains: search } },
        { email: { contains: search } },
      ]
    }

    const users = await prisma.user.findMany({
      where,
      select: {
        id: true,
        nome: true,
        email: true,
        role: true,
        adminPages: true,
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
      data: users.map((u) => {
        const sector = u.role === 'ADMIN' ? getSectorLabelFromPages(u.adminPages) : null
        return {
          id: u.id,
          nome: u.nome,
          email: u.email,
          role: u.role,
          roleLabel: sector ?? roleLabel[u.role] ?? u.role,
        }
      }),
    })
  } catch (error) {
    console.error('[api/student/chat/users GET]', error)
    return NextResponse.json(
      { ok: false, message: 'Erro ao listar usuários' },
      { status: 500 }
    )
  }
}
