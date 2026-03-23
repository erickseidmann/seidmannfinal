/**
 * Intervalos de datas de TeacherPaymentMonth (periodoInicio → periodoTermino, limites em UTC).
 * Usado para períodos PAGO (bloquear registro) e EM_ABERTO (alertas de registro atrasado no admin).
 */
export type TeacherPaidPeriodRow = {
  periodoInicio: Date | null
  periodoTermino: Date | null
}

/** true se o instante de início da aula está dentro de algum intervalo [início 00:00 UTC, fim 23:59:59.999 UTC] */
export function isLessonStartWithinTeacherPeriodRanges(
  lessonStart: Date,
  periods: TeacherPaidPeriodRow[]
): boolean {
  const lessonTime = lessonStart.getTime()
  return periods.some((pm) => {
    if (!pm.periodoInicio || !pm.periodoTermino) return false
    const s = new Date(pm.periodoInicio)
    s.setUTCHours(0, 0, 0, 0)
    const e = new Date(pm.periodoTermino)
    e.setUTCHours(23, 59, 59, 999)
    const start = s.getTime()
    const end = e.getTime()
    return lessonTime >= start && lessonTime <= end
  })
}

/** Período já quitado (lista de rows só PAGO) — bloqueio de registro pelo professor */
export function isLessonStartInTeacherPaidPeriod(
  lessonStart: Date,
  paymentMonths: TeacherPaidPeriodRow[]
): boolean {
  return isLessonStartWithinTeacherPeriodRanges(lessonStart, paymentMonths)
}
