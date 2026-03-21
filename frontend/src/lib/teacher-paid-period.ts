/**
 * Períodos de pagamento do professor já quitados (TeacherPaymentMonth com datas explícitas).
 * Mesma regra usada em /api/professor/lesson-records para bloquear registro em período fechado.
 */
export type TeacherPaidPeriodRow = {
  periodoInicio: Date | null
  periodoTermino: Date | null
}

/** true se o instante de início da aula está dentro de algum período [início, fim] marcado como pago */
export function isLessonStartInTeacherPaidPeriod(
  lessonStart: Date,
  paymentMonths: TeacherPaidPeriodRow[]
): boolean {
  const lessonTime = lessonStart.getTime()
  return paymentMonths.some((pm) => {
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
