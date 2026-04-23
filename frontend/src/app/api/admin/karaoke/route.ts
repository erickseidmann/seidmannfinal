/**
 * GET /api/admin/karaoke — lista músicas
 * POST /api/admin/karaoke — cria música
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/auth'
import { parseYoutubeVideoId } from '@/lib/youtube-id'
import { parseStartOffsetSecField } from '@/lib/karaoke-timing'

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAdmin(request)
    if (!auth.authorized || !auth.session) {
      return NextResponse.json(
        { ok: false, message: auth.message || 'Não autorizado' },
        { status: auth.message?.includes('Não autenticado') ? 401 : 403 }
      )
    }

    const songs = await prisma.karaokeSong.findMany({
      orderBy: { createdAt: 'desc' },
    })
    return NextResponse.json({ ok: true, data: songs })
  } catch (error) {
    console.error('[api/admin/karaoke GET]', error)
    return NextResponse.json({ ok: false, message: 'Erro ao listar músicas' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
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
    if (!title || !artist || !idParsed || !level || !difficulty || !lyrics) {
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

    const song = await prisma.karaokeSong.create({
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
  } catch (error) {
    console.error('[api/admin/karaoke POST]', error)
    return NextResponse.json({ ok: false, message: 'Erro ao criar música' }, { status: 500 })
  }
}
