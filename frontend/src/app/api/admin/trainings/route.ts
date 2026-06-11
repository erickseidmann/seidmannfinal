/**
 * GET /api/admin/trainings — lista treinamentos
 * POST /api/admin/trainings — cria treinamento
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/auth'
import { validateTrainingPayload } from '@/lib/training-validation'
import { replaceTrainingQuestions } from '@/lib/training-persist'
import { notifyActiveTeachersNewTraining } from '@/lib/notify-teachers-new-training'
import { serializeTrainingForAdmin } from '@/lib/training-serialize'

const trainingInclude = {
  questions: {
    orderBy: { sortOrder: 'asc' as const },
    include: {
      options: { orderBy: { sortOrder: 'asc' as const } },
    },
  },
} as const

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAdmin(request)
    if (!auth.authorized || !auth.session) {
      return NextResponse.json(
        { ok: false, message: auth.message || 'Não autorizado' },
        { status: auth.message?.includes('Não autenticado') ? 401 : 403 }
      )
    }

    const trainings = await prisma.training.findMany({
      orderBy: { publishedAt: 'desc' },
      include: {
        questions: { select: { id: true } },
        _count: { select: { completions: true } },
      },
    })

    return NextResponse.json({
      ok: true,
      data: trainings.map((t) => ({
        id: t.id,
        title: t.title,
        contentType: t.contentType,
        active: t.active,
        publishedAt: t.publishedAt.toISOString(),
        questionCount: t.questions.length,
        responseCount: t._count.completions,
      })),
    })
  } catch (error) {
    console.error('[api/admin/trainings GET]', error)
    return NextResponse.json({ ok: false, message: 'Erro ao listar treinamentos' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAdmin(request)
    if (!auth.authorized || !auth.session) {
      return NextResponse.json(
        { ok: false, message: auth.message || 'Não autorizado' },
        { status: auth.message?.includes('Não autenticado') ? 401 : 403 }
      )
    }

    const body = await request.json()
    const validated = validateTrainingPayload(body)
    if (!validated.ok) {
      return NextResponse.json({ ok: false, message: validated.message }, { status: 400 })
    }

    const { data } = validated

    const training = await prisma.$transaction(async (tx) => {
      const created = await tx.training.create({
        data: {
          title: data.title,
          description: data.description,
          contentType: data.contentType,
          youtubeId: data.youtubeId,
          contentText: data.contentText,
          active: data.active,
          createdById: auth.session?.sub ?? null,
        },
      })

      await replaceTrainingQuestions(tx, created.id, data.questions)

      if (data.active) {
        await notifyActiveTeachersNewTraining(tx, {
          title: data.title,
          createdById: auth.session?.sub ?? null,
        })
      }

      return tx.training.findUniqueOrThrow({
        where: { id: created.id },
        include: trainingInclude,
      })
    })

    return NextResponse.json({ ok: true, data: serializeTrainingForAdmin(training) })
  } catch (error) {
    console.error('[api/admin/trainings POST]', error)
    return NextResponse.json({ ok: false, message: 'Erro ao criar treinamento' }, { status: 500 })
  }
}
