/**
 * GET /api/admin/lesson-requests
 * Listar todas as solicitações de cancelamento/troca de aula
 * Apenas administradores podem acessar
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/auth'

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
    const status = searchParams.get('status') // PENDING, TEACHER_APPROVED, TEACHER_REJECTED, etc.
    const type = searchParams.get('type') // CANCELAMENTO, TROCA_PROFESSOR, TROCA_AULA
    const lessonId = searchParams.get('lessonId') // Filtrar por lessonId

    const where: any = {}
    if (status) {
      where.status = status
    }
    if (type) {
      where.type = type
    }
    if (lessonId) {
      where.lessonId = lessonId
    }

    const requests = await prisma.lessonRequest.findMany({
      where,
      include: {
        lesson: {
          include: {
            enrollment: {
              include: {
                user: true,
              },
            },
            teacher: true,
          },
        },
        teacher: true,
        requestedTeacher: true,
        createdBy: {
          select: {
            id: true,
            nome: true,
            email: true,
          },
        },
        processedBy: {
          select: {
            id: true,
            nome: true,
            email: true,
          },
        },
      },
      orderBy: {
        criadoEm: 'desc',
      },
    })

    return NextResponse.json({
      ok: true,
      requests: requests.map((r) => ({
        id: r.id,
        lessonId: r.lessonId,
        enrollmentId: r.enrollmentId,
        teacherId: r.teacherId,
        type: r.type,
        status: r.status,
        requiresTeacherApproval: r.requiresTeacherApproval,
        teacherApproval: r.teacherApproval,
        teacherApprovedAt: r.teacherApprovedAt,
        requestedStartAt: r.requestedStartAt,
        requestedTeacherId: r.requestedTeacherId,
        notes: r.notes,
        adminNotes: r.adminNotes,
        createdById: r.createdById,
        processedById: r.processedById,
        criadoEm: r.criadoEm,
        atualizadoEm: r.atualizadoEm,
        lesson: {
          id: r.lesson.id,
          startAt: r.lesson.startAt,
          durationMinutes: r.lesson.durationMinutes,
          status: r.lesson.status,
          enrollment: {
            id: r.lesson.enrollment.id,
            nome: r.lesson.enrollment.nome,
            curso: r.lesson.enrollment.curso,
            email: r.lesson.enrollment.email,
            userId: r.lesson.enrollment.userId,
            escolaMatricula: r.lesson.enrollment.escolaMatricula,
          },
          teacher: {
            id: r.lesson.teacher.id,
            nome: r.lesson.teacher.nome,
            email: r.lesson.teacher.email,
          },
        },
        teacher: {
          id: r.teacher.id,
          nome: r.teacher.nome,
          email: r.teacher.email,
        },
        requestedTeacher: r.requestedTeacher ? {
          id: r.requestedTeacher.id,
          nome: r.requestedTeacher.nome,
          email: r.requestedTeacher.email,
        } : null,
        createdBy: r.createdBy ? {
          id: r.createdBy.id,
          nome: r.createdBy.nome,
          email: r.createdBy.email,
        } : null,
        processedBy: r.processedBy ? {
          id: r.processedBy.id,
          nome: r.processedBy.nome,
          email: r.processedBy.email,
        } : null,
      })),
    })
  } catch (error) {
    console.error('[api/admin/lesson-requests GET]', error)
    return NextResponse.json(
      { ok: false, message: 'Erro ao listar solicitações' },
      { status: 500 }
    )
  }
}
