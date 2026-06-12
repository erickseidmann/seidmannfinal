/**
 * GET /api/student/lessons/[id]
 * Detalhes de uma aula do aluno logado + validação de horário para sala de vídeo
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireStudent } from '@/lib/auth'
import { isLessonScheduledStatus } from '@/lib/lesson-status'
import { resolveStudentEnrollmentForLesson } from '@/lib/student-group-lesson-access'

const TOLERANCE_MINUTES = 15

function deterministicRoomPin(lessonId: string, lessonStart: Date): string {
  const str = `seidmann-${lessonId}-${lessonStart.toISOString()}`
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i)
    hash = (hash << 5) - hash + char
    hash |= 0
  }
  return String((Math.abs(hash) % 900000) + 100000)
}

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const auth = await requireStudent(request)
    if (!auth.authorized || !auth.session) {
      return NextResponse.json(
        { ok: false, message: auth.message || 'Não autorizado' },
        { status: auth.message?.includes('Não autenticado') ? 401 : 403 }
      )
    }

    const lessonId = params.id

    const enrollments = await prisma.enrollment.findMany({
      where: { userId: auth.session.userId },
      select: { id: true },
    })
    const enrollmentIds = enrollments.map((e) => e.id)

    const lesson = await prisma.lesson.findUnique({
      where: { id: lessonId },
      include: {
        enrollment: {
          select: {
            id: true,
            userId: true,
            nome: true,
            idioma: true,
            nivel: true,
            tipoAula: true,
            nomeGrupo: true,
            tempoAulaMinutos: true,
          },
        },
        teacher: { select: { id: true, nome: true, linkSala: true } },
        record: {
          select: {
            id: true,
            book: true,
            lastPage: true,
            assignedHomework: true,
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

    const studentEnrollmentId = await resolveStudentEnrollmentForLesson(
      enrollmentIds,
      lesson.enrollmentId
    )
    if (!studentEnrollmentId) {
      return NextResponse.json(
        { ok: false, message: 'Você não tem permissão para acessar esta aula' },
        { status: 403 }
      )
    }

    const now = new Date()
    const lessonStart = new Date(lesson.startAt)
    const durationMin = lesson.durationMinutes ?? 60
    const lessonEnd = new Date(lessonStart.getTime() + durationMin * 60 * 1000)
    const windowStart = new Date(lessonStart.getTime() - TOLERANCE_MINUTES * 60 * 1000)
    const windowEnd = new Date(lessonEnd.getTime() + TOLERANCE_MINUTES * 60 * 1000)

    const callEnded = lesson.professorCallEndedAt != null
    const canJoin =
      !callEnded &&
      now >= windowStart &&
      now <= windowEnd &&
      isLessonScheduledStatus(lesson.status)

    let reason: string | null = null
    if (!canJoin) {
      if (callEnded) {
        reason = 'O professor encerrou esta aula'
      } else if (!isLessonScheduledStatus(lesson.status)) {
        reason = 'Aula não está confirmada'
      } else if (now < windowStart) {
        reason = 'A sala abre 15 minutos antes do início da aula'
      } else if (now > windowEnd) {
        reason = 'O tempo de acesso à sala expirou'
      }
    }

    const roomName = canJoin ? `seidmann-${lessonId}` : null
    const roomPin = canJoin ? deterministicRoomPin(lessonId, lessonStart) : null

    const lastRecord = await prisma.lessonRecord.findFirst({
      where: {
        lesson: {
          enrollmentId: lesson.enrollmentId,
          startAt: { lt: lesson.startAt },
        },
      },
      orderBy: { criadoEm: 'desc' },
      select: { book: true, lastPage: true, assignedHomework: true },
    })

    const teacherAbsenceReports = await prisma.teacherAbsenceReport.findMany({
      where: { lessonId, enrollmentId: studentEnrollmentId },
      select: { reportType: true, status: true },
    })

    const reportWindowEnd = new Date(lessonStart.getTime() + 15 * 60 * 1000)
    const canReportTeacherAbsence =
      isLessonScheduledStatus(lesson.status) &&
      !!lesson.teacherId &&
      now >= lessonStart &&
      now <= reportWindowEnd

    return NextResponse.json({
      ok: true,
      data: {
        lesson: {
          id: lesson.id,
          status: lesson.status,
          startAt: lesson.startAt.toISOString(),
          durationMinutes: lesson.durationMinutes,
          notes: lesson.notes,
          enrollment: lesson.enrollment,
          teacher: lesson.teacher,
          record: lesson.record,
          lastRecord,
        },
        classroom: {
          canJoin,
          roomName,
          roomPin,
          windowStart: windowStart.toISOString(),
          windowEnd: windowEnd.toISOString(),
          reason,
        },
        teacherAbsence: {
          canReport: canReportTeacherAbsence,
          windowEnd: reportWindowEnd.toISOString(),
          reportedAbsent: teacherAbsenceReports.some((r) => r.reportType === 'ABSENT'),
          reportedLate: teacherAbsenceReports.some((r) => r.reportType === 'LATE'),
        },
      },
    })
  } catch (error) {
    console.error('[api/student/lessons/[id] GET]', error)
    return NextResponse.json(
      { ok: false, message: 'Erro ao buscar detalhes da aula' },
      { status: 500 }
    )
  }
}
