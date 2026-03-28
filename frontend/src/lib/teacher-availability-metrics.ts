/**
 * Métricas de uso da disponibilidade cadastrada pelo professor (slots semanais)
 * no período de pagamento, em fuso America/Sao_Paulo.
 */

import { toDateKey } from '@/lib/finance'
import { getDayOfWeekInTZ, getTimeInTZ, ymdInTZ } from '@/lib/datetime'

export type TeacherAvailSlot = { dayOfWeek: number; startMinutes: number; endMinutes: number }

function mergeMinuteIntervals(intervals: { start: number; end: number }[]): { start: number; end: number }[] {
  if (intervals.length === 0) return []
  const sorted = [...intervals].sort((a, b) => a.start - b.start)
  const out: { start: number; end: number }[] = []
  let cur = { ...sorted[0] }
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].start <= cur.end) {
      cur.end = Math.max(cur.end, sorted[i].end)
    } else {
      out.push(cur)
      cur = { ...sorted[i] }
    }
  }
  out.push(cur)
  return out
}

function addDaysToYmd(ymd: string, days: number): string {
  const [y, m, d] = ymd.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d + days, 12, 0, 0))
  return ymdInTZ(dt)
}

function overlapMinutes(
  lessonStartMin: number,
  lessonEndMin: number,
  mergedSlots: { start: number; end: number }[]
): number {
  let total = 0
  for (const iv of mergedSlots) {
    const lo = Math.max(lessonStartMin, iv.start)
    const hi = Math.min(lessonEndMin, iv.end)
    if (hi > lo) total += hi - lo
  }
  return total
}

/**
 * % dos minutos de disponibilidade declarados no período que estão ocupados
 * por aulas (sobreposição com os slots do dia).
 * Retorna null se não houver slots cadastrados ou minutos disponíveis no período.
 */
export function computePercentHorariosDisponiveisUsados(params: {
  periodStartMs: number
  periodEndExclusiveMs: number
  holidaySet: Set<string>
  slots: TeacherAvailSlot[]
  lessons: { startAt: Date; durationMinutes: number | null }[]
}): number | null {
  const { periodStartMs, periodEndExclusiveMs, holidaySet, slots, lessons } = params

  if (slots.length === 0) return null

  const firstDayKey = ymdInTZ(new Date(periodStartMs))
  const lastDayKey = ymdInTZ(new Date(periodEndExclusiveMs - 1))

  let totalAvailMinutes = 0
  for (let dayKey = firstDayKey; dayKey <= lastDayKey; dayKey = addDaysToYmd(dayKey, 1)) {
    const d = new Date(`${dayKey}T12:00:00-03:00`)
    if (holidaySet.has(toDateKey(d))) continue
    const dow = getDayOfWeekInTZ(d)
    for (const s of slots) {
      if (s.dayOfWeek !== dow) continue
      totalAvailMinutes += s.endMinutes - s.startMinutes
    }
  }

  if (totalAvailMinutes <= 0) return null

  let usedMinutes = 0
  for (const lesson of lessons) {
    const key = ymdInTZ(lesson.startAt)
    if (key < firstDayKey || key > lastDayKey) continue
    if (holidaySet.has(toDateKey(lesson.startAt))) continue
    const dow = getDayOfWeekInTZ(lesson.startAt)
    const iso = lesson.startAt instanceof Date ? lesson.startAt.toISOString() : String(lesson.startAt)
    const t = getTimeInTZ(iso)
    const startMin = t.hour * 60 + t.minute
    const dur = lesson.durationMinutes ?? 60
    let endMin = startMin + dur
    if (endMin > 24 * 60) endMin = 24 * 60

    const daySlots = slots
      .filter((s) => s.dayOfWeek === dow)
      .map((s) => ({ start: s.startMinutes, end: s.endMinutes }))
    const merged = mergeMinuteIntervals(daySlots)
    usedMinutes += overlapMinutes(startMin, endMin, merged)
  }

  return Math.min(100, Math.round((100 * usedMinutes) / totalAvailMinutes))
}

/** Soma dos intervalos da grade semanal (cada slot conta uma vez por semana). */
export function totalWeeklyPatternAvailableMinutes(slots: TeacherAvailSlot[]): number {
  return slots.reduce((acc, s) => acc + (s.endMinutes - s.startMinutes), 0)
}

/**
 * Minutos de aula no intervalo [periodStartMs, periodEndExclusiveMs) que se sobrepõem
 * aos slots de disponibilidade (feriados excluídos por data da aula).
 */
export function computeUsedMinutesOverlappingSlots(
  lessons: { startAt: Date; durationMinutes: number | null }[],
  slots: TeacherAvailSlot[],
  periodStartMs: number,
  periodEndExclusiveMs: number,
  holidaySet: Set<string>
): number {
  if (slots.length === 0) return 0

  const firstDayKey = ymdInTZ(new Date(periodStartMs))
  const lastDayKey = ymdInTZ(new Date(periodEndExclusiveMs - 1))

  let usedMinutes = 0
  for (const lesson of lessons) {
    const key = ymdInTZ(lesson.startAt)
    if (key < firstDayKey || key > lastDayKey) continue
    if (holidaySet.has(toDateKey(lesson.startAt))) continue
    const dow = getDayOfWeekInTZ(lesson.startAt)
    const iso = lesson.startAt instanceof Date ? lesson.startAt.toISOString() : String(lesson.startAt)
    const t = getTimeInTZ(iso)
    const startMin = t.hour * 60 + t.minute
    const dur = lesson.durationMinutes ?? 60
    let endMin = startMin + dur
    if (endMin > 24 * 60) endMin = 24 * 60

    const daySlots = slots
      .filter((s) => s.dayOfWeek === dow)
      .map((s) => ({ start: s.startMinutes, end: s.endMinutes }))
    const merged = mergeMinuteIntervals(daySlots)
    usedMinutes += overlapMinutes(startMin, endMin, merged)
  }

  return usedMinutes
}
