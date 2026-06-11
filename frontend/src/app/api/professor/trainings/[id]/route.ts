/**
 * GET /api/professor/trainings/[id] — detalhe do treinamento (sem expor respostas corretas)
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireTeacher } from '@/lib/auth'
import { serializeTrainingForProfessor } from '@/lib/training-serialize'

const trainingInclude = {
  questions: {
    orderBy: { sortOrder: 'asc' as const },
    include: {
      options: { orderBy: { sortOrder: 'asc' as const } },
    },
  },
} as const

type RouteCtx = { params: Promise<{ id: string }> }

export async function GET(request: NextRequest, ctx: RouteCtx) {
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
    const teacherId = teacher.id

    const { id } = await ctx.params
    const training = await prisma.training.findFirst({
      where: { id, active: true },
      include: trainingInclude,
    })

    if (!training) {
      return NextResponse.json({ ok: false, message: 'Treinamento não encontrado' }, { status: 404 })
    }

    const completion = await prisma.trainingCompletion.findUnique({
      where: {
        trainingId_teacherId: { trainingId: id, teacherId },
      },
    })

    return NextResponse.json({
      ok: true,
      data: serializeTrainingForProfessor(training, completion),
    })
  } catch (error) {
    console.error('[api/professor/trainings/[id] GET]', error)
    return NextResponse.json({ ok: false, message: 'Erro ao carregar treinamento' }, { status: 500 })
  }
}
