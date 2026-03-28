/**
 * Intervalos de datas de TeacherPaymentMonth (periodoInicio → periodoTermino, limites em UTC).
 * Usado para períodos PAGO (bloquear registro) e EM_ABERTO (alertas de registro atrasado no admin).
 */
import { ymdInTZ } from './datetime'

export type TeacherPaidPeriodRow = {
  periodoInicio: Date | null
  periodoTermino: Date | null
}

/** Dia do mês (1–31) da âncora do ciclo no fuso Brasil. Evita usar só getUTCDate(): 28/02 no Brasil pode cair em 01/03 UTC. */
function dueDayFromPeriodAnchorBrazil(periodoInicio: Date): number {
  const ymd = ymdInTZ(periodoInicio)
  const parts = ymd.split('-').map(Number)
  const d = parts[2]
  if (d >= 1 && d <= 31) return d
  return new Date(periodoInicio).getUTCDate()
}

/**
 * Limites do período de pagamento (mesma convenção de isLessonStartWithinTeacherPeriodRanges):
 * [startMs, endExclusiveMs) — periodoTermino = 00:00 UTC do dia de pagamento (primeiro instante fora do período).
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

function lastDayOfMonthUtc(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate()
}

/**
 * Período de competência do mês de referência `year`/`month` (1–12), com pagamento no dia `dueDay`:
 * do dia `dueDay` do mês anterior até o **dia anterior** ao pagamento no mês atual (último dia com aula).
 *
 * Armazenamento: `periodoTermino` = 00:00 UTC do **dia de pagamento** no mês atual = primeiro instante
 * **fora** do período (fim exclusivo). Ex.: venc. 28/03 → aulas até 27/03 inclusive; termino = 28/03 00:00 UTC.
 */
export function teacherPaymentBoundsFromDueDay(
  year: number,
  month: number,
  dueDay: number
): { inicio: Date; termino: Date } {
  const safeDueCurrent = Math.min(Math.max(1, dueDay), lastDayOfMonthUtc(year, month))
  const pagamentoDate = new Date(Date.UTC(year, month - 1, safeDueCurrent))
  const termino = new Date(pagamentoDate.getTime())
  termino.setUTCHours(0, 0, 0, 0)
  const prev = month === 1 ? { year: year - 1, month: 12 } : { year, month: month - 1 }
  const safeDuePrev = Math.min(Math.max(1, dueDay), lastDayOfMonthUtc(prev.year, prev.month))
  const inicio = new Date(Date.UTC(prev.year, prev.month - 1, safeDuePrev))
  return { inicio, termino }
}

/** Dia de vencimento (1–31): prioriza o dia em `periodoInicio` (âncora do ciclo). */
export function inferDueDayUtcFromSavedPeriod(
  periodoInicio: Date | null,
  periodoTermino: Date | null
): number | null {
  if (periodoInicio) {
    const d = dueDayFromPeriodAnchorBrazil(periodoInicio)
    if (d >= 1 && d <= 31) return d
  }
  const b = teacherPaymentPeriodBoundsUtc(periodoInicio, periodoTermino)
  if (!b) return null
  const lastInclusiveMs = b.endExclusiveMs - 1
  if (lastInclusiveMs < b.startMs) return null
  return new Date(lastInclusiveMs).getUTCDate()
}

/**
 * Limites do TeacherPaymentMonth após corrigir dados legados: período que “vazava” até o fim do mês civil
 * (ex.: 28/02–31/03) quando o início já indica o dia de pagamento (ex.: 28).
 * Se o fim salvo for posterior ao ciclo canônico teacherPaymentBoundsFromDueDay, usa o ciclo canônico.
 *
 * Tenta `(year, month)` da linha e também o mês civil do último dia inclusivo — para quando a chave
 * do registro (ex. abril) não bate com o término civil do ciclo (ex. março).
 */
export function resolveTeacherPaymentMonthBoundsUtc(
  year: number,
  month: number,
  periodoInicio: Date | null,
  periodoTermino: Date | null
): { startMs: number; endExclusiveMs: number } | null {
  const b = teacherPaymentPeriodBoundsUtc(periodoInicio, periodoTermino)
  if (!b || !periodoInicio) return b
  const d0 = dueDayFromPeriodAnchorBrazil(periodoInicio)
  if (d0 < 1 || d0 > 31) return b

  const shorterCanonical = (refYear: number, refMonth: number) => {
    const p = teacherPaymentBoundsFromDueDay(refYear, refMonth, d0)
    const corrected = teacherPaymentPeriodBoundsUtc(p.inicio, p.termino)
    if (!corrected) return null
    if (b.endExclusiveMs > corrected.endExclusiveMs) return corrected
    return null
  }

  const c1 = shorterCanonical(year, month)
  if (c1) return c1

  const lastInc = new Date(b.endExclusiveMs - 1)
  const ly = lastInc.getUTCFullYear()
  const lm = lastInc.getUTCMonth() + 1
  if (ly !== year || lm !== month) {
    const c2 = shorterCanonical(ly, lm)
    if (c2) return c2
  }

  return b
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
