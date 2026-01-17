/**
 * API Route: GET /api/admin/books/releases
 * 
 * Lista liberações de livros (com filtro opcional por userId)
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
    const userId = searchParams.get('userId')

    const where: any = {}
    if (userId) {
      where.userId = userId
    }

    // Verificar se o model existe no Prisma Client
    if (!prisma.bookRelease) {
      console.error('[api/admin/books/releases] Model BookRelease não encontrado no Prisma Client. Execute: npx prisma generate')
      return NextResponse.json(
        { ok: false, message: 'Modelo BookRelease não disponível. Execute: npx prisma generate' },
        { status: 503 }
      )
    }

    const releases = await prisma.bookRelease.findMany({
      where,
      include: {
        user: {
          select: {
            id: true,
            nome: true,
            email: true,
          },
        },
      },
      orderBy: {
        criadoEm: 'desc',
      },
    })

    return NextResponse.json({
      ok: true,
      data: {
        releases: releases.map((r) => ({
          id: r.id,
          userId: r.userId,
          user: r.user,
          bookCode: r.bookCode,
          releasedByAdminEmail: r.releasedByAdminEmail,
          criadoEm: r.criadoEm.toISOString(),
        })),
      },
    })
  } catch (error) {
    console.error('[api/admin/books/releases] Erro ao listar liberações:', error)
    return NextResponse.json(
      { ok: false, message: 'Erro ao listar liberações de livros' },
      { status: 500 }
    )
  }
}
