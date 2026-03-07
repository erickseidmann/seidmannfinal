/**
 * GET /api/admin/enrollments/repetition-ending?withinDays=7
 * Lista alunos cujas aulas repetidas terminam em 1 semana ou menos.
 * Critério: última aula (max startAt) do enrollment está entre agora e agora+7 dias.
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
    const withinDays = Math.min(14, Math.max(1, Number(searchParams.get('withinDays')) || 7))

    const agora = new Date()
    const limite = new Date(agora)
    limite.setDate(limite.getDate() + withinDays)
    limite.setHours(23, 59, 59, 999)

    // Buscar enrollments ativos com pelo menos uma aula futura em [agora, limite]
    const lessons = await prisma.lesson.findMany({
      where: {
        status: { not: 'CANCELLED' },
        startAt: { gte: agora, lte: limite },
        enrollment: { status: 'ACTIVE' },
      },
      select: {
        enrollmentId: true,
        startAt: true,
        enrollment: { select: { id: true, nome: true } },
      },
    })

    const enrollmentIds = [...new Set(lessons.map((l) => l.enrollmentId))]
    const list: { enrollmentId: string; studentName: string; lastLessonAt: Date }[] = []

    for (const eid of enrollmentIds) {
      const last = await prisma.lesson.findFirst({
        where: {
          enrollmentId: eid,
          status: { not: 'CANCELLED' },
        },
        orderBy: { startAt: 'desc' },
        select: { startAt: true },
      })
      if (!last) continue
      const lastAt = new Date(last.startAt)
      if (lastAt < agora || lastAt > limite) continue

      const enr = lessons.find((l) => l.enrollmentId === eid)?.enrollment
      list.push({
        enrollmentId: eid,
        studentName: enr?.nome ?? 'Aluno',
        lastLessonAt: lastAt,
      })
    }

    list.sort((a, b) => a.lastLessonAt.getTime() - b.lastLessonAt.getTime())

    return NextResponse.json({
      ok: true,
      data: list.map((x) => ({
        enrollmentId: x.enrollmentId,
        studentName: x.studentName,
        lastLessonAt: x.lastLessonAt.toISOString(),
      })),
      count: list.length,
    })
  } catch (error) {
    console.error('[api/admin/enrollments/repetition-ending GET]', error)
    return NextResponse.json(
      { ok: false, message: 'Erro ao listar alunos com repetição no fim' },
      { status: 500 }
    )
  }
}
