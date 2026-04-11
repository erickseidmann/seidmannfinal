/**
 * GET /api/student/books/[bookId]/audios/[audioId]
 * Stream do arquivo de áudio (cookies de sessão do aluno).
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireStudent } from '@/lib/auth'
import { readFile } from 'fs/promises'
import path from 'path'

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

function mimeForPath(p: string): string {
  const ext = path.extname(p).toLowerCase()
  if (ext === '.mp3') return 'audio/mpeg'
  if (ext === '.m4a') return 'audio/mp4'
  if (ext === '.wav') return 'audio/wav'
  if (ext === '.ogg') return 'audio/ogg'
  if (ext === '.webm') return 'audio/webm'
  return 'application/octet-stream'
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ bookId: string; audioId: string }> }
) {
  try {
    const auth = await requireStudent(request)
    if (!auth.authorized || !auth.session) {
      return new NextResponse('Não autorizado', { status: auth.session ? 403 : 401 })
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
      return new NextResponse('Não encontrado', { status: 404 })
    }

    const audio = await prisma.bookAudio.findFirst({
      where: { id: audioId, bookId: release.book.id },
    })

    if (!audio?.audioPath.startsWith('/uploads/')) {
      return new NextResponse('Inválido', { status: 400 })
    }

    const fullPath = path.join(process.cwd(), 'public', audio.audioPath.replace(/^\//, ''))
    const buffer = await readFile(fullPath)

    return new NextResponse(buffer, {
      headers: {
        'Content-Type': mimeForPath(audio.audioPath),
        'Cache-Control': 'private, no-store',
        'Accept-Ranges': 'bytes',
      },
    })
  } catch (e) {
    console.error('[student/books/.../audios/... GET]', e)
    return new NextResponse('Erro ao carregar áudio', { status: 500 })
  }
}
