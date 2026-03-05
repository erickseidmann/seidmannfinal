/**
 * GET /api/professor/availability/history
 * Retorna o histórico de alterações dos horários de disponibilidade do professor logado.
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireTeacher } from '@/lib/auth'

const LIMIT = 30

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
      return NextResponse.json(
        { ok: false, message: 'Professor não encontrado' },
        { status: 404 }
      )
    }

    const logs = await prisma.teacherAvailabilityLog.findMany({
      where: { teacherId: teacher.id },
      orderBy: { criadoEm: 'desc' },
      take: LIMIT,
      select: {
        id: true,
        criadoEm: true,
        changedByUserId: true,
        changedBy: { select: { nome: true } },
        slotsSnapshot: true,
        studentsRedirected: true,
        redirectedSummary: true,
      },
    })

    return NextResponse.json({
      ok: true,
      data: {
        history: logs.map((log) => ({
          id: log.id,
          criadoEm: log.criadoEm.toISOString(),
          changedByMe: log.changedByUserId == null,
          changedByName: log.changedBy?.nome ?? null,
          slotsSnapshot: log.slotsSnapshot as Array<{ dayOfWeek: number; startMinutes: number; endMinutes: number }>,
          studentsRedirected: log.studentsRedirected ?? false,
          redirectedSummary: (log.redirectedSummary as Array<{ aluno: string }> | null) ?? null,
        })),
      },
    })
  } catch (error) {
    console.error('[api/professor/availability/history GET]', error)
    const detail = error instanceof Error ? error.message : String(error)
    const message =
      process.env.NODE_ENV === 'development'
        ? `Erro ao buscar histórico: ${detail}`
        : 'Erro ao buscar histórico. Tente novamente.'
    return NextResponse.json(
      { ok: false, message },
      { status: 500 }
    )
  }
}
