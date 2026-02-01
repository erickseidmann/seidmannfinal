/**
 * GET /api/professor/lesson-records/ultima?enrollmentId=xxx
 * Retorna o último registro de aula para a matrícula (enrollment), entre as aulas deste professor.
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
      return NextResponse.json(
        { ok: false, message: 'Professor não encontrado' },
        { status: 404 }
      )
    }

    const { searchParams } = new URL(request.url)
    const enrollmentId = searchParams.get('enrollmentId')?.trim()
    if (!enrollmentId) {
      return NextResponse.json(
        { ok: false, message: 'enrollmentId é obrigatório' },
        { status: 400 }
      )
    }

    const lessonRecord = (prisma as { lessonRecord?: unknown }).lessonRecord
    if (!lessonRecord || typeof lessonRecord.findFirst !== 'function') {
      return NextResponse.json(
        { ok: false, message: 'Modelo LessonRecord não disponível' },
        { status: 503 }
      )
    }

    const records = await (prisma as any).lessonRecord.findMany({
      where: {
        lesson: {
          enrollmentId,
          teacherId: teacher.id,
        },
      },
      include: {
        studentPresences: {
          include: { enrollment: { select: { id: true, nome: true } } },
        },
        lesson: {
          include: {
            enrollment: { select: { id: true, nome: true, tipoAula: true, nomeGrupo: true } },
            teacher: { select: { id: true, nome: true } },
          },
        },
      },
      orderBy: { lesson: { startAt: 'desc' } },
      take: 1,
    })

    const record = records[0] ?? null
    return NextResponse.json({ ok: true, data: { record } })
  } catch (error) {
    console.error('[api/professor/lesson-records/ultima GET]', error)
    return NextResponse.json(
      { ok: false, message: 'Erro ao buscar última aula' },
      { status: 500 }
    )
  }
}
