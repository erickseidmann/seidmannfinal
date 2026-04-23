/**
 * GET /api/karaoke/songs — músicas ativas (aluno autenticado)
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireStudent } from '@/lib/auth'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const auth = await requireStudent(request)
    if (!auth.authorized || !auth.session) {
      return NextResponse.json(
        { ok: false, message: auth.message || 'Não autorizado' },
        { status: auth.message?.includes('Não autenticado') ? 401 : 403 }
      )
    }

    const songs = await prisma.karaokeSong.findMany({
      where: { active: true },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        title: true,
        artist: true,
        youtubeId: true,
        level: true,
        difficulty: true,
        emoji: true,
        lyrics: true,
        startOffsetSec: true,
      },
    })
    return NextResponse.json({ ok: true, data: songs })
  } catch (error) {
    console.error('[api/karaoke/songs GET]', error)
    return NextResponse.json({ ok: false, message: 'Erro ao listar músicas' }, { status: 500 })
  }
}
