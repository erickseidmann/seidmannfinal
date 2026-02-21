/**
 * GET /api/admin/teachers-available
 * Retorna professores disponíveis para um dia/horário, sem conflito com outros alunos.
 * Params: enrollmentId, dayOfWeek (0-6), startMinutes, durationMinutes, startDate (ISO)
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/auth'

function mapIdiomaToCurso(idioma: string | null): string | null {
  if (!idioma) return null
  if (idioma === 'ENGLISH') return 'INGLES'
  if (idioma === 'SPANISH') return 'ESPANHOL'
  return idioma
}

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
    const enrollmentId = searchParams.get('enrollmentId')
    const dayOfWeekParam = searchParams.get('dayOfWeek')
    const startMinutesParam = searchParams.get('startMinutes')
    const durationMinutesParam = searchParams.get('durationMinutes')
    const startDateParam = searchParams.get('startDate')

    if (!enrollmentId || dayOfWeekParam == null || startMinutesParam == null || durationMinutesParam == null || !startDateParam) {
      return NextResponse.json(
        { ok: false, message: 'enrollmentId, dayOfWeek, startMinutes, durationMinutes e startDate são obrigatórios' },
        { status: 400 }
      )
    }

    const dayOfWeek = parseInt(dayOfWeekParam, 10)
    const startMinutes = parseInt(startMinutesParam, 10)
    const durationMinutes = parseInt(durationMinutesParam, 10)
    const startDate = new Date(startDateParam)

    if (Number.isNaN(dayOfWeek) || dayOfWeek < 0 || dayOfWeek > 6) {
      return NextResponse.json({ ok: false, message: 'dayOfWeek inválido (0-6)' }, { status: 400 })
    }
    if (Number.isNaN(startDate.getTime())) {
      return NextResponse.json({ ok: false, message: 'startDate inválido' }, { status: 400 })
    }

    const enrollment = await prisma.enrollment.findUnique({
      where: { id: enrollmentId },
      select: { idioma: true, curso: true },
    })
    if (!enrollment) {
      return NextResponse.json({ ok: false, message: 'Enrollment não encontrado' }, { status: 404 })
    }

    const curso = (enrollment as { curso?: string | null }).curso ?? mapIdiomaToCurso(enrollment.idioma)
    if (!curso) {
      return NextResponse.json({ ok: false, message: 'Enrollment sem idioma/curso definido' }, { status: 400 })
    }

    const endMinutes = startMinutes + durationMinutes

    const teachers = await prisma.teacher.findMany({
      where: { status: 'ACTIVE' },
      select: {
        id: true,
        nome: true,
        nomePreferido: true,
        idiomasEnsina: true,
        availabilitySlots: {
          select: { dayOfWeek: true, startMinutes: true, endMinutes: true },
        },
      },
    })

    const ensinaCurso = (t: { idiomasEnsina: unknown }) => {
      const ensina = Array.isArray(t.idiomasEnsina)
        ? (t.idiomasEnsina as string[])
        : t.idiomasEnsina
          ? [String(t.idiomasEnsina)]
          : []
      if (curso === 'INGLES') return ensina.includes('INGLES')
      if (curso === 'ESPANHOL') return ensina.includes('ESPANHOL')
      if (curso === 'INGLES_E_ESPANHOL') return ensina.includes('INGLES') || ensina.includes('ESPANHOL')
      return true
    }

    const disponivelNoHorario = (t: { availabilitySlots: { dayOfWeek: number; startMinutes: number; endMinutes: number }[] }) => {
      const slots = t.availabilitySlots
      if (!slots || slots.length === 0) return true
      return slots.some(
        (s) =>
          s.dayOfWeek === dayOfWeek &&
          startMinutes >= s.startMinutes &&
          endMinutes <= s.endMinutes
      )
    }

    let teachersFiltered = teachers
      .filter(ensinaCurso)
      .filter(disponivelNoHorario)

    const teacherIds = teachersFiltered.map((t) => t.id)

    if (teacherIds.length === 0) {
      return NextResponse.json({ ok: true, data: [] })
    }

    const startOfDay = new Date(startDate)
    startOfDay.setHours(0, 0, 0, 0)
    const startAt = new Date(startOfDay)
    startAt.setHours(Math.floor(startMinutes / 60), startMinutes % 60, 0, 0)
    const endAt = new Date(startAt.getTime() + durationMinutes * 60 * 1000)

    const windowStart = new Date(startAt.getTime() - 4 * 60 * 60 * 1000)
    const windowEnd = new Date(endAt.getTime() + 4 * 60 * 60 * 1000)

    const lessonsNoPeriodo = await prisma.lesson.findMany({
      where: {
        teacherId: { in: teacherIds },
        status: { not: 'CANCELLED' },
        startAt: { gte: windowStart, lte: windowEnd },
      },
      select: { teacherId: true, startAt: true, durationMinutes: true },
    })

    const idsOcupados = new Set<string>()
    for (const l of lessonsNoPeriodo) {
      const lessonStart = new Date(l.startAt)
      const lessonEnd = new Date(lessonStart.getTime() + (l.durationMinutes ?? 60) * 60 * 1000)
      if (startAt < lessonEnd && endAt > lessonStart) {
        idsOcupados.add(l.teacherId)
      }
    }

    const disponiveis = teachersFiltered
      .filter((t) => !idsOcupados.has(t.id))
      .map((t) => ({
        id: t.id,
        nome: t.nomePreferido || t.nome,
      }))

    return NextResponse.json({ ok: true, data: disponiveis })
  } catch (error) {
    console.error('[api/admin/teachers-available]', error)
    return NextResponse.json(
      { ok: false, message: 'Erro ao buscar professores disponíveis' },
      { status: 500 }
    )
  }
}
