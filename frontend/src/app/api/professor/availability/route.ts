/**
 * API Route: GET /api/professor/availability
 * 
 * Retorna os slots de disponibilidade do professor logado
 */

import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
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

    const slots = await prisma.teacherAvailabilitySlot.findMany({
      where: { teacherId: teacher.id },
      orderBy: [{ dayOfWeek: 'asc' }, { startMinutes: 'asc' }],
    })

    return NextResponse.json({
      ok: true,
      data: {
        slots: slots.map((s) => ({
          id: s.id,
          dayOfWeek: s.dayOfWeek,
          startMinutes: s.startMinutes,
          endMinutes: s.endMinutes,
        })),
      },
    })
  } catch (error) {
    console.error('[api/professor/availability GET]', error)
    const detail = error instanceof Error ? error.message : String(error)
    const message =
      process.env.NODE_ENV === 'development'
        ? `Erro ao buscar disponibilidade: ${detail}`
        : 'Erro ao buscar disponibilidade. Tente novamente.'
    return NextResponse.json(
      { ok: false, message },
      { status: 500 }
    )
  }
}

/** PUT: substitui todos os horários de disponibilidade do professor logado */
export async function PUT(request: NextRequest) {
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
    const teacherId = teacher.id

    const body = await request.json().catch(() => ({}))
    const slots = Array.isArray(body.slots) ? body.slots : []
    const confirmRedirect = body.confirmRedirect === true
    const valid = slots.every(
      (s: unknown) =>
        typeof s === 'object' &&
        s != null &&
        typeof (s as { dayOfWeek?: unknown }).dayOfWeek === 'number' &&
        typeof (s as { startMinutes?: unknown }).startMinutes === 'number' &&
        typeof (s as { endMinutes?: unknown }).endMinutes === 'number'
    )
    if (!valid) {
      return NextResponse.json(
        { ok: false, message: 'Body deve conter slots: [{ dayOfWeek, startMinutes, endMinutes }]' },
        { status: 400 }
      )
    }
    for (const s of slots as { dayOfWeek: number; startMinutes: number; endMinutes: number }[]) {
      if (
        s.dayOfWeek < 0 || s.dayOfWeek > 6 ||
        s.startMinutes < 0 || s.startMinutes > 1439 ||
        s.endMinutes < 0 || s.endMinutes > 1439 ||
        s.startMinutes >= s.endMinutes
      ) {
        return NextResponse.json(
          { ok: false, message: 'Cada slot deve ter dayOfWeek 0-6, startMinutes e endMinutes válidos (início < fim)' },
          { status: 400 }
        )
      }
    }

    if (slots.length > 0 && !confirmRedirect) {
      const hoje = new Date()
      hoje.setHours(0, 0, 0, 0)
      const lessons = await prisma.lesson.findMany({
        where: {
          teacherId,
          status: { not: 'CANCELLED' },
          startAt: { gte: hoje },
        },
        select: {
          id: true,
          enrollmentId: true,
          startAt: true,
          durationMinutes: true,
          enrollment: { select: { nome: true } },
        },
      })
      const allOutside: Array<{ lesson: typeof lessons[0]; dayOfWeek: number; startMinutes: number; endMinutes: number }> = []
      for (const lesson of lessons) {
        const lessonStart = new Date(lesson.startAt)
        const dayOfWeek = lessonStart.getDay()
        const startMinutes = lessonStart.getHours() * 60 + lessonStart.getMinutes()
        const durationMinutes = lesson.durationMinutes ?? 60
        const endMinutes = startMinutes + durationMinutes
        const isWithinSlot = slots.some(
          (slot: { dayOfWeek: number; startMinutes: number; endMinutes: number }) =>
            slot.dayOfWeek === dayOfWeek &&
            startMinutes >= slot.startMinutes &&
            endMinutes <= slot.endMinutes
        )
        if (!isWithinSlot) {
          allOutside.push({ lesson, dayOfWeek, startMinutes, endMinutes })
        }
      }
      if (allOutside.length > 0) {
        const twoWeeksEnd = new Date(hoje)
        twoWeeksEnd.setDate(twoWeeksEnd.getDate() + 14)
        twoWeeksEnd.setHours(23, 59, 59, 999)
        const conflictsForDisplay = allOutside.filter((o) => new Date(o.lesson.startAt) <= twoWeeksEnd)
        const diasSemana = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']
        const conflicts = conflictsForDisplay.map((o) => {
          const startDate = new Date(o.lesson.startAt)
          return {
            aluno: o.lesson.enrollment?.nome ?? 'Aluno desconhecido',
            enrollmentId: o.lesson.enrollmentId,
            startAt: o.lesson.startAt,
            data: startDate.toLocaleDateString('pt-BR'),
            dia: diasSemana[o.dayOfWeek],
            horario: `${Math.floor(o.startMinutes / 60).toString().padStart(2, '0')}:${(o.startMinutes % 60).toString().padStart(2, '0')}`,
          }
        })
        return NextResponse.json(
          {
            ok: false,
            message: 'Você já tem aulas na agenda fora desses horários. Os alunos serão redirecionados para outros professores.',
            conflicts,
          },
          { status: 400 }
        )
      }
    }

    let redirectedSummary: Array<{ aluno: string }> | null = null
    if (confirmRedirect && slots.length > 0) {
      const hoje = new Date()
      hoje.setHours(0, 0, 0, 0)
      const lessonsRedirect = await prisma.lesson.findMany({
        where: {
          teacherId,
          status: { not: 'CANCELLED' },
          startAt: { gte: hoje },
        },
        select: {
          id: true,
          enrollmentId: true,
          startAt: true,
          durationMinutes: true,
          enrollment: { select: { nome: true } },
        },
      })
      const outside = lessonsRedirect.filter((lesson) => {
        const lessonStart = new Date(lesson.startAt)
        const dayOfWeek = lessonStart.getDay()
        const startMinutes = lessonStart.getHours() * 60 + lessonStart.getMinutes()
        const endMinutes = startMinutes + (lesson.durationMinutes ?? 60)
        return !(slots as { dayOfWeek: number; startMinutes: number; endMinutes: number }[]).some(
          (slot) =>
            slot.dayOfWeek === dayOfWeek &&
            startMinutes >= slot.startMinutes &&
            endMinutes <= slot.endMinutes
        )
      })
      const byEnrollment = new Map<string, string>()
      for (const o of outside) {
        const nome = o.enrollment?.nome ?? 'Aluno desconhecido'
        if (!byEnrollment.has(o.enrollmentId)) byEnrollment.set(o.enrollmentId, nome)
      }
      redirectedSummary = Array.from(byEnrollment.values()).map((aluno) => ({ aluno }))
      // Remover o professor dessas aulas a partir do dia da alteração (ficam sem professor para o admin redesignar)
      const lessonIdsOutside = outside.map((l) => l.id)
      if (lessonIdsOutside.length > 0) {
        await prisma.lesson.updateMany({
          where: { id: { in: lessonIdsOutside } },
          data: { teacherId: null },
        })
      }
    }

    await prisma.teacherAvailabilitySlot.deleteMany({ where: { teacherId } })
    if (slots.length > 0) {
      await prisma.teacherAvailabilitySlot.createMany({
        data: (slots as { dayOfWeek: number; startMinutes: number; endMinutes: number }[]).map((s) => ({
          teacherId,
          dayOfWeek: s.dayOfWeek,
          startMinutes: s.startMinutes,
          endMinutes: s.endMinutes,
        })),
      })
    }
    const slotsSnapshot = (slots as { dayOfWeek: number; startMinutes: number; endMinutes: number }[]).map(
      (s) => ({ dayOfWeek: s.dayOfWeek, startMinutes: s.startMinutes, endMinutes: s.endMinutes })
    )
    try {
      await prisma.teacherAvailabilityLog.create({
        data: {
          teacherId,
          changedByUserId: null,
          slotsSnapshot: slotsSnapshot as unknown as object,
          studentsRedirected: confirmRedirect,
          redirectedSummary: redirectedSummary === null ? Prisma.JsonNull : redirectedSummary,
        },
      })
    } catch (logError) {
      console.warn('[api/professor/availability PUT] Falha ao registrar histórico (horários foram salvos):', logError)
    }
    const updated = await prisma.teacherAvailabilitySlot.findMany({
      where: { teacherId },
      orderBy: [{ dayOfWeek: 'asc' }, { startMinutes: 'asc' }],
    })
    return NextResponse.json({
      ok: true,
      data: {
        slots: updated.map((s) => ({
          id: s.id,
          dayOfWeek: s.dayOfWeek,
          startMinutes: s.startMinutes,
          endMinutes: s.endMinutes,
        })),
      },
    })
  } catch (error) {
    console.error('[api/professor/availability PUT]', error)
    const detail = error instanceof Error ? error.message : String(error)
    const message =
      process.env.NODE_ENV === 'development'
        ? `Erro ao salvar horários: ${detail}`
        : 'Erro ao salvar horários. Tente novamente.'
    return NextResponse.json(
      { ok: false, message },
      { status: 500 }
    )
  }
}
