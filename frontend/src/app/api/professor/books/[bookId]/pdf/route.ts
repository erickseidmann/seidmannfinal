/**
 * GET /api/professor/books/[bookId]/pdf
 * Stream do PDF do livro para o professor (visualização apenas, sem download).
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireTeacher } from '@/lib/auth'
import { readFile } from 'fs/promises'
import path from 'path'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ bookId: string }> }
) {
  try {
    const auth = await requireTeacher(request)
    if (!auth.authorized) {
      return new NextResponse('Não autorizado', { status: auth.session ? 403 : 401 })
    }

    const { bookId } = await params

    const book = await prisma.book.findUnique({
      where: { id: bookId },
      select: { id: true, pdfPath: true },
    })

    if (!book?.pdfPath) {
      return new NextResponse('Livro não encontrado ou PDF não disponível', { status: 404 })
    }

    const pdfPath = book.pdfPath
    if (!pdfPath.startsWith('/uploads/')) {
      return new NextResponse('Caminho inválido', { status: 400 })
    }

    const fullPath = path.join(process.cwd(), 'public', pdfPath.replace(/^\//, ''))
    const buffer = await readFile(fullPath)

    return new NextResponse(buffer, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': 'inline',
        'Cache-Control': 'private, no-store',
      },
    })
  } catch (error) {
    console.error('[api/professor/books/[bookId]/pdf] Erro:', error)
    return new NextResponse('Erro ao carregar PDF', { status: 500 })
  }
}
