/**
 * GET /api/student/books/[bookId]/pdf
 * Stream do PDF do livro - apenas se o aluno tem acesso.
 * Sem download direto (Content-Disposition: inline).
 *
 * Usa o mesmo critério da API de listagem: User pelo email da matrícula ativa.
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireStudent } from '@/lib/auth'
import { readFile } from 'fs/promises'
import path from 'path'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ bookId: string }> }
) {
  try {
    const auth = await requireStudent(request)
    if (!auth.authorized || !auth.session) {
      return new NextResponse('Não autorizado', { status: auth.session ? 403 : 401 })
    }

    const { bookId } = await params

    // Mesmo critério da listagem: User pelo email da matrícula
    const enrollment = await prisma.enrollment.findFirst({
      where: { userId: auth.session.userId, status: 'ACTIVE' },
      orderBy: { criadoEm: 'desc' },
      select: { email: true },
    })
    let targetUserId = auth.session.userId
    if (enrollment?.email?.trim()) {
      const userByEmail = await prisma.user.findUnique({
        where: { email: enrollment.email.trim().toLowerCase() },
        select: { id: true },
      })
      if (userByEmail) targetUserId = userByEmail.id
    }

    const release = await prisma.bookRelease.findFirst({
      where: {
        userId: targetUserId,
        OR: [{ bookId }, { bookCode: bookId }],
      },
      include: { book: true },
    })

    if (!release?.book?.pdfPath) {
      return new NextResponse('Livro não encontrado ou acesso não liberado', { status: 404 })
    }

    const pdfPath = release.book.pdfPath
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
    console.error('[api/student/books/[bookId]/pdf] Erro:', error)
    return new NextResponse('Erro ao carregar PDF', { status: 500 })
  }
}
