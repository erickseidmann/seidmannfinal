/** Intervalos [start, start + duration) em minutos — sobreposição se um começa antes do outro terminar. */
export function lessonIntervalsOverlap(
  startA: Date,
  durationMinutesA: number,
  startB: Date,
  durationMinutesB: number
): boolean {
  const endA = new Date(startA.getTime() + durationMinutesA * 60 * 1000)
  const endB = new Date(startB.getTime() + durationMinutesB * 60 * 1000)
  return startA.getTime() < endB.getTime() && startB.getTime() < endA.getTime()
}
