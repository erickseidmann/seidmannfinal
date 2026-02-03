/**
 * GET /api/student/lessons?start=ISO&end=ISO
 * Lista aulas do aluno logado (matrícula vinculada ao user). Período obrigatório.
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireStudent } from '@/lib/auth'

export async function GET(request: NextRequest) {
  try {
    const auth = await requireStudent(request)
    if (!auth.authorized || !auth.session) {
      return NextResponse.json(
        { ok: false, message: auth.message || 'Não autorizado' },
        { status: auth.session ? 403 : 401 }
      )
    }

    const { searchParams } = new URL(request.url)
    const startParam = searchParams.get('start')
    const endParam = searchParams.get('end')

    if (!startParam || !endParam) {
      return NextResponse.json(
        { ok: false, message: 'Parâmetros start e end são obrigatórios' },
        { status: 400 }
      )
    }

    const startAt = new Date(startParam)
    const endAt = new Date(endParam)
    if (Number.isNaN(startAt.getTime()) || Number.isNaN(endAt.getTime())) {
      return NextResponse.json(
        { ok: false, message: 'Datas inválidas' },
        { status: 400 }
      )
    }

    const enrollments = await prisma.enrollment.findMany({
      where: { userId: auth.session.userId },
      select: { id: true },
    })
    const enrollmentIds = enrollments.map((e) => e.id)
    if (enrollmentIds.length === 0) {
      return NextResponse.json({
        ok: true,
        data: { lessons: [] },
      })
    }

    const lessons = await prisma.lesson.findMany({
      where: {
        enrollmentId: { in: enrollmentIds },
        startAt: { gte: startAt, lte: endAt },
      },
      include: {
        enrollment: { select: { id: true, nome: true, tipoAula: true, nomeGrupo: true } },
        teacher: { select: { id: true, nome: true } },
      },
      orderBy: { startAt: 'asc' },
    })

    const list = lessons.map((l) => ({
      id: l.id,
      enrollmentId: l.enrollmentId,
      teacherId: l.teacherId,
      status: l.status,
      startAt: l.startAt.toISOString(),
      durationMinutes: l.durationMinutes ?? 60,
      notes: l.notes,
      enrollment: l.enrollment,
      teacher: l.teacher,
    }))

    return NextResponse.json({
      ok: true,
      data: { lessons: list },
    })
  } catch (error) {
    console.error('[api/student/lessons GET]', error)
    return NextResponse.json(
      { ok: false, message: 'Erro ao listar aulas' },
      { status: 500 }
    )
  }
}
