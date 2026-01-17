/**
 * API Route: GET /api/admin/users
 * 
 * Lista usuários com filtros
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
    const statusFilter = searchParams.get('status')
    const roleFilter = searchParams.get('role')
    const searchQuery = searchParams.get('search')?.trim() || ''

    // Construir filtros
    const where: any = {}

    if (statusFilter) {
      where.status = statusFilter
    }

    if (roleFilter) {
      where.role = roleFilter
    }

    if (searchQuery) {
      where.OR = [
        { nome: { contains: searchQuery } },
        { email: { contains: searchQuery } },
        { whatsapp: { contains: searchQuery } },
      ]
    }

    // Buscar usuários com contagem de enrollments
    // bookReleases será adicionado após regenerar Prisma Client
    const users = await prisma.user.findMany({
      where,
      select: {
        id: true,
        nome: true,
        email: true,
        whatsapp: true,
        role: true,
        status: true,
        criadoEm: true,
        atualizadoEm: true,
        _count: {
          select: {
            enrollments: true,
          },
        },
      },
      orderBy: {
        criadoEm: 'desc',
      },
      take: 100, // Limitar a 100 resultados
    })

    // Buscar contagem de livros separadamente (se o model existir)
    let booksCountMap: Record<string, number> = {}
    if (prisma.bookRelease) {
      try {
        const bookCounts = await prisma.bookRelease.groupBy({
          by: ['userId'],
          _count: {
            id: true,
          },
        })
        bookCounts.forEach((item) => {
          booksCountMap[item.userId] = item._count.id
        })
      } catch (err) {
        console.warn('[api/admin/users] Erro ao contar livros (model pode não existir ainda):', err)
      }
    }

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
          enrollmentsCount: u._count.enrollments,
          booksCount: booksCountMap[u.id] || 0,
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
