import {
  lessonConflictsWithWeeklySlot,
  teacherMatchesAvailabilitySlots,
} from '@/lib/teacher-free-slots'

describe('teacherMatchesAvailabilitySlots', () => {
  it('sem slots cadastrados considera disponível em qualquer horário', () => {
    expect(teacherMatchesAvailabilitySlots([], [1, 3], 540, 600)).toBe(true)
  })

  it('exige slot em todos os dias selecionados', () => {
    const slots = [{ dayOfWeek: 1, startMinutes: 480, endMinutes: 720 }]
    expect(teacherMatchesAvailabilitySlots(slots, [1], 540, 600)).toBe(true)
    expect(teacherMatchesAvailabilitySlots(slots, [1, 3], 540, 600)).toBe(false)
  })
})

describe('lessonConflictsWithWeeklySlot', () => {
  it('detecta conflito na segunda-feira 09:00 em America/Sao_Paulo', () => {
    const lessonStartAt = new Date('2026-06-15T12:00:00.000Z') // seg 09:00 BRT
    expect(
      lessonConflictsWithWeeklySlot({
        lessonStartAt,
        durationMinutes: 60,
        dayOfWeeks: [1],
        slotStartMinutes: 540,
        slotEndMinutes: 600,
      })
    ).toBe(true)
  })

  it('não confunde terça com segunda', () => {
    const lessonStartAt = new Date('2026-06-16T12:00:00.000Z') // ter 09:00 BRT
    expect(
      lessonConflictsWithWeeklySlot({
        lessonStartAt,
        durationMinutes: 60,
        dayOfWeeks: [1],
        slotStartMinutes: 540,
        slotEndMinutes: 600,
      })
    ).toBe(false)
  })

  it('detecta sobreposição parcial', () => {
    const lessonStartAt = new Date('2026-06-15T12:30:00.000Z') // seg 09:30 BRT
    expect(
      lessonConflictsWithWeeklySlot({
        lessonStartAt,
        durationMinutes: 60,
        dayOfWeeks: [1],
        slotStartMinutes: 540,
        slotEndMinutes: 600,
      })
    ).toBe(true)
  })
})
