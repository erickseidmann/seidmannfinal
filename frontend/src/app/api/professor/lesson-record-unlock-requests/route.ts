/**
 * POST /api/professor/lesson-record-unlock-requests
 * Professor solicita liberação para registrar aula após o prazo.
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireTeacher } from '@/lib/auth'
import { canRegisterLesson } from '@/lib/lesson-status'
import {
  isLessonStartNotYetRegisterable,
  isTeacherLessonRecordDeadlineExpired,
} from '@/lib/teacher-lesson-record-deadline'

export async function POST(request: NextRequest) {
  try {
    const auth = await requireTeacher(request)
    if (!auth.authorized || !auth.session) {
      return NextResponse.json(
        { ok: false, message: auth.message || 'Não autorizado' },
        { status: auth.message?.includes('Não autenticado') ? 401 : 403 }
      )
    }

    const teacher = await prisma.teacher.findFirst({
      where: { userId: auth.session.userId },
      select: { id: true },
    })
    if (!teacher) {
      return NextResponse.json({ ok: false, message: 'Professor não encontrado' }, { status: 404 })
    }

    const body = await request.json()
    const lessonId = typeof body.lessonId === 'string' ? body.lessonId.trim() : ''
    const message = typeof body.message === 'string' ? body.message.trim() : null

    if (!lessonId) {
      return NextResponse.json({ ok: false, message: 'lessonId é obrigatório' }, { status: 400 })
    }

    const lesson = await prisma.lesson.findUnique({
      where: { id: lessonId },
      include: {
        record: { select: { id: true } },
        recordUnlockRequests: {
          orderBy: { criadoEm: 'desc' },
          take: 1,
        },
      },
    })

    if (!lesson || lesson.teacherId !== teacher.id) {
      return NextResponse.json({ ok: false, message: 'Aula não encontrada' }, { status: 404 })
    }

    if (!canRegisterLesson(lesson.status)) {
      return NextResponse.json(
        { ok: false, message: 'Aulas canceladas não podem ser registradas.' },
        { status: 400 }
      )
    }

    if (lesson.record) {
      return NextResponse.json({ ok: false, message: 'Esta aula já possui registro.' }, { status: 400 })
    }

    if (isLessonStartNotYetRegisterable(lesson.startAt)) {
      return NextResponse.json(
        { ok: false, message: 'Não é possível solicitar liberação para aulas futuras.' },
        { status: 400 }
      )
    }

    if (!isTeacherLessonRecordDeadlineExpired(lesson.startAt)) {
      return NextResponse.json(
        { ok: false, message: 'O prazo desta aula ainda não expirou. Registre normalmente.' },
        { status: 400 }
      )
    }

    const latest = lesson.recordUnlockRequests[0]
    if (latest?.status === 'PENDING') {
      return NextResponse.json(
        { ok: false, message: 'Já existe uma solicitação aguardando análise da administração.' },
        { status: 400 }
      )
    }
    if (latest?.status === 'APPROVED') {
      return NextResponse.json(
        { ok: false, message: 'Esta aula já foi liberada. Você pode registrar agora.' },
        { status: 400 }
      )
    }

    const created = await prisma.lessonRecordUnlockRequest.create({
      data: {
        lessonId: lesson.id,
        teacherId: teacher.id,
        message: message || null,
        status: 'PENDING',
      },
    })

    return NextResponse.json({
      ok: true,
      data: {
        request: {
          id: created.id,
          lessonId: created.lessonId,
          status: created.status,
          criadoEm: created.criadoEm.toISOString(),
        },
      },
      message: 'Solicitação enviada à administração.',
    })
  } catch (error) {
    console.error('[api/professor/lesson-record-unlock-requests POST]', error)
    return NextResponse.json(
      { ok: false, message: 'Erro ao solicitar liberação' },
      { status: 500 }
    )
  }
}
