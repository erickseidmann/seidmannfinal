/**
 * GET /api/student/books
 * Lista os livros que o aluno tem acesso (liberados para ele)
 *
 * Usa o email da matrícula ativa para encontrar os livros, pois o admin libera
 * para o User do aluno (por email), e o painel pode ser acessado pelo responsável
 * (User diferente) que tem a matrícula do filho vinculada.
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireStudent } from '@/lib/auth'

export async function GET(request: NextRequest) {
  try {
    const auth = await requireStudent(request)
    if (!auth.authorized || !auth.session) {
      return NextResponse.json(
        { ok: false, message: auth.message || 'Não autorizado' },
        { status: auth.session ? 403 : 401 }
      )
    }

    // Buscar matrícula ativa do usuário logado
    const enrollment = await prisma.enrollment.findFirst({
      where: { userId: auth.session.userId, status: 'ACTIVE' },
      orderBy: { criadoEm: 'desc' },
      select: { email: true, userId: true },
    })

    if (!enrollment) {
      return NextResponse.json(
        { ok: false, message: 'Matrícula ativa não encontrada' },
        { status: 404 }
      )
    }

    // Livros são liberados para o User (por email no admin). Se a matrícula tem
    // email do aluno, buscar User com esse email; senão usar o userId da matrícula.
    let targetUserId = auth.session.userId
    if (enrollment.email?.trim()) {
      const userByEmail = await prisma.user.findUnique({
        where: { email: enrollment.email.trim().toLowerCase() },
        select: { id: true },
      })
      if (userByEmail) targetUserId = userByEmail.id
    }

    const releases = await prisma.bookRelease.findMany({
      where: { userId: targetUserId },
      include: {
        book: {
          select: {
            id: true,
            nome: true,
            level: true,
            totalPaginas: true,
            capaPath: true,
            pdfPath: true,
          },
        },
      },
      orderBy: { criadoEm: 'desc' },
    })

    const books = releases
      .filter((r) => r.book)
      .map((r) => ({
        id: r.book!.id,
        nome: r.book!.nome,
        level: r.book!.level,
        totalPaginas: r.book!.totalPaginas,
        capaPath: r.book!.capaPath,
        pdfPath: r.book!.pdfPath,
      }))

    return NextResponse.json({
      ok: true,
      data: { books },
    })
  } catch (error) {
    console.error('[api/student/books] Erro:', error)
    return NextResponse.json(
      { ok: false, message: 'Erro ao listar livros' },
      { status: 500 }
    )
  }
}
