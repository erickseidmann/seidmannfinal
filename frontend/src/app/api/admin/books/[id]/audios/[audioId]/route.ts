/**
 * DELETE /api/admin/books/[id]/audios/[audioId]
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/auth'
import { unlink } from 'fs/promises'
import path from 'path'

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; audioId: string }> }
) {
  try {
    const auth = await requireAdmin(request)
    if (!auth.authorized) {
      return NextResponse.json(
        { ok: false, message: auth.message || 'Não autorizado' },
        { status: auth.message?.includes('Não autenticado') ? 401 : 403 }
      )
    }

    const { id: bookId, audioId } = await params

    const row = await prisma.bookAudio.findFirst({
      where: { id: audioId, bookId },
    })
    if (!row) {
      return NextResponse.json({ ok: false, message: 'Áudio não encontrado' }, { status: 404 })
    }

    await prisma.bookAudio.delete({ where: { id: audioId } })

    if (row.audioPath.startsWith('/uploads/')) {
      try {
        const full = path.join(process.cwd(), 'public', row.audioPath.replace(/^\//, ''))
        await unlink(full)
      } catch {
        /* arquivo já removido */
      }
    }

    return NextResponse.json({ ok: true, message: 'Áudio removido.' })
  } catch (e) {
    console.error('[admin/books/.../audios/... DELETE]', e)
    return NextResponse.json({ ok: false, message: 'Erro ao remover áudio' }, { status: 500 })
  }
}
