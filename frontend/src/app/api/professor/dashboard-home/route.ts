/**
 * GET /api/professor/dashboard-home
 * Próximas aulas (com último livro/página por matrícula), notificações e avisos — início do painel.
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import {
  announcementWhereProfessorVisible,
  cutoffDateProfessorHomeFeed,
  cutoffDateProfessorReadAlertsStillVisible,
} from '@/lib/professor-home-feed'
import { findTeacherAlertsForProfessorWidgets } from '@/lib/prisma-teacher-alert-enrollment-column'
import { enrichNewStudentTeacherAlertRow } from '@/lib/teacher-new-student-alert'
import { PROFESSOR_SYSTEM_ALERT_TYPES } from '@/lib/teacher-alert-kinds'
import { requireTeacher } from '@/lib/auth'
import { isLessonScheduledStatus } from '@/lib/lesson-status'

function studentLabel(
  enr: { nome: string; tipoAula: string | null; nomeGrupo: string | null }
): string {
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
      select: { id: true },
    })
    if (!teacher) {
      return NextResponse.json({ ok: false, message: 'Professor não encontrado' }, { status: 404 })
    }

    const now = new Date()
    const horizon = new Date(now)
    horizon.setDate(horizon.getDate() + 14)
    const lookback = new Date(now)
    lookback.setHours(lookback.getHours() - 3)

    const lessons = await prisma.lesson.findMany({
      where: {
        teacherId: teacher.id,
        startAt: { gte: lookback, lte: horizon },
        status: { in: ['CONFIRMED', 'REPOSICAO'] },
      },
      include: {
        enrollment: {
          select: {
            id: true,
            nome: true,
            tipoAula: true,
            nomeGrupo: true,
            curso: true,
          },
        },
      },
      orderBy: { startAt: 'asc' },
      take: 20,
    })

    const enrollmentIds = [...new Set(lessons.map((l) => l.enrollmentId))]
    const lastProgress = new Map<string, { book: string | null; lastPage: string | null }>()

    if (enrollmentIds.length > 0) {
      const pastRecords = await prisma.lessonRecord.findMany({
        where: {
          lesson: {
            teacherId: teacher.id,
            enrollmentId: { in: enrollmentIds },
            startAt: { lt: now },
          },
        },
        select: {
          book: true,
          lastPage: true,
          lesson: { select: { enrollmentId: true, startAt: true } },
        },
        orderBy: { lesson: { startAt: 'desc' } },
      })
      for (const r of pastRecords) {
        const eid = r.lesson.enrollmentId
        if (!lastProgress.has(eid)) {
          lastProgress.set(eid, { book: r.book, lastPage: r.lastPage })
        }
      }
    }

    const upcomingLessons = lessons
      .filter((l) => l.startAt >= now)
      .map((l) => {
      const enr = l.enrollment
      const prog = lastProgress.get(l.enrollmentId)
      return {
        id: l.id,
        startAt: l.startAt.toISOString(),
        durationMinutes: l.durationMinutes,
        studentLabel: studentLabel(enr),
        enrollmentId: l.enrollmentId,
        book: prog?.book ?? null,
        lastPage: prog?.lastPage ?? null,
      }
    })

    const joinableRow = lessons.find((l) => {
      if (!isLessonScheduledStatus(l.status)) return false
      const lessonStart = l.startAt.getTime()
      const lessonEnd = lessonStart + (l.durationMinutes ?? 60) * 60 * 1000
      const ts = now.getTime()
      return ts >= lessonStart - 15 * 60 * 1000 && ts <= lessonEnd + 15 * 60 * 1000
    })
    const joinableLesson = joinableRow
      ? {
          id: joinableRow.id,
          startAt: joinableRow.startAt.toISOString(),
          durationMinutes: joinableRow.durationMinutes,
          studentLabel: studentLabel(joinableRow.enrollment),
        }
      : null

    let alerts: {
      id: string
      message: string
      type: string
      level: string | null
      readAt: string | null
      criadoEm: string
    }[] = []
    if (prisma.teacherAlert) {
      const feedCutoff = cutoffDateProfessorHomeFeed()
      const readStillVisibleSince = cutoffDateProfessorReadAlertsStillVisible()
      const rows = await findTeacherAlertsForProfessorWidgets(
        prisma,
        {
          teacherId: teacher.id,
          isActive: true,
          type: { in: [...PROFESSOR_SYSTEM_ALERT_TYPES] },
          criadoEm: { gte: feedCutoff },
          OR: [{ readAt: null }, { readAt: { gte: readStillVisibleSince } }],
        },
        12
      )
      const enriched = await Promise.all(
        rows.map((a) => enrichNewStudentTeacherAlertRow(prisma, teacher.id, a))
      )
      alerts = enriched.map((a) => ({
        id: a.id,
        message: a.message,
        type: a.type,
        level: a.level,
        readAt: a.readAt?.toISOString() ?? null,
        criadoEm: a.criadoEm.toISOString(),
      }))
    }

    let announcements: {
      id: string
      title: string
      message: string
      criadoEm: string
      sentAt: string | null
    }[] = []
    if (prisma.announcement) {
      const ann = await prisma.announcement.findMany({
        where: announcementWhereProfessorVisible(cutoffDateProfessorHomeFeed()),
        orderBy: { criadoEm: 'desc' },
        take: 10,
        select: { id: true, title: true, message: true, criadoEm: true, sentAt: true },
      })
      announcements = ann.map((a) => ({
        id: a.id,
        title: a.title,
        message: a.message,
        criadoEm: a.criadoEm.toISOString(),
        sentAt: a.sentAt?.toISOString() ?? null,
      }))
    }

    return NextResponse.json({
      ok: true,
      data: { upcomingLessons, joinableLesson, alerts, announcements },
    })
  } catch (error) {
    console.error('[api/professor/dashboard-home GET]', error)
    return NextResponse.json({ ok: false, message: 'Erro ao carregar painel' }, { status: 500 })
  }
}
