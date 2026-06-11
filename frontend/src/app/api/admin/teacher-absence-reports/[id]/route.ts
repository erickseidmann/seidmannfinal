/**
 * PATCH /api/admin/teacher-absence-reports/[id]
 * { action: 'VERIFYING' | 'RESOLVED' | 'CONFIRM_ABSENCE' }
 *
 * CONFIRM_ABSENCE: regra de reposição — professor ausente confirmado → cancela aula e gestão reagenda.
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/auth'
import {
  confirmTeacherAbsenceForReplacement,
  teacherAbsenceReportTypeLabel,
} from '@/lib/teacher-absence-report'

function reportPayload(report: {
  id: string
  status: string
  reportType: 'ABSENT' | 'LATE'
  lessonId: string
  enrollment: { nome: string }
  teacher: { nome: string }
  verifyingBy: { nome: string } | null
  resolvedBy: { nome: string } | null
  lesson: { startAt: Date; id?: string }
}) {
  return {
    id: report.id,
    lessonId: report.lessonId,
    status: report.status,
    reportType: report.reportType,
    reportTypeLabel: teacherAbsenceReportTypeLabel(report.reportType),
    studentName: report.enrollment.nome,
    teacherName: report.teacher.nome,
    lessonStartAt: report.lesson.startAt.toISOString(),
    verifyingByName: report.verifyingBy?.nome ?? null,
    resolvedByName: report.resolvedBy?.nome ?? null,
  }
}

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
    if (action !== 'VERIFYING' && action !== 'RESOLVED' && action !== 'CONFIRM_ABSENCE') {
      return NextResponse.json(
        { ok: false, message: 'Ação inválida. Use VERIFYING, RESOLVED ou CONFIRM_ABSENCE.' },
        { status: 400 }
      )
    }

    const adminUserId = auth.session.sub
    const adminUser = await prisma.user.findUnique({
      where: { id: adminUserId },
      select: { nome: true },
    })
    const adminName = adminUser?.nome ?? 'Admin'

    if (action === 'CONFIRM_ABSENCE') {
      const outcome = await confirmTeacherAbsenceForReplacement({
        reportId: id,
        adminUserId,
        adminName,
      })
      if (!outcome.ok) {
        return NextResponse.json(
          { ok: false, message: outcome.message },
          { status: outcome.status }
        )
      }
      return NextResponse.json({
        ok: true,
        data: {
          report: reportPayload(outcome.report),
          lessonId: outcome.lessonId,
          scheduleReplacement: true,
        },
      })
    }

    const existing = await prisma.teacherAbsenceReport.findUnique({
      where: { id },
      include: {
        enrollment: { select: { nome: true } },
        teacher: { select: { nome: true } },
        verifyingBy: { select: { id: true, nome: true } },
        resolvedBy: { select: { id: true, nome: true } },
        lesson: { select: { id: true, startAt: true } },
      },
    })

    if (!existing) {
      return NextResponse.json({ ok: false, message: 'Reporte não encontrado' }, { status: 404 })
    }

    if (existing.status === 'RESOLVED') {
      return NextResponse.json({ ok: false, message: 'Este reporte já foi resolvido' }, { status: 400 })
    }

    if (action === 'VERIFYING' && existing.status === 'VERIFYING') {
      return NextResponse.json({
        ok: true,
        data: { report: reportPayload(existing) },
      })
    }

    const updated = await prisma.$transaction(async (tx) => {
      const report = await tx.teacherAbsenceReport.update({
        where: { id },
        data:
          action === 'VERIFYING'
            ? {
                status: 'VERIFYING',
                verifyingByUserId: adminUserId,
                resolvedByUserId: null,
              }
            : {
                status: 'RESOLVED',
                resolvedByUserId: adminUserId,
              },
        include: {
          enrollment: { select: { nome: true } },
          teacher: { select: { nome: true } },
          verifyingBy: { select: { id: true, nome: true } },
          resolvedBy: { select: { id: true, nome: true } },
          lesson: { select: { id: true, startAt: true } },
        },
      })

      if (report.todoId) {
        if (action === 'VERIFYING') {
          await tx.adminDashboardTodo.update({
            where: { id: report.todoId },
            data: {
              status: 'IN_PROGRESS',
              completedAt: null,
              completedByUserId: null,
              progressUpdatedAt: new Date(),
              progressByUserId: adminUserId,
              resolutionNote: `${adminName} está verificando o reporte do aluno`,
            },
          })
        } else {
          await tx.adminDashboardTodo.update({
            where: { id: report.todoId },
            data: {
              status: 'DONE',
              completedAt: new Date(),
              completedByUserId: adminUserId,
              resolutionNote: `Reporte resolvido por ${adminName}`,
            },
          })
        }
      }

      return report
    })

    return NextResponse.json({
      ok: true,
      data: { report: reportPayload(updated) },
    })
  } catch (error) {
    console.error('[api/admin/teacher-absence-reports/[id] PATCH]', error)
    return NextResponse.json({ ok: false, message: 'Erro ao atualizar reporte' }, { status: 500 })
  }
}
