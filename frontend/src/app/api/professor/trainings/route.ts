/**
 * GET /api/professor/trainings — lista treinamentos ativos
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

    const teacher = await prisma.teacher.findFirst({
      where: { userId: auth.session.userId },
      select: { id: true },
    })
    if (!teacher) {
      return NextResponse.json({ ok: false, message: 'Professor não encontrado' }, { status: 404 })
    }
    const teacherId = teacher.id

    const trainings = await prisma.training.findMany({
      where: { active: true },
      orderBy: { publishedAt: 'desc' },
      include: {
        questions: { select: { id: true } },
        completions: {
          where: { teacherId },
          take: 1,
        },
      },
    })

    return NextResponse.json({
      ok: true,
      data: trainings.map((t) => {
        const completion = t.completions[0] ?? null
        return {
          id: t.id,
          title: t.title,
          description: t.description,
          contentType: t.contentType,
          publishedAt: t.publishedAt.toISOString(),
          questionCount: t.questions.length,
          completed: completion != null,
          scorePercent: completion?.scorePercent ?? null,
          passed: completion?.passed ?? null,
        }
      }),
    })
  } catch (error) {
    console.error('[api/professor/trainings GET]', error)
    return NextResponse.json({ ok: false, message: 'Erro ao listar treinamentos' }, { status: 500 })
  }
}
