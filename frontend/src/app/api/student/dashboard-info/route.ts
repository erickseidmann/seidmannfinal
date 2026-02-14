/**
 * GET /api/student/dashboard-info
 * Retorna: notificações (alertas), próxima aula (dia e horário), última aula com info (e registro se houver).
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireStudent } from '@/lib/auth'

export async function GET(request: NextRequest) {
  try {
    const auth = await requireStudent(request)
    if (!auth.authorized || !auth.session) {
      return NextResponse.json(
        { ok: false, message: auth.message || 'Não autorizado' },
        { status: auth.session ? 403 : 401 }
      )
    }

    const enrollments = await prisma.enrollment.findMany({
      where: { userId: auth.session.userId },
      select: { id: true },
    })
    const enrollmentIds = enrollments.map((e) => e.id)
    const now = new Date()

    const alerts: { id: string; message: string; level: string | null; readAt: string | null; criadoEm: string }[] = []
    if (enrollmentIds.length > 0) {
      const cutoff = new Date()
      cutoff.setDate(cutoff.getDate() - 15)
      const twoDaysAgo = new Date()
      twoDaysAgo.setDate(twoDaysAgo.getDate() - 2)
      const alertRows = await prisma.studentAlert.findMany({
        where: {
          enrollmentId: { in: enrollmentIds },
          isActive: true,
          criadoEm: { gte: cutoff },
          OR: [
            { readAt: null },
            { readAt: { gte: twoDaysAgo } },
          ],
        },
        orderBy: { criadoEm: 'desc' },
        take: 20,
      })
      alertRows.forEach((a) => {
        alerts.push({
          id: a.id,
          message: a.message,
          level: a.level,
          readAt: a.readAt?.toISOString() ?? null,
          criadoEm: a.criadoEm.toISOString(),
        })
      })
    }

    let nextLesson: { startAt: string; teacherName: string; durationMinutes: number } | null = null
    let lastLesson: {
      startAt: string
      teacherName: string
      durationMinutes: number
      status: string
      record?: { book: string | null; lastPage: string | null; notesForStudent: string | null }
    } | null = null

    // Buscar registros de aula do aluno
    const lessonRecords: Array<{
      id: string
      lessonId: string
      startAt: string
      teacherName: string
      assignedHomework: string | null
      lastPage: string | null
      notesForStudent: string | null
      book: string | null
      criadoEm: string
    }> = []

    if (enrollmentIds.length > 0) {
      const records = await prisma.lessonRecord.findMany({
        where: {
          lesson: {
            enrollmentId: { in: enrollmentIds },
          },
        },
        include: {
          lesson: {
            include: {
              teacher: { select: { nome: true } },
            },
          },
        },
        orderBy: { criadoEm: 'desc' },
        take: 20, // Limitar a 20 registros mais recentes
      })

      records.forEach((r) => {
        lessonRecords.push({
          id: r.id,
          lessonId: r.lessonId,
          startAt: r.lesson.startAt.toISOString(),
          teacherName: r.lesson.teacher.nome,
          assignedHomework: r.assignedHomework,
          lastPage: r.lastPage,
          notesForStudent: r.notesForStudent,
          book: r.book,
          criadoEm: r.criadoEm.toISOString(),
        })
      })
    }

    if (enrollmentIds.length > 0) {
      const [next, last] = await Promise.all([
        prisma.lesson.findFirst({
          where: {
            enrollmentId: { in: enrollmentIds },
            startAt: { gt: now },
            status: 'CONFIRMED',
          },
          orderBy: { startAt: 'asc' },
          include: { teacher: { select: { nome: true } } },
        }),
        prisma.lesson.findFirst({
          where: {
            enrollmentId: { in: enrollmentIds },
            startAt: { lte: now },
          },
          orderBy: { startAt: 'desc' },
          include: {
            teacher: { select: { nome: true } },
            record: { select: { book: true, lastPage: true, notesForStudent: true } },
          },
        }),
      ])

      if (next) {
        nextLesson = {
          startAt: next.startAt.toISOString(),
          teacherName: next.teacher.nome,
          durationMinutes: next.durationMinutes ?? 60,
        }
      }
      if (last) {
        lastLesson = {
          startAt: last.startAt.toISOString(),
          teacherName: last.teacher.nome,
          durationMinutes: last.durationMinutes ?? 60,
          status: last.status,
          record: last.record
            ? {
                book: last.record.book,
                lastPage: last.record.lastPage,
                notesForStudent: last.record.notesForStudent,
              }
            : undefined,
        }
      }
    }

    return NextResponse.json({
      ok: true,
      data: { alerts, nextLesson, lastLesson, lessonRecords },
    })
  } catch (error) {
    console.error('[api/student/dashboard-info GET]', error)
    return NextResponse.json(
      { ok: false, message: 'Erro ao carregar informações' },
      { status: 500 }
    )
  }
}
