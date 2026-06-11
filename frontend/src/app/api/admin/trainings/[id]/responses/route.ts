/**
 * GET /api/admin/trainings/[id]/responses
 * Lista professores que responderam o treinamento com nota, acertos e erros.
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/auth'
import { computeCompletionStats } from '@/lib/training-response-stats'

type RouteCtx = { params: Promise<{ id: string }> }

export async function GET(request: NextRequest, ctx: RouteCtx) {
  try {
    const auth = await requireAdmin(request)
    if (!auth.authorized || !auth.session) {
      return NextResponse.json(
        { ok: false, message: auth.message || 'Não autorizado' },
        { status: auth.message?.includes('Não autenticado') ? 401 : 403 }
      )
    }

    const { id } = await ctx.params
    const training = await prisma.training.findUnique({
      where: { id },
      include: {
        questions: {
          orderBy: { sortOrder: 'asc' },
          include: {
            options: { orderBy: { sortOrder: 'asc' } },
          },
        },
        completions: {
          orderBy: { completedAt: 'desc' },
          include: {
            teacher: {
              select: {
                id: true,
                nome: true,
                nomePreferido: true,
                email: true,
                status: true,
              },
            },
          },
        },
      },
    })

    if (!training) {
      return NextResponse.json({ ok: false, message: 'Treinamento não encontrado' }, { status: 404 })
    }

    const activeTeachersCount = await prisma.teacher.count({
      where: { status: 'ACTIVE' },
    })

    const questionStats = training.questions.map((q) => ({
      id: q.id,
      options: q.options.map((o) => ({ id: o.id, isCorrect: o.isCorrect })),
    }))

    const responses = training.completions.map((c) => {
      const stats = computeCompletionStats(questionStats, c.answersJson)
      const teacher = c.teacher
      return {
        id: c.id,
        teacherId: teacher.id,
        teacherName: teacher.nomePreferido?.trim() || teacher.nome,
        teacherEmail: teacher.email,
        teacherStatus: teacher.status,
        scorePercent: c.scorePercent,
        passed: c.passed,
        correctCount: stats.correctCount,
        wrongCount: stats.wrongCount,
        totalQuestions: stats.total,
        completedAt: c.completedAt.toISOString(),
      }
    })

    return NextResponse.json({
      ok: true,
      data: {
        training: {
          id: training.id,
          title: training.title,
          questionCount: training.questions.length,
        },
        summary: {
          respondedCount: responses.length,
          activeTeachersCount,
          pendingCount: Math.max(0, activeTeachersCount - responses.length),
        },
        responses,
      },
    })
  } catch (error) {
    console.error('[api/admin/trainings/[id]/responses GET]', error)
    return NextResponse.json({ ok: false, message: 'Erro ao carregar respostas' }, { status: 500 })
  }
}
