/**
 * POST /api/professor/trainings/[id]/submit — envia respostas do quiz
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireTeacher } from '@/lib/auth'

type RouteCtx = { params: Promise<{ id: string }> }

export async function POST(request: NextRequest, ctx: RouteCtx) {
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
      include: {
        questions: {
          include: { options: true },
        },
      },
    })

    if (!training) {
      return NextResponse.json({ ok: false, message: 'Treinamento não encontrado' }, { status: 404 })
    }

    const body = await request.json()
    const answers =
      body?.answers && typeof body.answers === 'object' && !Array.isArray(body.answers)
        ? (body.answers as Record<string, string>)
        : null

    if (!answers) {
      return NextResponse.json({ ok: false, message: 'Respostas inválidas' }, { status: 400 })
    }

    const questions = training.questions
    if (questions.length === 0) {
      return NextResponse.json({ ok: false, message: 'Treinamento sem perguntas' }, { status: 400 })
    }

    for (const q of questions) {
      const selected = answers[q.id]
      if (!selected) {
        return NextResponse.json(
          { ok: false, message: 'Responda todas as perguntas antes de enviar' },
          { status: 400 }
        )
      }
      const validOption = q.options.some((o) => o.id === selected)
      if (!validOption) {
        return NextResponse.json({ ok: false, message: 'Resposta inválida para uma pergunta' }, { status: 400 })
      }
    }

    let correct = 0
    const results = questions.map((q) => {
      const selectedId = answers[q.id]
      const correctOption = q.options.find((o) => o.isCorrect)
      const isCorrect = correctOption?.id === selectedId
      if (isCorrect) correct++
      return {
        questionId: q.id,
        selectedOptionId: selectedId,
        correctOptionId: correctOption?.id ?? null,
        isCorrect,
      }
    })

    const scorePercent = Math.round((correct / questions.length) * 100)
    const passed = scorePercent === 100

    const completion = await prisma.trainingCompletion.upsert({
      where: {
        trainingId_teacherId: { trainingId: id, teacherId },
      },
      create: {
        trainingId: id,
        teacherId,
        scorePercent,
        passed,
        answersJson: JSON.stringify(answers),
      },
      update: {
        scorePercent,
        passed,
        answersJson: JSON.stringify(answers),
        completedAt: new Date(),
      },
    })

    return NextResponse.json({
      ok: true,
      data: {
        scorePercent: completion.scorePercent,
        passed: completion.passed,
        completedAt: completion.completedAt.toISOString(),
        results,
      },
    })
  } catch (error) {
    console.error('[api/professor/trainings/[id]/submit POST]', error)
    return NextResponse.json({ ok: false, message: 'Erro ao enviar respostas' }, { status: 500 })
  }
}
