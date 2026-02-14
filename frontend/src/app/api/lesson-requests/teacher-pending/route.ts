/**
 * GET /api/lesson-requests/teacher-pending
 * Listar solicitações pendentes de aprovação do professor
 * Apenas professores podem acessar
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireTeacher } from '@/lib/auth'

export async function GET(request: NextRequest) {
  try {
    const auth = await requireTeacher(request)
    if (!auth.authorized || !auth.session) {
      return NextResponse.json(
        { ok: false, message: auth.message || 'Não autorizado' },
        { status: auth.message?.includes('Não autenticado') ? 401 : 403 }
      )
    }

    // Buscar o teacher pelo userId
    const teacher = await prisma.teacher.findFirst({
      where: { userId: auth.session.userId },
      select: { id: true },
    })

    if (!teacher) {
      return NextResponse.json(
        { ok: false, message: 'Professor não encontrado' },
        { status: 404 }
      )
    }

    console.log('[api/lesson-requests/teacher-pending] Buscando solicitações para teacherId:', teacher.id)
    
    // Buscar todas as solicitações pendentes deste professor, não apenas as que requerem aprovação
    // Isso permite que o professor veja todas as solicitações relacionadas às suas aulas
    const requests = await prisma.lessonRequest.findMany({
      where: {
        teacherId: teacher.id,
        status: 'PENDING',
      },
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
        requestedTeacher: true,
      },
      orderBy: {
        criadoEm: 'asc',
      },
    })

    console.log('[api/lesson-requests/teacher-pending] Encontradas', requests.length, 'solicitações pendentes')

    return NextResponse.json({
      ok: true,
      requests: requests.map((r) => ({
        id: r.id,
        lessonId: r.lessonId,
        type: r.type,
        status: r.status,
        requestedStartAt: r.requestedStartAt,
        requestedTeacherId: r.requestedTeacherId,
        notes: r.notes,
        criadoEm: r.criadoEm,
        lesson: {
          id: r.lesson.id,
          startAt: r.lesson.startAt,
          durationMinutes: r.lesson.durationMinutes,
          enrollment: {
            id: r.lesson.enrollment.id,
            nome: r.lesson.enrollment.nome,
            email: r.lesson.enrollment.email,
            userId: r.lesson.enrollment.userId,
          },
        },
        requestedTeacher: r.requestedTeacher ? {
          id: r.requestedTeacher.id,
          nome: r.requestedTeacher.nome,
        } : null,
      })),
    })
  } catch (error) {
    console.error('[api/lesson-requests/teacher-pending GET]', error)
    return NextResponse.json(
      { ok: false, message: 'Erro ao listar solicitações pendentes' },
      { status: 500 }
    )
  }
}
