/**
 * GET /api/student/books/[bookId]/audios
 * Metadados dos áudios do livro — só se o aluno tem liberação (mesma regra do PDF).
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireStudent } from '@/lib/auth'

async function targetUserIdForStudent(sessionUserId: string): Promise<string> {
  const enrollment = await prisma.enrollment.findFirst({
    where: { userId: sessionUserId, status: 'ACTIVE' },
    orderBy: { criadoEm: 'desc' },
    select: { email: true },
  })
  let targetUserId = sessionUserId
  if (enrollment?.email?.trim()) {
    const userByEmail = await prisma.user.findUnique({
      where: { email: enrollment.email.trim().toLowerCase() },
      select: { id: true },
    })
    if (userByEmail) targetUserId = userByEmail.id
  }
  return targetUserId
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ bookId: string }> }
) {
  try {
    const auth = await requireStudent(request)
    if (!auth.authorized || !auth.session) {
      return NextResponse.json(
        { ok: false, message: auth.message || 'Não autorizado' },
        { status: auth.session ? 403 : 401 }
      )
    }

    const { bookId } = await params
    const targetUserId = await targetUserIdForStudent(auth.session.userId)

    const release = await prisma.bookRelease.findFirst({
      where: {
        userId: targetUserId,
        OR: [{ bookId }, { bookCode: bookId }],
      },
      include: { book: { select: { id: true } } },
    })

    if (!release?.book) {
      return NextResponse.json({ ok: false, message: 'Livro não disponível' }, { status: 404 })
    }

    const rows = await prisma.bookAudio.findMany({
      where: { bookId: release.book.id },
      orderBy: [{ sortOrder: 'asc' }, { pageStart: 'asc' }],
      select: {
        id: true,
        chapterTitle: true,
        pageStart: true,
        pageEnd: true,
        listens: {
          where: { userId: targetUserId },
          select: { id: true },
          take: 1,
        },
      },
    })

    const audios = rows.map(({ listens, ...a }) => ({
      ...a,
      listened: listens.length > 0,
    }))

    return NextResponse.json({ ok: true, data: { audios } })
  } catch (e) {
    console.error('[student/books/.../audios GET]', e)
    return NextResponse.json({ ok: false, message: 'Erro ao listar áudios' }, { status: 500 })
  }
}
