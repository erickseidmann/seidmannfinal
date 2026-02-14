/**
 * GET /api/student/lesson-requests
 * Lista solicitações de troca/cancelamento de aula do aluno logado
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireStudent } from '@/lib/auth'

export async function GET(request: NextRequest) {
  try {
    const auth = await requireStudent(request)
    if (!auth.authorized) {
      return NextResponse.json(
        { ok: false, message: auth.message || 'Não autorizado' },
        { status: auth.message?.includes('Não autenticado') ? 401 : 403 }
      )
    }

    if (!auth.session?.userId) {
      return NextResponse.json({
        ok: true,
        requests: [],
      })
    }

    // Buscar enrollment do aluno logado
    const enrollment = await prisma.enrollment.findFirst({
      where: { userId: auth.session.userId },
      select: { id: true },
    })

    if (!enrollment) {
      return NextResponse.json({
        ok: true,
        requests: [],
      })
    }

    // Buscar todas as solicitações do aluno
    const requests = await prisma.lessonRequest.findMany({
      where: { enrollmentId: enrollment.id },
      include: {
        lesson: {
          include: {
            enrollment: {
              select: {
                id: true,
                nome: true,
              },
            },
            teacher: {
              select: {
                id: true,
                nome: true,
              },
            },
          },
        },
        teacher: {
          select: {
            id: true,
            nome: true,
          },
        },
        requestedTeacher: {
          select: {
            id: true,
            nome: true,
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
        criadoEm: r.criadoEm,
        atualizadoEm: r.atualizadoEm,
        lesson: {
          id: r.lesson.id,
          startAt: r.lesson.startAt,
          durationMinutes: r.lesson.durationMinutes,
          status: r.lesson.status,
          enrollment: r.lesson.enrollment,
          teacher: r.lesson.teacher,
        },
        teacher: r.teacher,
        requestedTeacher: r.requestedTeacher,
      })),
    })
  } catch (error) {
    console.error('[api/student/lesson-requests GET]', error)
    return NextResponse.json(
      { ok: false, message: 'Erro ao listar solicitações' },
      { status: 500 }
    )
  }
}
