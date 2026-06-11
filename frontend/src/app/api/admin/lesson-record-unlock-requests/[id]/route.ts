/**
 * PATCH /api/admin/lesson-record-unlock-requests/[id]
 * Aprova ou nega solicitação de liberação.
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/auth'

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAdmin(request)
    if (!auth.authorized || !auth.session) {
      return NextResponse.json(
        { ok: false, message: auth.message || 'Não autorizado' },
        { status: auth.message?.includes('Não autenticado') ? 401 : 403 }
      )
    }

    const { id } = await params
    const body = await request.json()
    const action = body.action === 'APPROVE' ? 'APPROVE' : body.action === 'DENY' ? 'DENY' : null
    const adminNotes = typeof body.adminNotes === 'string' ? body.adminNotes.trim() : null

    if (!action) {
      return NextResponse.json(
        { ok: false, message: 'Ação inválida. Use APPROVE ou DENY.' },
        { status: 400 }
      )
    }

    const existing = await prisma.lessonRecordUnlockRequest.findUnique({
      where: { id },
      include: {
        lesson: { include: { record: { select: { id: true } } } },
      },
    })

    if (!existing) {
      return NextResponse.json({ ok: false, message: 'Solicitação não encontrada' }, { status: 404 })
    }

    if (existing.status !== 'PENDING') {
      return NextResponse.json(
        { ok: false, message: 'Esta solicitação já foi processada.' },
        { status: 400 }
      )
    }

    if (action === 'APPROVE' && existing.lesson.record) {
      return NextResponse.json(
        { ok: false, message: 'Esta aula já possui registro. Não é necessário liberar.' },
        { status: 400 }
      )
    }

    const updated = await prisma.lessonRecordUnlockRequest.update({
      where: { id },
      data: {
        status: action === 'APPROVE' ? 'APPROVED' : 'DENIED',
        adminNotes: adminNotes || null,
        processedById: auth.session.sub,
        processedAt: new Date(),
      },
      include: {
        teacher: { select: { id: true, nome: true } },
        processedBy: { select: { id: true, nome: true } },
        lesson: {
          select: {
            id: true,
            startAt: true,
            enrollment: { select: { nome: true } },
          },
        },
      },
    })

    return NextResponse.json({
      ok: true,
      message: action === 'APPROVE' ? 'Liberação concedida.' : 'Solicitação negada.',
      data: {
        request: {
          id: updated.id,
          status: updated.status,
          adminNotes: updated.adminNotes,
          processedAt: updated.processedAt?.toISOString() ?? null,
          teacher: updated.teacher,
          processedBy: updated.processedBy,
          lesson: {
            ...updated.lesson,
            startAt: updated.lesson.startAt.toISOString(),
          },
        },
      },
    })
  } catch (error) {
    console.error('[api/admin/lesson-record-unlock-requests/[id] PATCH]', error)
    return NextResponse.json(
      { ok: false, message: 'Erro ao processar solicitação' },
      { status: 500 }
    )
  }
}
