/**
 * GET /api/admin/lesson-past-edit-requests?status=PENDING
 * POST /api/admin/lesson-past-edit-requests — solicitar alteração em aula de dia anterior
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdmin, isSuperAdminEmail } from '@/lib/auth'
import {
  canAdminApprovePastLessonEdit,
  canAdminDirectEditPastLesson,
  isLessonOnPastCalendarDay,
  LESSON_PAST_EDIT_NEEDS_APPROVAL_MESSAGE,
} from '@/lib/lesson-past-edit'
import type { LessonPastEditPayload } from '@/lib/lesson-past-edit-apply'

async function getAdminPermissions(userId: string, email: string | undefined) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { canApproveLateLessonEdits: true },
  })
  const canApprove = canAdminApprovePastLessonEdit(
    email,
    user?.canApproveLateLessonEdits ?? false
  )
  const canDirect = canAdminDirectEditPastLesson(email, user?.canApproveLateLessonEdits ?? false)
  return { canApprove, canDirect, isSuperAdmin: isSuperAdminEmail(email) }
}

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAdmin(request)
    if (!auth.authorized || !auth.session) {
      return NextResponse.json(
        { ok: false, message: auth.message || 'Não autorizado' },
        { status: auth.message?.includes('Não autenticado') ? 401 : 403 }
      )
    }

    const { searchParams } = new URL(request.url)
    const statusFilter = searchParams.get('status') || 'PENDING'
    const lessonIdsOnly = searchParams.get('lessonIdsOnly') === '1'

    const perms = await getAdminPermissions(auth.session.sub, auth.session.email)

    if (lessonIdsOnly) {
      const pending = await prisma.lessonPastEditRequest.findMany({
        where: { status: 'PENDING' },
        select: { lessonId: true },
      })
      return NextResponse.json({
        ok: true,
        data: { lessonIds: pending.map((p) => p.lessonId) },
      })
    }

    const where =
      statusFilter === 'ALL'
        ? {}
        : { status: statusFilter as 'PENDING' | 'RELEASED' | 'APPROVED' | 'REJECTED' }

    const requests = await prisma.lessonPastEditRequest.findMany({
      where,
      orderBy: { criadoEm: 'desc' },
      take: 100,
      include: {
        lesson: {
          select: {
            id: true,
            startAt: true,
            status: true,
            durationMinutes: true,
            enrollment: { select: { nome: true } },
            teacher: { select: { nome: true } },
          },
        },
        requestedBy: { select: { id: true, nome: true, email: true } },
        processedBy: { select: { id: true, nome: true } },
      },
    })

    return NextResponse.json({
      ok: true,
      data: {
        canApprove: perms.canApprove,
        requests: requests.map((r) => ({
          id: r.id,
          lessonId: r.lessonId,
          status: r.status,
          payload: r.payload,
          criadoEm: r.criadoEm.toISOString(),
          processedAt: r.processedAt?.toISOString() ?? null,
          rejectionNote: r.rejectionNote,
          requestedByName: r.requestedBy.nome,
          requestedByEmail: r.requestedBy.email,
          processedByName: r.processedBy?.nome ?? null,
          lessonStartAt: r.lesson.startAt.toISOString(),
          lessonStatus: r.lesson.status,
          studentName: r.lesson.enrollment.nome,
          teacherName: r.lesson.teacher?.nome ?? '—',
        })),
      },
    })
  } catch (e) {
    console.error('[lesson-past-edit-requests GET]', e)
    return NextResponse.json({ ok: false, message: 'Erro ao listar solicitações' }, { status: 500 })
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

    const perms = await getAdminPermissions(auth.session.sub, auth.session.email)

    let body: unknown
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ ok: false, message: 'JSON inválido' }, { status: 400 })
    }

    const obj = typeof body === 'object' && body !== null ? (body as Record<string, unknown>) : {}
    const lessonId = typeof obj.lessonId === 'string' ? obj.lessonId.trim() : ''
    const payload = obj.payload as LessonPastEditPayload | undefined

    if (!lessonId || !payload || typeof payload !== 'object') {
      return NextResponse.json(
        { ok: false, message: 'lessonId e payload são obrigatórios' },
        { status: 400 }
      )
    }

    const lesson = await prisma.lesson.findUnique({
      where: { id: lessonId },
      select: { id: true, startAt: true },
    })
    if (!lesson) {
      return NextResponse.json({ ok: false, message: 'Aula não encontrada' }, { status: 404 })
    }

    if (!isLessonOnPastCalendarDay(lesson.startAt)) {
      return NextResponse.json(
        { ok: false, message: 'Solicitação só se aplica a aulas de dias anteriores' },
        { status: 400 }
      )
    }

    if (perms.canDirect) {
      return NextResponse.json(
        {
          ok: false,
          message: 'Você pode alterar esta aula diretamente, sem solicitação.',
          code: 'DIRECT_EDIT_ALLOWED',
        },
        { status: 400 }
      )
    }

    const existingPending = await prisma.lessonPastEditRequest.findFirst({
      where: { lessonId, status: 'PENDING' },
    })
    if (existingPending) {
      return NextResponse.json(
        { ok: false, message: 'Já existe uma solicitação pendente para esta aula.' },
        { status: 409 }
      )
    }

    const created = await prisma.lessonPastEditRequest.create({
      data: {
        lessonId,
        requestedByUserId: auth.session.sub,
        status: 'PENDING',
        payload: payload as object,
      },
    })

    return NextResponse.json({
      ok: true,
      data: {
        request: { id: created.id, lessonId: created.lessonId, status: created.status },
        message: LESSON_PAST_EDIT_NEEDS_APPROVAL_MESSAGE,
      },
    })
  } catch (e) {
    console.error('[lesson-past-edit-requests POST]', e)
    return NextResponse.json({ ok: false, message: 'Erro ao criar solicitação' }, { status: 500 })
  }
}
