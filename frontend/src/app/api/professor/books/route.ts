/**
 * GET /api/professor/books
 * Lista o catálogo de livros (mesma origem que Admin → Livros), somente leitura.
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
        { status: auth.message?.includes('Não autenticado') ? 401 : 403 }
      )
    }

    if (!prisma.book) {
      return NextResponse.json(
        { ok: false, message: 'Modelo Book não disponível' },
        { status: 503 }
      )
    }

    const books = await prisma.book.findMany({
      orderBy: [{ level: 'asc' }, { nome: 'asc' }],
      select: {
        id: true,
        nome: true,
        level: true,
        language: true,
        totalPaginas: true,
        capaPath: true,
        pdfPath: true,
      },
    })

    return NextResponse.json({ ok: true, data: { books } })
  } catch (error) {
    console.error('[api/professor/books] Erro:', error)
    return NextResponse.json(
      { ok: false, message: 'Erro ao listar livros' },
      { status: 500 }
    )
  }
}
