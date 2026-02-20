/**
 * Lógica centralizada de cálculo do valor a pagar para professores.
 *
 * Regra: professor recebe por HORAS REGISTRADAS (LessonRecord), nunca por horas estimadas (Lesson).
 * Fórmula: valorAPagar = (horasRegistradas × valorPorHora) + valorPorPeriodo + valorExtra
 *
 * Exclusões: feriados (Holiday), aulas canceladas, alunos pausados
 * (enrollment.status === 'PAUSED' com aula em data >= pausedAt).
 */

/** Formato YYYY-MM-DD para comparação com Holiday.dateKey */
export function toDateKey(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** Registro de aula com dados mínimos para o cálculo de pagamento */
export interface PaymentRecord {
  tempoAulaMinutos: number | null
  lesson: {
    teacherId: string
    startAt: Date
    durationMinutes: number
    enrollment: {
      status: string
      pausedAt: Date | null
    }
  }
}

/**
 * Filtra registros excluindo aulas de alunos pausados quando a aula é em ou após a data de pausa.
 * Mantém: enrollment não PAUSED, ou pausedAt null, ou data da aula < pausedAt.
 */
export function filterRecordsByPausedEnrollment<T extends PaymentRecord>(records: T[]): T[] {
  return records.filter((r) => {
    const enrollment = r.lesson.enrollment
    if (enrollment.status === 'PAUSED' && enrollment.pausedAt) {
      const pausedAt = new Date(enrollment.pausedAt)
      pausedAt.setHours(0, 0, 0, 0)
      const lessonDate = new Date(r.lesson.startAt)
      lessonDate.setHours(0, 0, 0, 0)
      return lessonDate < pausedAt
    }
    return true
  })
}

export interface ComputeValorAPagarParams {
  records: PaymentRecord[]
  teacherId: string
  periodStart: number
  periodEnd: number
  holidaySet: Set<string>
  valorPorHora: number
  valorPorPeriodo: number
  valorExtra: number
}

export interface ComputeValorAPagarResult {
  totalMinutos: number
  totalHorasRegistradas: number
  valorAPagar: number
}

/**
 * Calcula o valor a pagar para um professor no período, usando apenas horas registradas (LessonRecord).
 * Exclui: aulas fora do período, em feriado, de outro professor.
 */
export function computeValorAPagar(params: ComputeValorAPagarParams): ComputeValorAPagarResult {
  const {
    records,
    teacherId,
    periodStart,
    periodEnd,
    holidaySet,
    valorPorHora,
    valorPorPeriodo,
    valorExtra,
  } = params

  let totalMinutos = 0
  for (const r of records) {
    if (r.lesson.teacherId !== teacherId) continue
    const startAt = new Date(r.lesson.startAt).getTime()
    if (startAt < periodStart || startAt > periodEnd) continue
    if (holidaySet.has(toDateKey(r.lesson.startAt))) continue
    const mins = r.tempoAulaMinutos ?? r.lesson.durationMinutes ?? 60
    totalMinutos += mins
  }

  const totalHorasRegistradas = Math.round((totalMinutos / 60) * 100) / 100
  const valorHoras = Math.round((totalHorasRegistradas * valorPorHora) * 100) / 100
  const valorAPagar = Math.round((valorHoras + valorPorPeriodo + valorExtra) * 100) / 100

  return {
    totalMinutos,
    totalHorasRegistradas,
    valorAPagar,
  }
}
