/**
 * GET /api/admin/teachers/[id]/transfer/available-teachers
 * Lista professores disponíveis que têm todos os horários necessários para receber as aulas do professor.
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/auth'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAdmin(_request)
    if (!auth.authorized) {
      return NextResponse.json(
        { ok: false, message: auth.message || 'Não autorizado' },
        { status: auth.message?.includes('Não autenticado') ? 401 : 403 }
      )
    }

    const { id: sourceTeacherId } = await params
    const { searchParams } = new URL(_request.url)
    const startDateParam = searchParams.get('startDate')
    
    // Data de início para filtrar aulas (padrão: hoje)
    let startDate = new Date()
    startDate.setHours(0, 0, 0, 0)
    if (startDateParam) {
      const parsedDate = new Date(startDateParam)
      if (!Number.isNaN(parsedDate.getTime())) {
        parsedDate.setHours(0, 0, 0, 0)
        startDate = parsedDate
      }
    }

    // Buscar todas as aulas do professor origem a partir da data selecionada
    // Para calcular slots necessários, consideramos apenas aulas não canceladas
    // Mas vamos transferir TODAS as aulas (incluindo canceladas)
    const lessons = await prisma.lesson.findMany({
      where: {
        teacherId: sourceTeacherId,
        startAt: { gte: startDate },
        status: { not: 'CANCELLED' }, // Apenas aulas não canceladas para calcular slots necessários
      },
      select: {
        startAt: true,
        durationMinutes: true,
      },
    })

    if (lessons.length === 0) {
      return NextResponse.json({
        ok: true,
        data: { teachers: [] },
      })
    }

    // Extrair todos os horários únicos necessários (dayOfWeek + startMinutes + endMinutes)
    // Baseado apenas em aulas não canceladas
    const requiredSlots = new Set<string>()
    for (const l of lessons) {
      const start = new Date(l.startAt)
      const dayOfWeek = start.getDay()
      const startMinutes = start.getHours() * 60 + start.getMinutes()
      const endMinutes = startMinutes + (l.durationMinutes || 60)
      requiredSlots.add(`${dayOfWeek}-${startMinutes}-${endMinutes}`)
    }

    // Buscar todos os professores ativos (exceto o origem)
    const allTeachers = await prisma.teacher.findMany({
      where: {
        id: { not: sourceTeacherId },
        status: 'ACTIVE',
      },
      select: {
        id: true,
        nome: true,
      },
    })

    // Para cada professor, verificar se tem todos os slots necessários disponíveis
    const availableTeachers: Array<{ id: string; nome: string }> = []

    for (const teacher of allTeachers) {
      // Buscar slots de disponibilidade do professor
      const slots = await prisma.teacherAvailabilitySlot.findMany({
        where: { teacherId: teacher.id },
        select: { dayOfWeek: true, startMinutes: true, endMinutes: true },
      })

      // Buscar aulas existentes do professor destino para verificar conflitos (apenas a partir da data de início)
      const existingLessons = await prisma.lesson.findMany({
        where: {
          teacherId: teacher.id,
          status: { not: 'CANCELLED' },
          startAt: { gte: startDate },
        },
        select: {
          startAt: true,
          durationMinutes: true,
        },
      })

      // Verificar se todos os horários necessários estão disponíveis (sem conflitos)
      let allSlotsAvailable = true
      for (const slotKey of requiredSlots) {
        const [dayOfWeekStr, startMinutesStr, endMinutesStr] = slotKey.split('-')
        const dayOfWeek = parseInt(dayOfWeekStr, 10)
        const startMinutes = parseInt(startMinutesStr, 10)
        const endMinutes = parseInt(endMinutesStr, 10)

        // Verificar se está dentro dos slots de disponibilidade (se houver slots cadastrados)
        if (slots.length > 0) {
          const slotCovers = slots.some(
            (slot) =>
              slot.dayOfWeek === dayOfWeek &&
              startMinutes >= slot.startMinutes &&
              endMinutes <= slot.endMinutes
          )
          if (!slotCovers) {
            allSlotsAvailable = false
            break
          }
        }

        // Verificar se não há conflito com aulas existentes
        // Criar uma data de referência para calcular o horário
        const referenceDate = new Date()
        const dayDiff = dayOfWeek - referenceDate.getDay()
        referenceDate.setDate(referenceDate.getDate() + dayDiff)
        referenceDate.setHours(Math.floor(startMinutes / 60), startMinutes % 60, 0, 0)
        const slotStart = new Date(referenceDate)
        const slotEnd = new Date(referenceDate.getTime() + (endMinutes - startMinutes) * 60 * 1000)

        const hasConflict = existingLessons.some((l) => {
          const lessonStart = new Date(l.startAt)
          const lessonEnd = new Date(lessonStart.getTime() + (l.durationMinutes || 60) * 60 * 1000)
          // Verificar se há sobreposição (mesmo dia da semana e horários conflitantes)
          const lessonDayOfWeek = lessonStart.getDay()
          if (lessonDayOfWeek !== dayOfWeek) return false
          return slotStart < lessonEnd && slotEnd > lessonStart
        })

        if (hasConflict) {
          allSlotsAvailable = false
          break
        }
      }

      if (allSlotsAvailable) {
        availableTeachers.push({ id: teacher.id, nome: teacher.nome })
      }
    }

    return NextResponse.json({
      ok: true,
      data: { teachers: availableTeachers },
    })
  } catch (error) {
    console.error('[api/admin/teachers/[id]/transfer/available-teachers GET]', error)
    return NextResponse.json(
      { ok: false, message: 'Erro ao buscar professores disponíveis' },
      { status: 500 }
    )
  }
}
