/**
 * GET /api/professor/books
 * Lista os livros do catálogo (material disponível para o professor).
 * Professor tem acesso a todos os livros para consulta nas aulas.
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireTeacher } from '@/lib/auth'

export async function GET(request: NextRequest) {
  try {
    const auth = await requireTeacher(request)
    if (!auth.authorized) {
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
        totalPaginas: true,
        pdfPath: true,
        capaPath: true,
      },
    })

    return NextResponse.json({
      ok: true,
      data: {
        books: books.map((b) => ({
          id: b.id,
          nome: b.nome,
          level: b.level,
          totalPaginas: b.totalPaginas,
          capaPath: b.capaPath,
          pdfPath: b.pdfPath,
        })),
      },
    })
  } catch (error) {
    console.error('[api/professor/books] Erro:', error)
    return NextResponse.json(
      { ok: false, message: 'Erro ao listar livros' },
      { status: 500 }
    )
  }
}
