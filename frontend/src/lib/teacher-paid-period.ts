/**
 * Intervalos de datas de TeacherPaymentMonth (periodoInicio → periodoTermino, limites em UTC).
 * Usado para períodos PAGO (bloquear registro) e EM_ABERTO (alertas de registro atrasado no admin).
 */
export type TeacherPaidPeriodRow = {
  periodoInicio: Date | null
  periodoTermino: Date | null
}

/**
 * Limites do período de pagamento (mesma convenção de isLessonStartWithinTeacherPeriodRanges):
 * [startMs, endExclusiveMs) — o dia de periodoTermino (00:00 UTC) já é do próximo ciclo.
 */
export function teacherPaymentPeriodBoundsUtc(
  periodoInicio: Date | null,
  periodoTermino: Date | null
): { startMs: number; endExclusiveMs: number } | null {
  if (!periodoInicio || !periodoTermino) return null
  const s = new Date(periodoInicio)
  s.setUTCHours(0, 0, 0, 0)
  const e = new Date(periodoTermino)
  e.setUTCHours(0, 0, 0, 0)
  return { startMs: s.getTime(), endExclusiveMs: e.getTime() }
}

/** Mês civil em UTC: [1º dia 00:00 UTC, 1º do mês seguinte 00:00 UTC exclusivo). */
export function calendarMonthBoundsUtc(year: number, month: number): { startMs: number; endExclusiveMs: number } {
  const s = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0, 0))
  const e = new Date(Date.UTC(year, month, 1, 0, 0, 0, 0))
  return { startMs: s.getTime(), endExclusiveMs: e.getTime() }
}

/** true se o instante de início da aula está dentro de algum intervalo [início 00:00 UTC, fim 00:00 UTC exclusivo] */
export function isLessonStartWithinTeacherPeriodRanges(
  lessonStart: Date,
  periods: TeacherPaidPeriodRow[]
): boolean {
  const lessonTime = lessonStart.getTime()
  return periods.some((pm) => {
    const b = teacherPaymentPeriodBoundsUtc(pm.periodoInicio, pm.periodoTermino)
    if (!b) return false
    return lessonTime >= b.startMs && lessonTime < b.endExclusiveMs
  })
}

/** Período já quitado (lista de rows só PAGO) — bloqueio de registro pelo professor */
export function isLessonStartInTeacherPaidPeriod(
  lessonStart: Date,
  paymentMonths: TeacherPaidPeriodRow[]
): boolean {
  return isLessonStartWithinTeacherPeriodRanges(lessonStart, paymentMonths)
}
