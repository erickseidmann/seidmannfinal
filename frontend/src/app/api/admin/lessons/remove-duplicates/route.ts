/**
 * POST /api/admin/lessons/remove-duplicates
 * Remove duplicidades: aulas com mesmo enrollmentId e mesmo startAt (mesmo dia/hora).
 * Mantém uma aula por grupo e EXCLUI as demais (delete no banco).
 * Útil quando "repetir frequência" foi aplicado mais de uma vez por engano.
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/auth'

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAdmin(request)
    if (!auth.authorized) {
      return NextResponse.json(
        { ok: false, message: auth.message || 'Não autorizado' },
        { status: auth.message?.includes('Não autenticado') ? 401 : 403 }
      )
    }

    const lessons = await prisma.lesson.findMany({
      where: { status: { not: 'CANCELLED' } },
      select: { id: true, enrollmentId: true, startAt: true },
      orderBy: { id: 'asc' },
    })

    // Agrupar por (enrollmentId, startAt ISO string)
    const key = (l: { enrollmentId: string; startAt: Date }) =>
      `${l.enrollmentId}|${new Date(l.startAt).toISOString()}`
    const byKey = new Map<string, { id: string }[]>()
    for (const l of lessons) {
      const k = key(l)
      if (!byKey.has(k)) byKey.set(k, [])
      byKey.get(k)!.push({ id: l.id })
    }

    const toDelete: string[] = []
    for (const [, ids] of byKey) {
      if (ids.length > 1) {
        // Manter o primeiro (id menor), excluir o resto
        ids.slice(1).forEach((x) => toDelete.push(x.id))
      }
    }

    if (toDelete.length === 0) {
      return NextResponse.json({
        ok: true,
        deletedCount: 0,
        message: 'Nenhuma duplicidade encontrada.',
      })
    }

    await prisma.lesson.deleteMany({
      where: { id: { in: toDelete } },
    })

    return NextResponse.json({
      ok: true,
      deletedCount: toDelete.length,
      message: `${toDelete.length} aula(s) duplicada(s) excluída(s).`,
    })
  } catch (error) {
    console.error('[api/admin/lessons/remove-duplicates POST]', error)
    return NextResponse.json(
      { ok: false, message: 'Erro ao remover duplicidades.' },
      { status: 500 }
    )
  }
}
