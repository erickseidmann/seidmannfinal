/**
 * GET /api/professor/lessons/[id]
 * Detalhes de uma aula do professor logado + validação de horário para sala de vídeo
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireTeacher } from '@/lib/auth'
import { LESSON_STATUSES_SCHEDULED } from '@/lib/lesson-status'
import { LessonAttendanceStatus } from '@prisma/client'
import { buildVirtualClassroomAccess } from '@/lib/virtual-classroom-access'

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
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
      return NextResponse.json(
        { ok: false, message: 'Professor não encontrado' },
        { status: 404 }
      )
    }

    const lessonId = params.id

    const lesson = await prisma.lesson.findUnique({
      where: { id: lessonId },
      include: {
        enrollment: {
          select: {
            id: true,
            nome: true,
            idioma: true,
            nivel: true,
            tipoAula: true,
            nomeGrupo: true,
            tempoAulaMinutos: true,
            curso: true,
          },
        },
        teacher: { select: { id: true, nome: true, linkSala: true } },
        record: {
          select: {
            id: true,
            book: true,
            lastPage: true,
            assignedHomework: true,
            homeworkDone: true,
            notes: true,
            notesForStudent: true,
          },
        },
      },
    })

    if (!lesson) {
      return NextResponse.json(
        { ok: false, message: 'Aula não encontrada' },
        { status: 404 }
      )
    }

    if (lesson.teacherId !== teacher.id) {
      return NextResponse.json(
        { ok: false, message: 'Você não tem permissão para acessar esta aula' },
        { status: 403 }
      )
    }

    const classroomAccess = buildVirtualClassroomAccess({
      id: lesson.id,
      status: lesson.status,
      startAt: lesson.startAt,
      durationMinutes: lesson.durationMinutes,
      professorCallEndedAt: lesson.professorCallEndedAt,
    })
    const { canJoin, roomName, roomPin, windowStart, windowEnd, reason } = classroomAccess

    const activeAttendance = await prisma.lessonAttendance.findFirst({
      where: {
        lessonId,
        teacherId: teacher.id,
        status: LessonAttendanceStatus.ACTIVE,
      },
      select: { id: true },
    })

    const lastRecord = await prisma.lessonRecord.findFirst({
      where: {
        lesson: {
          enrollmentId: lesson.enrollmentId,
          startAt: { lt: lesson.startAt },
        },
      },
      orderBy: { criadoEm: 'desc' },
      select: { book: true, lastPage: true, assignedHomework: true, homeworkDone: true },
    })

    // Para aula em grupo, buscar nomes dos integrantes
    let groupMemberNames: string[] | undefined
    const enr = lesson.enrollment
    if (enr?.tipoAula === 'GRUPO' && enr?.nomeGrupo?.trim()) {
      const enrollmentsInGroup = await prisma.enrollment.findMany({
        where: {
          tipoAula: 'GRUPO',
          nomeGrupo: enr.nomeGrupo.trim(),
        },
        select: { nome: true },
      })
      groupMemberNames = enrollmentsInGroup.map((e) => e.nome)
    }

    const enrollmentResponse = {
      ...enr,
      ...(groupMemberNames !== undefined && { groupMemberNames }),
    }

    const nextLessonRow = await prisma.lesson.findFirst({
      where: {
        teacherId: teacher.id,
        startAt: { gt: lesson.startAt },
        status: { in: [...LESSON_STATUSES_SCHEDULED] },
        professorCallEndedAt: null,
      },
      orderBy: { startAt: 'asc' },
      select: { id: true, startAt: true },
    })

    const nextLesson = nextLessonRow
      ? { id: nextLessonRow.id, startAt: nextLessonRow.startAt.toISOString() }
      : null

    return NextResponse.json({
      ok: true,
      data: {
        lesson: {
          id: lesson.id,
          status: lesson.status,
          startAt: lesson.startAt.toISOString(),
          durationMinutes: lesson.durationMinutes,
          notes: lesson.notes,
          enrollment: enrollmentResponse,
          teacher: lesson.teacher,
          record: lesson.record,
          lastRecord,
        },
        classroom: {
          canJoin,
          roomName,
          roomPin,
          windowStart,
          windowEnd,
          reason,
          callEndedByProfessor: lesson.professorCallEndedAt != null,
        },
        activeAttendance: activeAttendance ? { id: activeAttendance.id } : null,
        nextLesson,
      },
    })
  } catch (error) {
    console.error('[api/professor/lessons/[id] GET]', error)
    return NextResponse.json(
      { ok: false, message: 'Erro ao buscar detalhes da aula' },
      { status: 500 }
    )
  }
}
