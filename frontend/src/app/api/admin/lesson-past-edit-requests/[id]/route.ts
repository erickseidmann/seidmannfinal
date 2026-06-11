/**
 * PATCH /api/admin/lesson-past-edit-requests/[id]
 * { action: 'APPROVE' | 'REJECT', rejectionNote?: string }
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/auth'
import { canAdminApprovePastLessonEdit } from '@/lib/lesson-past-edit'
import {
  applyApprovedLessonPastEdit,
  type LessonPastEditPayload,
} from '@/lib/lesson-past-edit-apply'

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

    const adminUser = await prisma.user.findUnique({
      where: { id: auth.session.sub },
      select: { nome: true, canApproveLateLessonEdits: true },
    })
    if (
      !canAdminApprovePastLessonEdit(
        auth.session.email,
        adminUser?.canApproveLateLessonEdits ?? false
      )
    ) {
      return NextResponse.json(
        { ok: false, message: 'Você não está autorizado a aprovar alterações tardias de aulas.' },
        { status: 403 }
      )
    }

    const { id } = await params
    if (!id) {
      return NextResponse.json({ ok: false, message: 'ID inválido' }, { status: 400 })
    }

    let body: unknown
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ ok: false, message: 'JSON inválido' }, { status: 400 })
    }

    const action =
      typeof body === 'object' && body !== null ? (body as { action?: unknown }).action : undefined
    if (action !== 'APPROVE' && action !== 'REJECT') {
      return NextResponse.json(
        { ok: false, message: 'Ação inválida. Use APPROVE ou REJECT.' },
        { status: 400 }
      )
    }

    const existing = await prisma.lessonPastEditRequest.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json({ ok: false, message: 'Solicitação não encontrada' }, { status: 404 })
    }
    if (existing.status !== 'PENDING') {
      return NextResponse.json(
        { ok: false, message: 'Esta solicitação já foi processada' },
        { status: 400 }
      )
    }

    const processorName = adminUser?.nome ?? 'Admin'

    if (action === 'REJECT') {
      const rejectionNote =
        typeof body === 'object' &&
        body !== null &&
        typeof (body as { rejectionNote?: unknown }).rejectionNote === 'string'
          ? (body as { rejectionNote: string }).rejectionNote.trim().slice(0, 500)
          : null

      const updated = await prisma.lessonPastEditRequest.update({
        where: { id },
        data: {
          status: 'REJECTED',
          processedByUserId: auth.session.sub,
          processedAt: new Date(),
          rejectionNote: rejectionNote || 'Solicitação rejeitada',
        },
      })

      return NextResponse.json({
        ok: true,
        data: { request: { id: updated.id, status: updated.status } },
      })
    }

    const payload = existing.payload as LessonPastEditPayload
    const applyResult = await applyApprovedLessonPastEdit(
      existing.lessonId,
      payload,
      processorName
    )
    if (!applyResult.ok) {
      return NextResponse.json(
        { ok: false, message: applyResult.message },
        { status: applyResult.status }
      )
    }

    const updated = await prisma.lessonPastEditRequest.update({
      where: { id },
      data: {
        status: 'APPROVED',
        processedByUserId: auth.session.sub,
        processedAt: new Date(),
      },
    })

    return NextResponse.json({
      ok: true,
      data: {
        request: { id: updated.id, status: updated.status, lessonId: existing.lessonId },
        lesson: applyResult.lesson,
      },
    })
  } catch (e) {
    console.error('[lesson-past-edit-requests PATCH]', e)
    return NextResponse.json({ ok: false, message: 'Erro ao processar solicitação' }, { status: 500 })
  }
}
