/**
 * API Route: GET /api/admin/books/students
 * Lista usuários (alunos e/ou professores) para seleção ao liberar livro
 * Query: search, excludeBookId, includeTeachers (true = inclui professores)
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/auth'

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAdmin(request)
    if (!auth.authorized) {
      return NextResponse.json(
        { ok: false, message: auth.message || 'Não autorizado' },
        { status: auth.message?.includes('Não autenticado') ? 401 : 403 }
      )
    }

    const { searchParams } = new URL(request.url)
    const search = (searchParams.get('search') || '').trim()
    const excludeBookId = (searchParams.get('excludeBookId') || '').trim()
    const includeTeachers = searchParams.get('includeTeachers') === 'true'

    const roleFilter = includeTeachers
      ? { in: ['STUDENT', 'TEACHER'] as const }
      : 'STUDENT'

    const where: { role: typeof roleFilter; OR?: unknown[]; id?: { notIn: string[] } } = {
      role: roleFilter,
    }
    if (search) {
      where.OR = [
        { nome: { contains: search } },
        { email: { contains: search } },
      ]
    }

    // Excluir alunos que já têm acesso ao livro selecionado
    if (excludeBookId) {
      const releases = await prisma.bookRelease.findMany({
        where: { bookCode: excludeBookId },
        select: { userId: true },
      })
      const userIdsWithAccess = releases.map((r) => r.userId)
      if (userIdsWithAccess.length > 0) {
        where.id = { notIn: userIdsWithAccess }
      }
    }

    const users = await prisma.user.findMany({
      where,
      select: { id: true, nome: true, email: true, role: true },
      orderBy: [{ role: 'asc' }, { nome: 'asc' }],
      take: 500,
    })

    return NextResponse.json({
      ok: true,
      data: users,
    })
  } catch (error) {
    console.error('[api/admin/books/students] Erro:', error)
    return NextResponse.json(
      { ok: false, message: 'Erro ao buscar alunos' },
      { status: 500 }
    )
  }
}
