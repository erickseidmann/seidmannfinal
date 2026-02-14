/**
 * API Route: POST /api/admin/books/release-batch
 *
 * Libera livro(s) para usuário(s).
 * Body: { bookId?: string, bookIds?: string[], userIds: string[] }
 * - bookId: um livro para vários usuários
 * - bookIds: vários livros para vários usuários (ou todos se omitido com bookIds=[])
 * Precisam de (bookId ou bookIds) e userIds.
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
    const { bookId, bookIds, userIds } = body

    const ids = Array.isArray(userIds) ? userIds.filter((id: unknown) => id && typeof id === 'string') : []
    if (ids.length === 0) {
      return NextResponse.json(
        { ok: false, message: 'userIds (array) é obrigatório' },
        { status: 400 }
      )
    }

    let booksToRelease: { id: string }[] = []
    if (bookId && typeof bookId === 'string') {
      const b = await prisma.book.findUnique({ where: { id: bookId } })
      if (b) booksToRelease = [b]
      else {
        return NextResponse.json(
          { ok: false, message: 'Livro não encontrado' },
          { status: 404 }
        )
      }
    } else if (Array.isArray(bookIds) && bookIds.length > 0) {
      const valid = bookIds.filter((id: unknown) => id && typeof id === 'string')
      const found = await prisma.book.findMany({ where: { id: { in: valid } } })
      booksToRelease = found
    } else {
      return NextResponse.json(
        { ok: false, message: 'bookId ou bookIds (array) é obrigatório' },
        { status: 400 }
      )
    }

    if (!prisma.bookRelease) {
      return NextResponse.json(
        { ok: false, message: 'Modelo não disponível' },
        { status: 503 }
      )
    }

    const releasedByAdminEmail = auth.session?.email || 'admin@seidmann.com'
    let created = 0
    let skipped = 0

    for (const book of booksToRelease) {
      for (const userId of ids) {
        const existing = await prisma.bookRelease.findUnique({
          where: {
            userId_bookCode: { userId, bookCode: book.id },
          },
        })
        if (existing) {
          skipped++
          continue
        }
        await prisma.bookRelease.create({
          data: {
            userId,
            bookCode: book.id,
            bookId: book.id,
            releasedByAdminEmail,
          },
        })
        created++
      }
    }

    const msg =
      booksToRelease.length > 1
        ? `${created} liberação(ões) criada(s)${skipped > 0 ? `, ${skipped} já existiam` : ''}.`
        : `${created} aluno(s) liberado(s)${skipped > 0 ? `, ${skipped} já tinham acesso` : ''}.`
    return NextResponse.json({
      ok: true,
      data: { created, skipped },
      message: msg,
    })
  } catch (error) {
    console.error('[api/admin/books/release-batch] Erro:', error)
    return NextResponse.json(
      { ok: false, message: 'Erro ao liberar livro' },
      { status: 500 }
    )
  }
}
