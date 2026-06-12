/**
 * GET /api/professor/classroom-lessons
 * Aulas do professor para a central de Sala de Aula + sessão ativa (se houver).
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireTeacher } from '@/lib/auth'
import { LESSON_STATUSES_SCHEDULED } from '@/lib/lesson-status'
import { LessonAttendanceStatus } from '@prisma/client'
import { buildVirtualClassroomAccess } from '@/lib/virtual-classroom-access'
import { startOfCalendarDayBrazilDateKey, addDaysToBrazilDateKey } from '@/lib/datetime'

function studentLabel(enr: {
  nome: string
  tipoAula: string | null
  nomeGrupo: string | null
}): string {
  if (enr.tipoAula === 'GRUPO' && enr.nomeGrupo?.trim()) return enr.nomeGrupo.trim()
  return enr.nome || '—'
}

export async function GET(request: NextRequest) {
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
      select: { id: true, linkSala: true },
    })
    if (!teacher) {
      return NextResponse.json({ ok: false, message: 'Professor não encontrado' }, { status: 404 })
    }

    const now = new Date()
    const { searchParams } = new URL(request.url)
    const dateParam = searchParams.get('date')?.trim()

    let startAtRange: { gte: Date; lt?: Date; lte?: Date }
    if (dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam)) {
      const dayStart = startOfCalendarDayBrazilDateKey(dateParam)
      const nextKey = addDaysToBrazilDateKey(dateParam, 1)
      const dayEndExclusive = startOfCalendarDayBrazilDateKey(nextKey)
      if (!dayStart || !dayEndExclusive) {
        return NextResponse.json({ ok: false, message: 'Data inválida' }, { status: 400 })
      }
      startAtRange = { gte: dayStart, lt: dayEndExclusive }
    } else {
      const lookback = new Date(now)
      lookback.setHours(lookback.getHours() - 12)
      const horizon = new Date(now)
      horizon.setDate(horizon.getDate() + 7)
      startAtRange = { gte: lookback, lte: horizon }
    }

    const lessons = await prisma.lesson.findMany({
      where: {
        teacherId: teacher.id,
        startAt: startAtRange,
        status: { in: [...LESSON_STATUSES_SCHEDULED] },
      },
      include: {
        enrollment: {
          select: {
            id: true,
            nome: true,
            tipoAula: true,
            nomeGrupo: true,
          },
        },
      },
      orderBy: { startAt: 'asc' },
    })

    const activeAttendance = await prisma.lessonAttendance.findFirst({
      where: {
        teacherId: teacher.id,
        status: LessonAttendanceStatus.ACTIVE,
      },
      select: {
        id: true,
        lessonId: true,
        lesson: {
          select: {
            startAt: true,
            enrollment: {
              select: { nome: true, tipoAula: true, nomeGrupo: true },
            },
          },
        },
      },
    })

    const activeSession = activeAttendance
      ? {
          attendanceId: activeAttendance.id,
          lessonId: activeAttendance.lessonId,
          startAt: activeAttendance.lesson.startAt.toISOString(),
          studentLabel: studentLabel(activeAttendance.lesson.enrollment),
        }
      : null

    const list = lessons.map((l) => {
      const classroom = buildVirtualClassroomAccess({
        id: l.id,
        status: l.status,
        startAt: l.startAt,
        durationMinutes: l.durationMinutes,
        professorCallEndedAt: l.professorCallEndedAt,
      })
      return {
        id: l.id,
        status: l.status,
        startAt: l.startAt.toISOString(),
        durationMinutes: l.durationMinutes ?? 60,
        studentLabel: studentLabel(l.enrollment),
        classroom: {
          ...classroom,
          callEndedByProfessor: l.professorCallEndedAt != null,
        },
      }
    })

    return NextResponse.json({
      ok: true,
      data: {
        lessons: list,
        activeSession,
        teacherLinkSala: teacher.linkSala,
      },
    })
  } catch (error) {
    console.error('[api/professor/classroom-lessons GET]', error)
    return NextResponse.json(
      { ok: false, message: 'Erro ao carregar salas de aula' },
      { status: 500 }
    )
  }
}
