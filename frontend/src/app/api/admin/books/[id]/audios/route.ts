/**
 * GET  /api/admin/books/[id]/audios — lista áudios do livro
 * POST /api/admin/books/[id]/audios — FormData: chapterTitle, pageStart, pageEnd, sortOrder?, audio (arquivo)
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/auth'
import { mkdir, writeFile } from 'fs/promises'
import path from 'path'
import { randomUUID } from 'crypto'

const AUDIO_EXT = ['.mp3', '.m4a', '.wav', '.ogg', '.webm'] as const
const MAX_AUDIO_BYTES = 45 * 1024 * 1024

function extMime(ext: string): string {
  switch (ext) {
    case '.mp3':
      return 'audio/mpeg'
    case '.m4a':
      return 'audio/mp4'
    case '.wav':
      return 'audio/wav'
    case '.ogg':
      return 'audio/ogg'
    case '.webm':
      return 'audio/webm'
    default:
      return 'application/octet-stream'
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAdmin(request)
    if (!auth.authorized) {
      return NextResponse.json(
        { ok: false, message: auth.message || 'Não autorizado' },
        { status: auth.message?.includes('Não autenticado') ? 401 : 403 }
      )
    }

    const { id: bookId } = await params
    const book = await prisma.book.findUnique({ where: { id: bookId }, select: { id: true } })
    if (!book) {
      return NextResponse.json({ ok: false, message: 'Livro não encontrado' }, { status: 404 })
    }

    const rows = await prisma.bookAudio.findMany({
      where: { bookId },
      orderBy: [{ sortOrder: 'asc' }, { pageStart: 'asc' }],
    })

    return NextResponse.json({
      ok: true,
      data: {
        audios: rows.map((a) => ({
          id: a.id,
          chapterTitle: a.chapterTitle,
          pageStart: a.pageStart,
          pageEnd: a.pageEnd,
          sortOrder: a.sortOrder,
        })),
      },
    })
  } catch (e) {
    console.error('[admin/books/.../audios GET]', e)
    return NextResponse.json({ ok: false, message: 'Erro ao listar áudios' }, { status: 500 })
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAdmin(request)
    if (!auth.authorized) {
      return NextResponse.json(
        { ok: false, message: auth.message || 'Não autorizado' },
        { status: auth.message?.includes('Não autenticado') ? 401 : 403 }
      )
    }

    const { id: bookId } = await params
    const book = await prisma.book.findUnique({
      where: { id: bookId },
      select: { id: true, totalPaginas: true },
    })
    if (!book) {
      return NextResponse.json({ ok: false, message: 'Livro não encontrado' }, { status: 404 })
    }

    const formData = await request.formData().catch(() => null)
    if (!formData) {
      return NextResponse.json({ ok: false, message: 'Use FormData' }, { status: 400 })
    }

    const chapterTitle = String(formData.get('chapterTitle') || '').trim()
    const pageStart = parseInt(String(formData.get('pageStart') || ''), 10)
    const pageEnd = parseInt(String(formData.get('pageEnd') || ''), 10)
    const sortOrderRaw = formData.get('sortOrder')
    const sortOrder =
      sortOrderRaw != null && String(sortOrderRaw).trim() !== ''
        ? parseInt(String(sortOrderRaw), 10)
        : 0
    const file = formData.get('audio') as File | null

    if (!chapterTitle || chapterTitle.length > 255) {
      return NextResponse.json(
        { ok: false, message: 'Título do capítulo é obrigatório (máx. 255 caracteres).' },
        { status: 400 }
      )
    }
    if (!Number.isFinite(pageStart) || !Number.isFinite(pageEnd) || pageStart < 1 || pageEnd < pageStart) {
      return NextResponse.json(
        { ok: false, message: 'Páginas inválidas: informe início e fim (fim ≥ início, mínimo página 1).' },
        { status: 400 }
      )
    }
    if (pageEnd > book.totalPaginas) {
      return NextResponse.json(
        {
          ok: false,
          message: `A página final não pode ultrapassar o total do livro (${book.totalPaginas} páginas).`,
        },
        { status: 400 }
      )
    }
    if (!file || !(file instanceof Blob) || file.size === 0) {
      return NextResponse.json({ ok: false, message: 'Arquivo de áudio é obrigatório.' }, { status: 400 })
    }
    if (file.size > MAX_AUDIO_BYTES) {
      return NextResponse.json(
        { ok: false, message: 'Arquivo muito grande (máximo 45 MB).' },
        { status: 400 }
      )
    }

    const ext = path.extname(file.name).toLowerCase()
    if (!AUDIO_EXT.includes(ext as (typeof AUDIO_EXT)[number])) {
      return NextResponse.json(
        { ok: false, message: `Formato não suportado. Use: ${AUDIO_EXT.join(', ')}` },
        { status: 400 }
      )
    }

    const audioId = randomUUID()
    const audioDir = path.join(process.cwd(), 'public', 'uploads', 'books', bookId, 'audio')
    await mkdir(audioDir, { recursive: true })
    const filename = `${audioId}${ext}`
    const fullPath = path.join(audioDir, filename)
    const buffer = Buffer.from(await file.arrayBuffer())
    await writeFile(fullPath, buffer)

    const relativePath = `/uploads/books/${bookId}/audio/${filename}`

    const created = await prisma.bookAudio.create({
      data: {
        id: audioId,
        bookId,
        chapterTitle,
        pageStart,
        pageEnd,
        audioPath: relativePath,
        sortOrder: Number.isFinite(sortOrder) ? sortOrder : 0,
      },
    })

    return NextResponse.json({
      ok: true,
      data: {
        audio: {
          id: created.id,
          chapterTitle: created.chapterTitle,
          pageStart: created.pageStart,
          pageEnd: created.pageEnd,
          sortOrder: created.sortOrder,
        },
        mimeHint: extMime(ext),
      },
      message: 'Áudio adicionado.',
    })
  } catch (e) {
    console.error('[admin/books/.../audios POST]', e)
    return NextResponse.json({ ok: false, message: 'Erro ao enviar áudio' }, { status: 500 })
  }
}
