/**
 * GET /api/admin/lesson-attendance
 * Lista presença agrupada por aula (resumo + sessões para detalhes).
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/auth'
import { closeStaleAndExpiredLessonAttendances } from '@/lib/lesson-attendance-service'
import { summarizeLessonsWithAttendance } from '@/lib/lesson-attendance-summary'
import {
  brazilDayStartUtc,
  filterSummariesWithinRetention,
  lessonAttendanceVisibleSinceDateKey,
  LESSON_ATTENDANCE_RETENTION_DAYS,
} from '@/lib/lesson-attendance-retention'

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAdmin(request)
    if (!auth.authorized) {
      return NextResponse.json(
        { ok: false, message: auth.message || 'Não autorizado' },
        { status: auth.message?.includes('Não autenticado') ? 401 : 403 }
      )
    }

    const { searchParams } = new URL(request.url)
    const startParam = searchParams.get('start')
    const endParam = searchParams.get('end')
    const limitParam = searchParams.get('limit')

    const end = endParam ? new Date(endParam) : new Date()
    const start = startParam
      ? new Date(startParam)
      : new Date(end.getTime() - 30 * 24 * 60 * 60 * 1000)
    const limit = Math.min(Math.max(parseInt(limitParam || '500', 10) || 500, 1), 1000)

    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      return NextResponse.json({ ok: false, message: 'Período inválido' }, { status: 400 })
    }

    await closeStaleAndExpiredLessonAttendances()

    const retentionStart = brazilDayStartUtc(lessonAttendanceVisibleSinceDateKey())
    const rangeStart = start > retentionStart ? start : retentionStart

    const lessonsRaw = await prisma.lesson.findMany({
      where: { startAt: { gte: rangeStart, lte: end } },
      orderBy: { startAt: 'desc' },
      take: limit,
      select: {
        id: true,
        startAt: true,
        durationMinutes: true,
        status: true,
        enrollment: { select: { nome: true } },
        teacher: { select: { nome: true } },
      },
    })

    const lessonIds = lessonsRaw.map((l) => l.id)
    const attendanceRows =
      lessonIds.length > 0
        ? await prisma.lessonAttendance.findMany({
            where: { lessonId: { in: lessonIds } },
            orderBy: { joinedAt: 'asc' },
            include: {
              teacher: { select: { nome: true } },
              enrollment: { select: { nome: true } },
            },
          })
        : []

    const lessons = lessonsRaw.map((l) => ({
      id: l.id,
      startAt: l.startAt,
      durationMinutes: l.durationMinutes ?? 60,
      status: l.status,
      studentName: l.enrollment?.nome ?? '—',
      teacherName: l.teacher?.nome ?? '—',
    }))

    const mappedRows = attendanceRows.map((r) => {
      const lessonMeta = lessons.find((l) => l.id === r.lessonId)
      const participantName =
        r.role === 'TEACHER'
          ? r.teacher?.nome ?? lessonMeta?.teacherName ?? '—'
          : r.enrollment?.nome ?? lessonMeta?.studentName ?? '—'
      return {
        id: r.id,
        lessonId: r.lessonId,
        role: r.role as 'TEACHER' | 'STUDENT',
        joinedAt: r.joinedAt,
        leftAt: r.leftAt,
        lastSeen: r.lastSeen,
        status: r.status,
        participantName,
      }
    })

    const summaries = filterSummariesWithinRetention(
      summarizeLessonsWithAttendance(lessons, mappedRows)
    )

    return NextResponse.json({
      ok: true,
      data: {
        summaries,
        period: { start: rangeStart.toISOString(), end: end.toISOString() },
        retentionDays: LESSON_ATTENDANCE_RETENTION_DAYS,
      },
    })
  } catch (error) {
    console.error('[api/admin/lesson-attendance GET]', error)
    return NextResponse.json(
      { ok: false, message: 'Erro ao listar presença nas aulas' },
      { status: 500 }
    )
  }
}
