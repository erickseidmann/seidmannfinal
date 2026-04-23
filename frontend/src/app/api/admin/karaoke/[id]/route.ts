/**
 * GET /api/admin/karaoke/[id]
 * PUT /api/admin/karaoke/[id]
 * DELETE /api/admin/karaoke/[id]
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/auth'
import { parseYoutubeVideoId } from '@/lib/youtube-id'
import { parseStartOffsetSecField } from '@/lib/karaoke-timing'

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const auth = await requireAdmin(request)
    if (!auth.authorized || !auth.session) {
      return NextResponse.json(
        { ok: false, message: auth.message || 'Não autorizado' },
        { status: auth.message?.includes('Não autenticado') ? 401 : 403 }
      )
    }

    const song = await prisma.karaokeSong.findUnique({ where: { id: params.id } })
    if (!song) {
      return NextResponse.json({ ok: false, message: 'Não encontrada' }, { status: 404 })
    }
    return NextResponse.json({ ok: true, data: song })
  } catch (error) {
    console.error('[api/admin/karaoke/[id] GET]', error)
    return NextResponse.json({ ok: false, message: 'Erro ao carregar música' }, { status: 500 })
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const auth = await requireAdmin(request)
    if (!auth.authorized || !auth.session) {
      return NextResponse.json(
        { ok: false, message: auth.message || 'Não autorizado' },
        { status: auth.message?.includes('Não autenticado') ? 401 : 403 }
      )
    }

    const body = await request.json()
    const { title, artist, youtubeId, level, difficulty, emoji, lyrics, active, startOffsetSec } = body

    const idParsed = parseYoutubeVideoId(String(youtubeId ?? ''))
    if (!title || !artist || !idParsed || !level || !difficulty || lyrics == null) {
      return NextResponse.json(
        {
          ok: false,
          message: !idParsed
            ? 'YouTube: informe o ID do vídeo (após v=) ou uma URL válida do YouTube'
            : 'Campos obrigatórios faltando',
        },
        { status: 400 }
      )
    }

    const song = await prisma.karaokeSong.update({
      where: { id: params.id },
      data: {
        title: String(title).trim(),
        artist: String(artist).trim(),
        youtubeId: idParsed,
        level: String(level).trim(),
        difficulty: String(difficulty).trim(),
        emoji: emoji != null && String(emoji).trim() !== '' ? String(emoji).trim() : null,
        lyrics: String(lyrics),
        startOffsetSec: parseStartOffsetSecField(startOffsetSec),
        active: active ?? true,
      },
    })
    return NextResponse.json({ ok: true, data: song })
  } catch (error: unknown) {
    const prismaError = error as { code?: string }
    if (prismaError?.code === 'P2025') {
      return NextResponse.json({ ok: false, message: 'Não encontrada' }, { status: 404 })
    }
    console.error('[api/admin/karaoke/[id] PUT]', error)
    return NextResponse.json({ ok: false, message: 'Erro ao atualizar música' }, { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const auth = await requireAdmin(request)
    if (!auth.authorized || !auth.session) {
      return NextResponse.json(
        { ok: false, message: auth.message || 'Não autorizado' },
        { status: auth.message?.includes('Não autenticado') ? 401 : 403 }
      )
    }

    await prisma.karaokeSong.delete({ where: { id: params.id } })
    return NextResponse.json({ ok: true })
  } catch (error: unknown) {
    const prismaError = error as { code?: string }
    if (prismaError?.code === 'P2025') {
      return NextResponse.json({ ok: false, message: 'Não encontrada' }, { status: 404 })
    }
    console.error('[api/admin/karaoke/[id] DELETE]', error)
    return NextResponse.json({ ok: false, message: 'Erro ao excluir música' }, { status: 500 })
  }
}
