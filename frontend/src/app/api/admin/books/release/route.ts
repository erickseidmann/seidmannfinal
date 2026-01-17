/**
 * API Route: POST /api/admin/books/release
 * 
 * Libera um livro para um usuário
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/auth'

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAdmin(request)
    if (!auth.authorized) {
      return NextResponse.json(
        { ok: false, message: auth.message || 'Não autorizado' },
        { status: auth.message?.includes('Não autenticado') ? 401 : 403 }
      )
    }

    const body = await request.json()
    const { userId, bookCode } = body

    // Validações
    if (!userId || !bookCode) {
      return NextResponse.json(
        { ok: false, message: 'userId e bookCode são obrigatórios' },
        { status: 400 }
      )
    }

    // Verificar se o model existe no Prisma Client
    if (!prisma.bookRelease) {
      console.error('[api/admin/books/release] Model BookRelease não encontrado no Prisma Client. Execute: npx prisma generate')
      return NextResponse.json(
        { ok: false, message: 'Modelo BookRelease não disponível. Execute: npx prisma generate' },
        { status: 503 }
      )
    }

    // Verificar se usuário existe
    const user = await prisma.user.findUnique({
      where: { id: userId },
    })

    if (!user) {
      return NextResponse.json(
        { ok: false, message: 'Usuário não encontrado' },
        { status: 404 }
      )
    }

    // Verificar se já foi liberado (unique constraint)
    const existing = await prisma.bookRelease.findUnique({
      where: {
        userId_bookCode: {
          userId,
          bookCode: bookCode.trim(),
        },
      },
    })

    if (existing) {
      return NextResponse.json(
        { ok: false, message: 'Este livro já foi liberado para este usuário' },
        { status: 409 }
      )
    }

    // Criar liberação
    const release = await prisma.bookRelease.create({
      data: {
        userId,
        bookCode: bookCode.trim(),
        releasedByAdminEmail: auth.session?.email || 'admin@seidmann.com',
      },
      include: {
        user: {
          select: {
            id: true,
            nome: true,
            email: true,
          },
        },
      },
    })

    return NextResponse.json({
      ok: true,
      data: {
        release: {
          id: release.id,
          userId: release.userId,
          user: release.user,
          bookCode: release.bookCode,
          releasedByAdminEmail: release.releasedByAdminEmail,
          criadoEm: release.criadoEm.toISOString(),
        },
        message: `Livro ${release.bookCode} liberado para ${release.user.nome}`,
      },
    }, { status: 201 })
  } catch (error: any) {
    console.error('[api/admin/books/release] Erro ao liberar livro:', error)
    
    // Tratar erro de constraint única
    if (error.code === 'P2002') {
      return NextResponse.json(
        { ok: false, message: 'Este livro já foi liberado para este usuário' },
        { status: 409 }
      )
    }

    return NextResponse.json(
      { ok: false, message: 'Erro ao liberar livro' },
      { status: 500 }
    )
  }
}
