/** Semanas de repetição automática ao agendar aula no calendário (mesmo dia/hora). */
export const DEFAULT_LESSON_REPEAT_WEEKS = 52

export type LessonSeriesRef = {
  enrollmentId: string
  teacherId: string | null
  day: number
  hours: number
  minutes: number
}

export function lessonSeriesRefFromStartAt(
  enrollmentId: string,
  teacherId: string | null,
  startAt: Date
): LessonSeriesRef {
  return {
    enrollmentId,
    teacherId,
    day: startAt.getDay(),
    hours: startAt.getHours(),
    minutes: startAt.getMinutes(),
  }
}

export function matchesLessonSeries(startAt: Date, teacherId: string | null, ref: LessonSeriesRef): boolean {
  return (
    teacherId === ref.teacherId &&
    startAt.getDay() === ref.day &&
    startAt.getHours() === ref.hours &&
    startAt.getMinutes() === ref.minutes
  )
}

/** Recalcula data/hora de uma ocorrência futura da série após mudança na aula de referência. */
export function computeRescheduledSeriesStartAt(
  originalRefStart: Date,
  occurrenceStart: Date,
  newRefStart: Date
): Date {
  const refDow = originalRefStart.getDay()
  const newDow = newRefStart.getDay()
  const dayShift = (newDow - refDow + 7) % 7
  const msPerWeek = 7 * 24 * 60 * 60 * 1000
  const weeksDiff = Math.round((occurrenceStart.getTime() - originalRefStart.getTime()) / msPerWeek)

  const result = new Date(originalRefStart)
  result.setDate(result.getDate() + weeksDiff * 7 + dayShift)
  result.setHours(newRefStart.getHours(), newRefStart.getMinutes(), 0, 0)
  return result
}
