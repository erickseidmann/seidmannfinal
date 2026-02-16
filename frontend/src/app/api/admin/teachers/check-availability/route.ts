/**
 * GET /api/admin/teachers/check-availability?datetime=ISO&durationMinutes=60&teacherId=xxx&excludeLessonId=xxx
 * Verifica se o professor está disponível nesse dia/hora.
 * - teacherId é obrigatório.
 * - Sem slots cadastrados = disponível em qualquer horário.
 * - Com slots = disponível só se a aula inteira (início + duração) couber dentro de algum slot.
 * - Se já tem outra aula no mesmo horário (sobreposição), indisponível e retorna reason.
 * Resposta: { ok: true, available: boolean, reason?: string }
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
    const teacherId = searchParams.get('teacherId')
    const datetimeParam = searchParams.get('datetime')
    const durationMinutes = Math.max(0, parseInt(searchParams.get('durationMinutes') ?? '60', 10) || 60)
    const excludeLessonId = searchParams.get('excludeLessonId') ?? null

    if (!teacherId || !teacherId.trim()) {
      return NextResponse.json(
        { ok: false, message: 'teacherId is required' },
        { status: 400 }
      )
    }

    if (!datetimeParam) {
      return NextResponse.json(
        { ok: false, message: 'Parâmetro datetime (ISO) é obrigatório' },
        { status: 400 }
      )
    }
    const dt = new Date(datetimeParam)
    if (Number.isNaN(dt.getTime())) {
      return NextResponse.json(
        { ok: false, message: 'Data/hora inválida' },
        { status: 400 }
      )
    }
    // Interpretar o horário sempre no fuso de Campinas (America/Sao_Paulo)
    const TZ = 'America/Sao_Paulo'

    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: TZ,
      weekday: 'short',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).formatToParts(dt)

    const weekday = parts.find((p) => p.type === 'weekday')?.value
    const hourStr = parts.find((p) => p.type === 'hour')?.value ?? '0'
    const minuteStr = parts.find((p) => p.type === 'minute')?.value ?? '0'

    const dayMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }
    const dayOfWeek = dayMap[weekday ?? ''] ?? 0
    const minutesOfDay = parseInt(hourStr, 10) * 60 + parseInt(minuteStr, 10)

    const startAt = new Date(dt)
    const endAt = new Date(dt.getTime() + durationMinutes * 60 * 1000)

    const slots = await prisma.teacherAvailabilitySlot.findMany({
      where: { teacherId },
      select: { dayOfWeek: true, startMinutes: true, endMinutes: true },
    })

    const existingLessons = await prisma.lesson.findMany({
      where: {
        teacherId,
        status: { not: 'CANCELLED' },
        ...(excludeLessonId ? { id: { not: excludeLessonId } } : {}),
      },
      select: {
        startAt: true,
        durationMinutes: true,
        enrollment: { select: { nome: true } },
      },
    })

    for (const l of existingLessons) {
      const lessonStart = new Date(l.startAt)
      const lessonEnd = new Date(lessonStart.getTime() + (l.durationMinutes ?? 60) * 60 * 1000)
      if (startAt < lessonEnd && endAt > lessonStart) {
        const studentName = (l.enrollment as { nome: string })?.nome ?? 'aluno'
        return NextResponse.json({
          ok: true,
          available: false,
          reason: `Já tem aula nesse horário com ${studentName}`,
        })
      }
    }

    if (!slots.length) {
      return NextResponse.json({ ok: true, available: true })
    }

    const inSlot = slots.some(
      (slot) =>
        slot.dayOfWeek === dayOfWeek &&
        minutesOfDay >= slot.startMinutes &&
        (minutesOfDay + durationMinutes) <= slot.endMinutes
    )

    if (!inSlot) {
      return NextResponse.json({
        ok: true,
        available: false,
        reason: 'Fora do horário de disponibilidade do professor',
      })
    }

    return NextResponse.json({ ok: true, available: true })
  } catch (error) {
    console.error('[api/admin/teachers/check-availability GET]', error)
    return NextResponse.json(
      { ok: false, message: 'Erro ao verificar disponibilidade' },
      { status: 500 }
    )
  }
}
