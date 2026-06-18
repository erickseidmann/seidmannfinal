import { getDayOfWeekInTZ, getTimeInTZ } from '@/lib/datetime'

export type TeacherAvailabilitySlot = {
  dayOfWeek: number
  startMinutes: number
  endMinutes: number
}

/** Professor tem o intervalo [startMinutes, endMinutes] em todos os dias selecionados. Sem slots = disponível em qualquer horário. */
export function teacherMatchesAvailabilitySlots(
  slots: TeacherAvailabilitySlot[],
  dayOfWeeks: number[],
  startMinutes: number,
  endMinutes: number
): boolean {
  if (slots.length === 0) return true
  return dayOfWeeks.every((dow) =>
    slots.some(
      (slot) =>
        slot.dayOfWeek === dow &&
        startMinutes >= slot.startMinutes &&
        endMinutes <= slot.endMinutes
    )
  )
}

/** Aula agendada conflita com o horário semanal buscado (mesmo dia da semana em America/Sao_Paulo). */
export function lessonConflictsWithWeeklySlot(params: {
  lessonStartAt: Date
  durationMinutes: number
  dayOfWeeks: number[]
  slotStartMinutes: number
  slotEndMinutes: number
}): boolean {
  const { lessonStartAt, durationMinutes, dayOfWeeks, slotStartMinutes, slotEndMinutes } = params
  const dow = getDayOfWeekInTZ(lessonStartAt)
  if (!dayOfWeeks.includes(dow)) return false

  const { hour, minute } = getTimeInTZ(lessonStartAt.toISOString())
  const lessonStartMinutes = hour * 60 + minute
  const lessonEndMinutes = lessonStartMinutes + (durationMinutes ?? 60)

  return slotStartMinutes < lessonEndMinutes && slotEndMinutes > lessonStartMinutes
}
