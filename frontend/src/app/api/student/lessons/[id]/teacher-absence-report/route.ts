/**
 * POST /api/student/lessons/[id]/teacher-absence-report
 * Aluno declara professor ausente ou atrasado (primeiros 15 min da aula).
 */

import { NextRequest, NextResponse } from 'next/server'
import type { TeacherAbsenceReportType } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { requireStudent } from '@/lib/auth'
import {
  createTeacherAbsenceReportWithTodo,
  isWithinTeacherAbsenceReportWindow,
} from '@/lib/teacher-absence-report'

function parseReportType(raw: unknown): TeacherAbsenceReportType | null {
  if (raw === 'ABSENT' || raw === 'LATE') return raw
  return null
}

export async function POST(
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
    let body: unknown
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ ok: false, message: 'JSON inválido' }, { status: 400 })
    }

    const reportType = parseReportType(
      typeof body === 'object' && body !== null ? (body as { type?: unknown }).type : undefined
    )
    if (!reportType) {
      return NextResponse.json(
        { ok: false, message: 'Tipo inválido. Use ABSENT ou LATE.' },
        { status: 400 }
      )
    }

    const enrollments = await prisma.enrollment.findMany({
      where: { userId: auth.session.userId },
      select: { id: true },
    })
    const enrollmentIds = enrollments.map((e) => e.id)

    const lesson = await prisma.lesson.findUnique({
      where: { id: lessonId },
      include: {
        enrollment: { select: { id: true, nome: true } },
        teacher: { select: { id: true, nome: true } },
      },
    })

    if (!lesson) {
      return NextResponse.json({ ok: false, message: 'Aula não encontrada' }, { status: 404 })
    }

    if (!enrollmentIds.includes(lesson.enrollmentId)) {
      return NextResponse.json({ ok: false, message: 'Sem permissão para esta aula' }, { status: 403 })
    }

    if (lesson.status !== 'CONFIRMED') {
      return NextResponse.json(
        { ok: false, message: 'Só é possível reportar em aulas confirmadas' },
        { status: 400 }
      )
    }

    if (!lesson.teacherId || !lesson.teacher) {
      return NextResponse.json(
        { ok: false, message: 'Esta aula não possui professor designado' },
        { status: 400 }
      )
    }

    const lessonStart = new Date(lesson.startAt)
    if (!isWithinTeacherAbsenceReportWindow(lessonStart)) {
      return NextResponse.json(
        {
          ok: false,
          message: 'Os botões ficam disponíveis apenas nos primeiros 15 minutos da aula',
        },
        { status: 400 }
      )
    }

    const existing = await prisma.teacherAbsenceReport.findUnique({
      where: {
        lessonId_enrollmentId_reportType: {
          lessonId,
          enrollmentId: lesson.enrollmentId,
          reportType,
        },
      },
    })
    if (existing) {
      return NextResponse.json(
        { ok: false, message: 'Você já registrou este reporte para esta aula' },
        { status: 409 }
      )
    }

    const report = await createTeacherAbsenceReportWithTodo({
      lessonId,
      enrollmentId: lesson.enrollmentId,
      teacherId: lesson.teacherId,
      studentName: lesson.enrollment.nome,
      teacherName: lesson.teacher.nome,
      lessonStart,
      reportType,
    })

    return NextResponse.json({
      ok: true,
      data: {
        report: {
          id: report.id,
          reportType: report.reportType,
          status: report.status,
        },
      },
    })
  } catch (error) {
    console.error('[api/student/lessons/[id]/teacher-absence-report POST]', error)
    return NextResponse.json({ ok: false, message: 'Erro ao registrar reporte' }, { status: 500 })
  }
}
