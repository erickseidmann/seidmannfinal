/**
 * POST /api/admin/lesson-record-unlock-requests/release
 * Libera registro de aula para o professor (falso positivo de ausência na chamada).
 * Não cria nem altera teacher_absence_report nem admin_dashboard_todo.
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/auth'

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAdmin(request)
    if (!auth.authorized || !auth.session) {
      return NextResponse.json(
        { ok: false, message: auth.message || 'Não autorizado' },
        { status: auth.message?.includes('Não autenticado') ? 401 : 403 }
      )
    }

    let body: unknown
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ ok: false, message: 'JSON inválido' }, { status: 400 })
    }

    const lessonId =
      typeof body === 'object' && body !== null && typeof (body as { lessonId?: unknown }).lessonId === 'string'
        ? (body as { lessonId: string }).lessonId.trim()
        : ''

    if (!lessonId) {
      return NextResponse.json({ ok: false, message: 'lessonId é obrigatório' }, { status: 400 })
    }

    const lesson = await prisma.lesson.findUnique({
      where: { id: lessonId },
      select: {
        id: true,
        teacherId: true,
        record: { select: { id: true } },
      },
    })

    if (!lesson) {
      return NextResponse.json({ ok: false, message: 'Aula não encontrada' }, { status: 404 })
    }

    if (!lesson.teacherId) {
      return NextResponse.json(
        { ok: false, message: 'Aula sem professor vinculado' },
        { status: 400 }
      )
    }

    if (lesson.record) {
      return NextResponse.json(
        { ok: false, message: 'Esta aula já possui registro' },
        { status: 400 }
      )
    }

    const adminUserId = auth.session.sub
    const now = new Date()
    const adminNotes =
      'Registro liberado pelo admin via Acompanhar Chamadas — alerta de ausência incorreto.'
    const message = 'Liberação via alerta de professor ausente (falso positivo).'

    await prisma.$transaction(async (tx) => {
      const existingUnlock = await tx.lessonRecordUnlockRequest.findFirst({
        where: { lessonId: lesson.id, teacherId: lesson.teacherId },
        orderBy: { criadoEm: 'desc' },
      })

      if (existingUnlock) {
        await tx.lessonRecordUnlockRequest.update({
          where: { id: existingUnlock.id },
          data: {
            status: 'APPROVED',
            adminNotes,
            processedById: adminUserId,
            processedAt: now,
          },
        })
      } else {
        await tx.lessonRecordUnlockRequest.create({
          data: {
            lessonId: lesson.id,
            teacherId: lesson.teacherId,
            status: 'APPROVED',
            message,
            adminNotes,
            processedById: adminUserId,
            processedAt: now,
          },
        })
      }
    })

    return NextResponse.json({
      ok: true,
      data: { lessonId: lesson.id },
      message: 'Registro liberado com sucesso.',
    })
  } catch (error) {
    console.error('[api/admin/lesson-record-unlock-requests/release POST]', error)
    return NextResponse.json(
      { ok: false, message: 'Erro ao liberar registro' },
      { status: 500 }
    )
  }
}
