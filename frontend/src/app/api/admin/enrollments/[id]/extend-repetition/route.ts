/**
 * PATCH /api/admin/enrollments/[id]/extend-repetition
 * Repete as aulas do aluno por mais um ano (52 semanas).
 * Usa o padrão das últimas aulas (por slot: dia/hora/professor) e cria novas aulas +1, +2, ... +52 semanas.
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/auth'

function overlap(
  startA: Date,
  durationA: number,
  startB: Date,
  durationB: number
): boolean {
  const endA = new Date(startA.getTime() + durationA * 60 * 1000)
  const endB = new Date(startB.getTime() + durationB * 60 * 1000)
  return startA.getTime() < endB.getTime() && startB.getTime() < endA.getTime()
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAdmin(request)
    if (!auth.authorized) {
      return NextResponse.json(
        { ok: false, message: auth.message || 'Não autorizado' },
        { status: auth.message?.includes('Não autenticado') ? 401 : 403 }
      )
    }

    const { id: enrollmentId } = await params

    const enrollment = await prisma.enrollment.findUnique({
      where: { id: enrollmentId },
      select: { id: true, nome: true, status: true },
    })

    if (!enrollment || enrollment.status !== 'ACTIVE') {
      return NextResponse.json(
        { ok: false, message: 'Enrollment não encontrado ou não está ativo' },
        { status: 404 }
      )
    }

    const lessons = await prisma.lesson.findMany({
      where: {
        enrollmentId,
        status: { not: 'CANCELLED' },
        teacherId: { not: null },
      },
      select: {
        id: true,
        startAt: true,
        durationMinutes: true,
        teacherId: true,
      },
      orderBy: { startAt: 'desc' },
    })

    if (lessons.length === 0) {
      return NextResponse.json(
        { ok: false, message: 'Nenhuma aula encontrada para repetir' },
        { status: 400 }
      )
    }

    // Agrupar por slot (dayOfWeek, minutesSinceMidnight, teacherId, duration) e pegar a última ocorrência
    const slotKey = (l: { startAt: Date; teacherId: string | null; durationMinutes: number }) => {
      const d = new Date(l.startAt)
      const day = d.getDay()
      const mins = d.getHours() * 60 + d.getMinutes()
      return `${day}-${mins}-${l.teacherId}-${l.durationMinutes}`
    }

    const templates: { startAt: Date; teacherId: string; durationMinutes: number }[] = []
    const seen = new Set<string>()
    for (const l of lessons) {
      if (!l.teacherId) continue
      const key = slotKey(l)
      if (seen.has(key)) continue
      seen.add(key)
      templates.push({
        startAt: new Date(l.startAt),
        teacherId: l.teacherId,
        durationMinutes: l.durationMinutes ?? 60,
      })
    }

    const createdByName = auth.session?.sub
      ? (await prisma.user.findUnique({ where: { id: auth.session.sub }, select: { nome: true } }))?.nome ?? null
      : null

    const checkOverlap = async (
      lessonStart: Date,
      teacherIdParam: string,
      duration: number
    ): Promise<string | null> => {
      const windowStart = new Date(lessonStart)
      windowStart.setHours(windowStart.getHours() - 4)
      const windowEnd = new Date(lessonStart)
      windowEnd.setMinutes(windowEnd.getMinutes() + duration + 60)
      const existing = await prisma.lesson.findMany({
        where: {
          teacherId: teacherIdParam,
          status: { not: 'CANCELLED' },
          startAt: { gte: windowStart, lte: windowEnd },
        },
        select: { id: true, enrollmentId: true, startAt: true, durationMinutes: true },
      })
      for (const ex of existing) {
        if (!overlap(lessonStart, duration, ex.startAt, ex.durationMinutes ?? 60)) continue
        if (ex.enrollmentId === enrollmentId) return null
        return `O professor já tem outra aula neste horário (${ex.startAt.toLocaleString('pt-BR')}).`
      }
      return null
    }

    let created = 0
    const errors: string[] = []

    for (const t of templates) {
      for (let w = 1; w <= 52; w++) {
        const newStart = new Date(t.startAt)
        newStart.setDate(newStart.getDate() + 7 * w)
        const conflict = await checkOverlap(newStart, t.teacherId, t.durationMinutes)
        if (conflict) {
          errors.push(`Slot ${t.startAt.toLocaleDateString('pt-BR')} + ${w} sem: ${conflict}`)
          continue
        }
        await prisma.lesson.create({
          data: {
            enrollmentId,
            teacherId: t.teacherId,
            status: 'CONFIRMED',
            startAt: newStart,
            durationMinutes: t.durationMinutes,
            notes: null,
            createdById: auth.session?.sub ?? null,
            createdByName,
          },
        })
        created++
      }
    }

    return NextResponse.json({
      ok: true,
      data: {
        message: `${created} aula(s) criada(s) para repetir por mais um ano.`,
        created,
        errors: errors.length > 0 ? errors : undefined,
      },
    })
  } catch (error) {
    console.error('[api/admin/enrollments/[id]/extend-repetition PATCH]', error)
    return NextResponse.json(
      { ok: false, message: 'Erro ao repetir aulas por mais um ano' },
      { status: 500 }
    )
  }
}
