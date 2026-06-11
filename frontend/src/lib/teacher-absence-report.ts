import type { TeacherAbsenceReportStatus, TeacherAbsenceReportType } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { ymdInTZ } from '@/lib/datetime'
import {
  appendTeacherAbsenceConfirmedNote,
  teacherAbsenceReportEntitlesReplacement,
} from '@/lib/teacher-absence-policy'
import { isLessonCancelledFamily, isLessonScheduledStatus } from '@/lib/lesson-status'

export const TEACHER_ABSENCE_REPORT_WINDOW_MS = 15 * 60 * 1000

export function isWithinTeacherAbsenceReportWindow(lessonStart: Date, now = new Date()): boolean {
  const startMs = lessonStart.getTime()
  return now.getTime() >= startMs && now.getTime() <= startMs + TEACHER_ABSENCE_REPORT_WINDOW_MS
}

function formatLessonDateTime(iso: Date): string {
  return iso.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function buildTeacherAbsenceTodoText(params: {
  studentName: string
  teacherName: string
  lessonStart: Date
  reportType: TeacherAbsenceReportType
}): string {
  const when = formatLessonDateTime(params.lessonStart)
  if (params.reportType === 'LATE') {
    return `${params.studentName} declarou atraso do professor ${params.teacherName} na aula de ${when}`
  }
  return `${params.studentName} declarou que o professor ${params.teacherName} estava ausente na aula de ${when} — agendar reposição se confirmado`
}

export function teacherAbsenceReportTypeLabel(type: TeacherAbsenceReportType): string {
  return type === 'LATE' ? 'Atraso do professor' : 'Professor ausente'
}

export async function getSystemAdminUserId(): Promise<string> {
  const admin = await prisma.user.findFirst({
    where: { role: 'ADMIN', status: 'ACTIVE' },
    select: { id: true },
    orderBy: { criadoEm: 'asc' },
  })
  if (!admin) {
    throw new Error('Nenhum administrador ativo encontrado')
  }
  return admin.id
}

export async function syncReportFromTodoStatus(
  todoId: string,
  todoStatus: string,
  adminUserId: string
): Promise<void> {
  const report = await prisma.teacherAbsenceReport.findFirst({ where: { todoId } })
  if (!report || report.status === 'RESOLVED') return

  if (todoStatus === 'IN_PROGRESS' && report.status !== 'VERIFYING') {
    await prisma.teacherAbsenceReport.update({
      where: { id: report.id },
      data: {
        status: 'VERIFYING',
        verifyingByUserId: adminUserId,
        resolvedByUserId: null,
      },
    })
    return
  }

  if (todoStatus === 'DONE') {
    await prisma.teacherAbsenceReport.update({
      where: { id: report.id },
      data: {
        status: 'RESOLVED',
        resolvedByUserId: adminUserId,
      },
    })
    return
  }

  if (todoStatus === 'OPEN' && report.status !== 'OPEN') {
    await prisma.teacherAbsenceReport.update({
      where: { id: report.id },
      data: {
        status: 'OPEN',
        verifyingByUserId: null,
        resolvedByUserId: null,
      },
    })
  }
}

export async function syncTodoFromReportAction(
  report: {
    id: string
    todoId: string | null
    status: TeacherAbsenceReportStatus
  },
  action: 'VERIFYING' | 'RESOLVED',
  adminUserId: string,
  adminName: string
): Promise<void> {
  if (!report.todoId) return

  if (action === 'VERIFYING') {
    await prisma.adminDashboardTodo.update({
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
    return
  }

  await prisma.adminDashboardTodo.update({
    where: { id: report.todoId },
    data: {
      status: 'DONE',
      completedAt: new Date(),
      completedByUserId: adminUserId,
      resolutionNote: `Reporte resolvido por ${adminName}`,
    },
  })
}

export async function createTeacherAbsenceReportWithTodo(params: {
  lessonId: string
  enrollmentId: string
  teacherId: string
  studentName: string
  teacherName: string
  lessonStart: Date
  reportType: TeacherAbsenceReportType
  todoText?: string
}) {
  const adminUserId = await getSystemAdminUserId()
  const dayKey = ymdInTZ(new Date())
  const text =
    params.todoText ??
    buildTeacherAbsenceTodoText({
      studentName: params.studentName,
      teacherName: params.teacherName,
      lessonStart: params.lessonStart,
      reportType: params.reportType,
    })

  return prisma.$transaction(async (tx) => {
    const todo = await tx.adminDashboardTodo.create({
      data: {
        text,
        category: 'GESTAO',
        isUrgent: true,
        dayKey,
        status: 'OPEN',
        createdByUserId: adminUserId,
      },
    })

    const report = await tx.teacherAbsenceReport.create({
      data: {
        lessonId: params.lessonId,
        enrollmentId: params.enrollmentId,
        teacherId: params.teacherId,
        reportType: params.reportType,
        status: 'OPEN',
        todoId: todo.id,
      },
      include: {
        verifyingBy: { select: { nome: true } },
        resolvedBy: { select: { nome: true } },
        enrollment: { select: { nome: true } },
        teacher: { select: { nome: true } },
        lesson: { select: { startAt: true } },
      },
    })

    return report
  })
}

/** Confirma ausência do professor: cancela a aula (CANCELLED_BY_TEACHER) e libera reposição. */
export async function confirmTeacherAbsenceForReplacement(params: {
  reportId: string
  adminUserId: string
  adminName: string
}) {
  const existing = await prisma.teacherAbsenceReport.findUnique({
    where: { id: params.reportId },
    include: {
      enrollment: { select: { nome: true } },
      teacher: { select: { nome: true } },
      lesson: { select: { id: true, status: true, startAt: true, notes: true } },
    },
  })

  if (!existing) {
    return { ok: false as const, status: 404, message: 'Reporte não encontrado' }
  }
  if (existing.status === 'RESOLVED') {
    return { ok: false as const, status: 400, message: 'Este reporte já foi resolvido' }
  }
  if (!teacherAbsenceReportEntitlesReplacement(existing.reportType)) {
    return {
      ok: false as const,
      status: 400,
      message: 'Reposição automática só se aplica a reporte de professor ausente',
    }
  }

  const result = await prisma.$transaction(async (tx) => {
    let lessonStatus = existing.lesson.status

    if (isLessonScheduledStatus(existing.lesson.status)) {
      const updatedLesson = await tx.lesson.update({
        where: { id: existing.lesson.id },
        data: {
          status: 'CANCELLED_BY_TEACHER',
          notes: appendTeacherAbsenceConfirmedNote(existing.lesson.notes, {
            adminName: params.adminName,
            studentName: existing.enrollment.nome,
            lessonWhen: existing.lesson.startAt,
          }),
        },
      })
      lessonStatus = updatedLesson.status
    } else if (!isLessonCancelledFamily(existing.lesson.status)) {
      throw new Error('Status da aula não permite reposição')
    }

    const report = await tx.teacherAbsenceReport.update({
      where: { id: params.reportId },
      data: {
        status: 'RESOLVED',
        resolvedByUserId: params.adminUserId,
      },
      include: {
        enrollment: { select: { nome: true } },
        teacher: { select: { nome: true } },
        verifyingBy: { select: { id: true, nome: true } },
        resolvedBy: { select: { id: true, nome: true } },
        lesson: { select: { id: true, startAt: true, status: true } },
      },
    })

    if (report.todoId) {
      await tx.adminDashboardTodo.update({
        where: { id: report.todoId },
        data: {
          status: 'DONE',
          completedAt: new Date(),
          completedByUserId: params.adminUserId,
          resolutionNote: `${params.adminName} confirmou ausência do professor — agendar reposição no calendário`,
        },
      })
    }

    return report
  })

  return {
    ok: true as const,
    report: result,
    lessonId: result.lesson.id,
    lessonStatus: result.lesson.status,
  }
}

/** Falso positivo de ausência: libera registro da aula e encerra o alerta + to-do. */
export async function releaseTeacherRegistrationFromAbsenceReport(params: {
  reportId: string
  adminUserId: string
  adminName: string
}) {
  const existing = await prisma.teacherAbsenceReport.findUnique({
    where: { id: params.reportId },
    include: {
      enrollment: { select: { nome: true } },
      teacher: { select: { id: true, nome: true } },
      lesson: {
        select: {
          id: true,
          startAt: true,
          status: true,
          record: { select: { id: true } },
        },
      },
    },
  })

  if (!existing) {
    return { ok: false as const, status: 404, message: 'Reporte não encontrado' }
  }
  if (existing.status === 'RESOLVED') {
    return { ok: false as const, status: 400, message: 'Este reporte já foi resolvido' }
  }
  if (existing.lesson.record) {
    return {
      ok: false as const,
      status: 400,
      message: 'Esta aula já possui registro. Não é necessário liberar.',
    }
  }

  const result = await prisma.$transaction(async (tx) => {
    const existingUnlock = await tx.lessonRecordUnlockRequest.findFirst({
      where: { lessonId: existing.lessonId, teacherId: existing.teacherId },
      orderBy: { criadoEm: 'desc' },
    })

    if (existingUnlock) {
      await tx.lessonRecordUnlockRequest.update({
        where: { id: existingUnlock.id },
        data: {
          status: 'APPROVED',
          adminNotes: 'Registro liberado pelo admin — alerta de ausência incorreto.',
          processedById: params.adminUserId,
          processedAt: new Date(),
        },
      })
    } else {
      await tx.lessonRecordUnlockRequest.create({
        data: {
          lessonId: existing.lessonId,
          teacherId: existing.teacherId,
          status: 'APPROVED',
          message: 'Liberação via alerta de professor ausente (falso positivo).',
          adminNotes: 'Registro liberado pelo admin — alerta de ausência incorreto.',
          processedById: params.adminUserId,
          processedAt: new Date(),
        },
      })
    }

    const report = await tx.teacherAbsenceReport.update({
      where: { id: params.reportId },
      data: {
        status: 'RESOLVED',
        resolvedByUserId: params.adminUserId,
      },
      include: {
        enrollment: { select: { nome: true } },
        teacher: { select: { nome: true } },
        verifyingBy: { select: { id: true, nome: true } },
        resolvedBy: { select: { id: true, nome: true } },
        lesson: { select: { id: true, startAt: true, status: true } },
      },
    })

    if (report.todoId) {
      await tx.adminDashboardTodo.update({
        where: { id: report.todoId },
        data: {
          status: 'DONE',
          completedAt: new Date(),
          completedByUserId: params.adminUserId,
          resolutionNote: `${params.adminName} liberou o registro da aula — professor pode registrar normalmente (alerta incorreto).`,
        },
      })
    }

    return report
  })

  return { ok: true as const, report: result }
}
