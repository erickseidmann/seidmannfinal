/**
 * GET /api/student/teacher-availability?teacherId=xxx&dayOfWeek=X&durationMinutes=Y
 * Buscar horários disponíveis do professor
 * - Sem dayOfWeek: retorna os dias da semana que o professor tem disponibilidade
 * - Com dayOfWeek: retorna os horários disponíveis daquele dia, excluindo horários já ocupados
 * Apenas alunos autenticados podem acessar
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireStudent } from '@/lib/auth'

export async function GET(request: NextRequest) {
  try {
    const auth = await requireStudent(request)
    if (!auth.authorized) {
      return NextResponse.json(
        { ok: false, message: auth.message || 'Não autorizado' },
        { status: auth.message?.includes('Não autenticado') ? 401 : 403 }
      )
    }

    const { searchParams } = new URL(request.url)
    const teacherId = searchParams.get('teacherId')
    const dayOfWeekParam = searchParams.get('dayOfWeek')
    const durationMinutes = parseInt(searchParams.get('durationMinutes') || '60', 10) || 60
    const lessonId = searchParams.get('lessonId') // ID da aula original para saber a data mínima

    if (!teacherId) {
      return NextResponse.json(
        { ok: false, message: 'teacherId é obrigatório' },
        { status: 400 }
      )
    }

    // Buscar a aula original se lessonId foi fornecido
    let originalLessonDate: Date | null = null
    if (lessonId) {
      const lesson = await prisma.lesson.findUnique({
        where: { id: lessonId },
        select: { startAt: true },
      })
      if (lesson) {
        originalLessonDate = new Date(lesson.startAt)
        originalLessonDate.setHours(0, 0, 0, 0)
      }
    }

    // Buscar slots de disponibilidade do professor
    const slots = await prisma.teacherAvailabilitySlot.findMany({
      where: { teacherId },
      select: {
        dayOfWeek: true,
        startMinutes: true,
        endMinutes: true,
      },
      orderBy: [
        { dayOfWeek: 'asc' },
        { startMinutes: 'asc' },
      ],
    })

    // Buscar feriados
    const holidays = await prisma.holiday.findMany({
      select: { dateKey: true },
    })
    const holidaySet = new Set(holidays.map(h => h.dateKey))

    // Verificar se a aula original está em feriado
    if (originalLessonDate) {
      const originalDateKey = originalLessonDate.toISOString().split('T')[0]
      if (holidaySet.has(originalDateKey)) {
        return NextResponse.json({
          ok: false,
          message: 'Não é possível reagendar uma aula que está em um feriado',
        }, { status: 400 })
      }
    }

    // Se não especificou data específica, retornar todas as datas disponíveis dos próximos 3 meses
    if (!dayOfWeekParam) {
      // Data mínima: dia da aula original (ou hoje se não houver aula original)
      const minDate = originalLessonDate || (() => {
        const hoje = new Date()
        hoje.setHours(0, 0, 0, 0)
        return hoje
      })()
      
      const tresMesesDepois = new Date(minDate)
      tresMesesDepois.setMonth(minDate.getMonth() + 3)
      
      // Buscar aulas já agendadas
      const existingLessons = await prisma.lesson.findMany({
        where: {
          teacherId,
          status: { not: 'CANCELLED' },
          startAt: {
            gte: minDate,
            lte: tresMesesDepois,
          },
        },
        select: {
          startAt: true,
          durationMinutes: true,
        },
      })
      
      // Gerar todas as datas disponíveis baseadas nos slots do professor
      const availableDates: string[] = []
      const availableDaysSet = new Set(slots.map(s => s.dayOfWeek))
      
      for (let d = new Date(minDate); d <= tresMesesDepois; d.setDate(d.getDate() + 1)) {
        const dateKey = d.toISOString().split('T')[0]
        
        // Pular feriados
        if (holidaySet.has(dateKey)) {
          continue
        }
        const dayOfWeek = d.getDay()
        if (availableDaysSet.has(dayOfWeek)) {
          // Verificar se há algum slot disponível neste dia
          const daySlots = slots.filter(s => s.dayOfWeek === dayOfWeek)
          if (daySlots.length > 0) {
            // Verificar se há pelo menos um horário livre neste dia
            let hasAvailableSlot = false
            for (const slot of daySlots) {
              let currentMin = slot.startMinutes
              while (currentMin + durationMinutes <= slot.endMinutes && !hasAvailableSlot) {
                const checkDate = new Date(d)
                checkDate.setHours(Math.floor(currentMin / 60), currentMin % 60, 0, 0)
                const slotEnd = new Date(checkDate.getTime() + durationMinutes * 60 * 1000)
                
                // Verificar conflito
                let hasConflict = false
                for (const lesson of existingLessons) {
                  const lessonStart = new Date(lesson.startAt)
                  const lessonEnd = new Date(lessonStart.getTime() + (lesson.durationMinutes || 60) * 60 * 1000)
                  if (checkDate < lessonEnd && slotEnd > lessonStart) {
                    hasConflict = true
                    break
                  }
                }
                
                if (!hasConflict) {
                  hasAvailableSlot = true
                  break
                }
                
                currentMin += 30
              }
              if (hasAvailableSlot) break
            }
            
            if (hasAvailableSlot) {
              availableDates.push(d.toISOString().split('T')[0]) // Formato YYYY-MM-DD
            }
          }
        }
      }
      
      return NextResponse.json({
        ok: true,
        availableDates, // Array de datas no formato YYYY-MM-DD
      })
    }

    // Se especificou data específica (formato YYYY-MM-DD), retornar horários disponíveis daquele dia
    let targetDate: Date | null = null
    let dayOfWeek: number | null = null
    
    // Tentar parsear como data (YYYY-MM-DD)
    if (dayOfWeekParam.match(/^\d{4}-\d{2}-\d{2}$/)) {
      targetDate = new Date(dayOfWeekParam + 'T00:00:00')
      if (!isNaN(targetDate.getTime())) {
        dayOfWeek = targetDate.getDay()
      }
    } else {
      // Fallback: tentar como dayOfWeek (0-6)
      dayOfWeek = parseInt(dayOfWeekParam, 10)
      if (isNaN(dayOfWeek) || dayOfWeek < 0 || dayOfWeek > 6) {
        return NextResponse.json(
          { ok: false, message: 'Data ou dayOfWeek inválido' },
          { status: 400 }
        )
      }
    }
    
    if (dayOfWeek === null) {
      return NextResponse.json(
        { ok: false, message: 'Data inválida' },
        { status: 400 }
      )
    }

    // Filtrar slots do dia especificado
    const daySlots = slots.filter(s => s.dayOfWeek === dayOfWeek!)

    if (daySlots.length === 0) {
      return NextResponse.json({
        ok: true,
        slots: [],
      })
    }

    // Se temos uma data específica, usar ela. Senão, buscar para o próximo dia da semana
    const checkDate = targetDate || (() => {
      const minDate = originalLessonDate || (() => {
        const hoje = new Date()
        hoje.setHours(0, 0, 0, 0)
        return hoje
      })()
      const currentDay = minDate.getDay()
      let daysUntilSlot = dayOfWeek! - currentDay
      if (daysUntilSlot < 0) daysUntilSlot += 7
      const date = new Date(minDate)
      date.setDate(minDate.getDate() + daysUntilSlot)
      return date
    })()
    
    checkDate.setHours(0, 0, 0, 0)
    const dateKey = checkDate.toISOString().split('T')[0]
    
    // Verificar se a data selecionada é feriado
    if (holidaySet.has(dateKey)) {
      return NextResponse.json({
        ok: false,
        message: 'Não é possível agendar uma reposição em um feriado',
      }, { status: 400 })
    }
    
    // Verificar se a data selecionada é anterior à aula original
    if (originalLessonDate && checkDate < originalLessonDate) {
      return NextResponse.json({
        ok: false,
        message: 'Não é possível agendar para uma data anterior à aula original',
      }, { status: 400 })
    }
    
    const endOfDay = new Date(checkDate)
    endOfDay.setHours(23, 59, 59, 999)

    // Buscar aulas já agendadas do professor para o dia específico
    const existingLessons = await prisma.lesson.findMany({
      where: {
        teacherId,
        status: { not: 'CANCELLED' },
        startAt: {
          gte: checkDate,
          lte: endOfDay,
        },
      },
      select: {
        startAt: true,
        durationMinutes: true,
      },
    })

    // Gerar horários disponíveis para o dia específico, excluindo os ocupados
    const availableSlots: Array<{
      startMinutes: number
      endMinutes: number
      startTime: string
      endTime: string
      date: string
    }> = []

    // Para cada slot do dia, gerar horários de 30 em 30 minutos
    for (const slot of daySlots) {
      let currentMin = slot.startMinutes
      
      while (currentMin + durationMinutes <= slot.endMinutes) {
        const slotStart = new Date(checkDate)
        slotStart.setHours(Math.floor(currentMin / 60), currentMin % 60, 0, 0)
        const slotEnd = new Date(slotStart.getTime() + durationMinutes * 60 * 1000)
        
        // Verificar conflito com aulas existentes
        let hasConflict = false
        for (const lesson of existingLessons) {
          const lessonStart = new Date(lesson.startAt)
          const lessonEnd = new Date(lessonStart.getTime() + (lesson.durationMinutes || 60) * 60 * 1000)
          
          // Se há sobreposição, este horário não está disponível
          if (slotStart < lessonEnd && slotEnd > lessonStart) {
            hasConflict = true
            break
          }
        }
        
        if (!hasConflict) {
          // Este horário está disponível
          availableSlots.push({
            startMinutes: currentMin,
            endMinutes: currentMin + durationMinutes,
            startTime: `${String(Math.floor(currentMin / 60)).padStart(2, '0')}:${String(currentMin % 60).padStart(2, '0')}`,
            endTime: `${String(Math.floor((currentMin + durationMinutes) / 60)).padStart(2, '0')}:${String((currentMin + durationMinutes) % 60).padStart(2, '0')}`,
            date: slotStart.toISOString(),
          })
        }
        
        currentMin += 30 // Incrementar de 30 em 30 minutos
      }
    }

    return NextResponse.json({
      ok: true,
      slots: availableSlots,
    })
  } catch (error) {
    console.error('[api/student/teacher-availability GET]', error)
    return NextResponse.json(
      { ok: false, message: 'Erro ao buscar disponibilidade do professor' },
      { status: 500 }
    )
  }
}
