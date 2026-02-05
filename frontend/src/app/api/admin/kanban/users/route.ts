/**
 * GET /api/admin/kanban/users – lista usuários ADM (id, nome) para atribuir tarefas
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
    const users = await prisma.user.findMany({
      where: { role: 'ADMIN' },
      select: { id: true, nome: true },
      orderBy: { nome: 'asc' },
    })
    return NextResponse.json({
      ok: true,
      data: users.map((u) => ({ id: u.id, nome: u.nome })),
    })
  } catch (error) {
    console.error('[api/admin/kanban/users]', error)
    return NextResponse.json(
      { ok: false, message: 'Erro ao listar usuários' },
      { status: 500 }
    )
  }
}
