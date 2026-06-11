/**
 * GET /api/admin/trainings/[id]
 * PUT /api/admin/trainings/[id]
 * DELETE /api/admin/trainings/[id]
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
      include: trainingInclude,
    })

    if (!training) {
      return NextResponse.json({ ok: false, message: 'Treinamento não encontrado' }, { status: 404 })
    }

    return NextResponse.json({ ok: true, data: serializeTrainingForAdmin(training) })
  } catch (error) {
    console.error('[api/admin/trainings/[id] GET]', error)
    return NextResponse.json({ ok: false, message: 'Erro ao carregar treinamento' }, { status: 500 })
  }
}

export async function PUT(request: NextRequest, ctx: RouteCtx) {
  try {
    const auth = await requireAdmin(request)
    if (!auth.authorized || !auth.session) {
      return NextResponse.json(
        { ok: false, message: auth.message || 'Não autorizado' },
        { status: auth.message?.includes('Não autenticado') ? 401 : 403 }
      )
    }

    const { id } = await ctx.params
    const existing = await prisma.training.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json({ ok: false, message: 'Treinamento não encontrado' }, { status: 404 })
    }

    const body = await request.json()
    const validated = validateTrainingPayload(body)
    if (!validated.ok) {
      return NextResponse.json({ ok: false, message: validated.message }, { status: 400 })
    }

    const { data } = validated
    const contentChanged =
      existing.contentType !== data.contentType ||
      (existing.youtubeId ?? '') !== (data.youtubeId ?? '') ||
      (existing.contentText ?? '') !== (data.contentText ?? '')

    const training = await prisma.$transaction(async (tx) => {
      const updated = await tx.training.update({
        where: { id },
        data: {
          title: data.title,
          description: data.description,
          contentType: data.contentType,
          youtubeId: data.youtubeId,
          contentText: data.contentText,
          active: data.active,
          ...(contentChanged ? { publishedAt: new Date() } : {}),
        },
      })

      await replaceTrainingQuestions(tx, id, data.questions)

      if (data.active && contentChanged) {
        await notifyActiveTeachersNewTraining(tx, {
          title: data.title,
          createdById: auth.session?.sub ?? null,
        })
      }

      return tx.training.findUniqueOrThrow({
        where: { id: updated.id },
        include: trainingInclude,
      })
    })

    return NextResponse.json({ ok: true, data: serializeTrainingForAdmin(training) })
  } catch (error) {
    console.error('[api/admin/trainings/[id] PUT]', error)
    return NextResponse.json({ ok: false, message: 'Erro ao atualizar treinamento' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest, ctx: RouteCtx) {
  try {
    const auth = await requireAdmin(request)
    if (!auth.authorized || !auth.session) {
      return NextResponse.json(
        { ok: false, message: auth.message || 'Não autorizado' },
        { status: auth.message?.includes('Não autenticado') ? 401 : 403 }
      )
    }

    const { id } = await ctx.params
    const existing = await prisma.training.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json({ ok: false, message: 'Treinamento não encontrado' }, { status: 404 })
    }

    await prisma.training.delete({ where: { id } })
    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('[api/admin/trainings/[id] DELETE]', error)
    return NextResponse.json({ ok: false, message: 'Erro ao excluir treinamento' }, { status: 500 })
  }
}
