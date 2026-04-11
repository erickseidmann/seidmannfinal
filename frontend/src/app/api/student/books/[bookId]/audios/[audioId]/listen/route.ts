/**
 * POST /api/student/books/[bookId]/audios/[audioId]/listen
 * Marca o áudio como ouvido até o fim (idempotente).
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

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ bookId: string; audioId: string }> }
) {
  try {
    const auth = await requireStudent(request)
    if (!auth.authorized || !auth.session) {
      return NextResponse.json(
        { ok: false, message: auth.message || 'Não autorizado' },
        { status: auth.session ? 403 : 401 }
      )
    }

    const { bookId, audioId } = await params
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

    const audio = await prisma.bookAudio.findFirst({
      where: { id: audioId, bookId: release.book.id },
      select: { id: true },
    })
    if (!audio) {
      return NextResponse.json({ ok: false, message: 'Áudio não encontrado' }, { status: 404 })
    }

    await prisma.bookAudioListen.upsert({
      where: {
        userId_bookAudioId: { userId: targetUserId, bookAudioId: audioId },
      },
      create: {
        userId: targetUserId,
        bookAudioId: audioId,
      },
      update: {},
    })

    return NextResponse.json({ ok: true, data: { audioId } })
  } catch (e) {
    console.error('[student/books/.../audios/.../listen POST]', e)
    return NextResponse.json({ ok: false, message: 'Erro ao registrar' }, { status: 500 })
  }
}
