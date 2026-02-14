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
    const { userId, bookCode, bookId } = body

    // bookId (do catálogo) ou bookCode (legado)
    let finalBookCode = (bookCode || '').trim()
    let finalBookId: string | null = null

    if (bookId) {
      if (!prisma.book) {
        return NextResponse.json(
          { ok: false, message: 'Modelo Book não disponível' },
          { status: 503 }
        )
      }
      const book = await prisma.book.findUnique({ where: { id: bookId } })
      if (!book) {
        return NextResponse.json(
          { ok: false, message: 'Livro não encontrado no catálogo' },
          { status: 404 }
        )
      }
      finalBookCode = book.id
      finalBookId = book.id
    }

    if (!userId || !finalBookCode) {
      return NextResponse.json(
        { ok: false, message: 'userId e bookId (ou bookCode) são obrigatórios' },
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
          bookCode: finalBookCode,
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
        bookCode: finalBookCode,
        bookId: finalBookId,
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
        book: {
          select: {
            id: true,
            nome: true,
            level: true,
            totalPaginas: true,
            imprimivel: true,
            capaPath: true,
          },
        },
      },
    })

    const bookNome = release.book?.nome || release.bookCode
    return NextResponse.json({
      ok: true,
      data: {
        release: {
          id: release.id,
          userId: release.userId,
          user: release.user,
          bookCode: release.bookCode,
          bookId: release.bookId,
          book: release.book,
          releasedByAdminEmail: release.releasedByAdminEmail,
          criadoEm: release.criadoEm.toISOString(),
        },
        message: `Livro ${bookNome} liberado para ${release.user.nome}`,
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
