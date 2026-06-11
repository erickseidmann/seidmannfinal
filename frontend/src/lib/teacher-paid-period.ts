/**
 * Intervalos de datas de TeacherPaymentMonth (periodoInicio → periodoTermino, limites em UTC).
 * Usado para períodos PAGO (bloquear registro) e EM_ABERTO (alertas de registro atrasado no admin).
 *
 * Chave `year`/`month` do registro = mês/ano de competência BRT do último dia inclusivo
 * (= mês/ano de `periodoTermino` exclusivo em America/Sao_Paulo, via periodoTermino - 1ms).
 */

/** America/Sao_Paulo é UTC−3 (sem horário de verão desde 2019). */
export const TEACHER_PAYMENT_BRT_OFFSET_MS = 3 * 60 * 60 * 1000

/** Meia-noite civil em BRT = 03:00 UTC (Brasil sem horário de verão). */
const BRT_MIDNIGHT_UTC_HOUR = 3

export type TeacherPaidPeriodRow = {
  periodoInicio: Date | null
  periodoTermino: Date | null
}

/** Dia do mês (1–31) da âncora do ciclo em UTC. */
function dueDayFromPeriodAnchorBrazil(periodoInicio: Date): number {
  return new Date(periodoInicio).getUTCDate()
}

/**
 * Limites do período de pagamento (mesma convenção de isLessonStartWithinTeacherPeriodRanges):
 * [startMs, endExclusiveMs) — periodoTermino = 00:00 BRT (03:00 UTC) do dia de pagamento (primeiro instante fora do período).
 */
export function teacherPaymentPeriodBoundsUtc(
  periodoInicio: Date | null,
  periodoTermino: Date | null
): { startMs: number; endExclusiveMs: number } | null {
  if (!periodoInicio || !periodoTermino) return null
  return {
    startMs: new Date(periodoInicio).getTime(),
    endExclusiveMs: new Date(periodoTermino).getTime(),
  }
}

/** Mês civil em UTC: [1º dia 00:00 UTC, 1º do mês seguinte 00:00 UTC exclusivo). */
export function calendarMonthBoundsUtc(year: number, month: number): { startMs: number; endExclusiveMs: number } {
  const s = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0, 0))
  const e = new Date(Date.UTC(year, month, 1, 0, 0, 0, 0))
  return { startMs: s.getTime(), endExclusiveMs: e.getTime() }
}

/** Próximo mês civil (1–12). */
export function nextCompetenceYearMonth(
  year: number,
  month: number
): { year: number; month: number } {
  if (month === 12) return { year: year + 1, month: 1 }
  return { year, month: month + 1 }
}

/**
 * Mês/ano de competência a partir de `periodoTermino` (exclusivo).
 * Equivalente a MONTH/YEAR(CONVERT_TZ(periodo_termino, '+00:00', '-03:00')) no último instante inclusivo.
 */
export function teacherPaymentCompetenceKeyFromPeriodoTermino(periodoTermino: Date): {
  year: number
  month: number
} {
  const lastInclusiveMs = periodoTermino.getTime() - 1
  const brtAsUtcFields = new Date(lastInclusiveMs - TEACHER_PAYMENT_BRT_OFFSET_MS)
  return {
    year: brtAsUtcFields.getUTCFullYear(),
    month: brtAsUtcFields.getUTCMonth() + 1,
  }
}

/**
 * Intervalo de `periodoTermino` cujos registros têm competência BRT = (year, month).
 * Usado em filtros Prisma: `{ gt: range.gt, lte: range.lte }`.
 */
export function periodoTerminoRangeForCompetenceMonthBrt(
  year: number,
  month: number
): { gt: Date; lte: Date } {
  const minTerminoMs = Date.UTC(year, month - 1, 1, 3, 0, 0, 1)
  const maxTerminoMs = Date.UTC(
    month === 12 ? year + 1 : year,
    month === 12 ? 0 : month,
    1,
    3,
    0,
    0,
    0
  )
  return {
    gt: new Date(minTerminoMs - 1),
    lte: new Date(maxTerminoMs),
  }
}

/**
 * Período [início, término) para o mês de **competência** (year/month) e dia de pagamento.
 * Para dueDay === 1, a referência de pagamento é o mês civil seguinte à competência.
 */
export function teacherPaymentBoundsForCompetenceMonth(
  competenceYear: number,
  competenceMonth: number,
  dueDay: number
): { inicio: Date; termino: Date } {
  const ref =
    dueDay === 1
      ? nextCompetenceYearMonth(competenceYear, competenceMonth)
      : { year: competenceYear, month: competenceMonth }
  return teacherPaymentBoundsFromDueDay(ref.year, ref.month, dueDay)
}

/** Chaves de upsert: prioriza `periodoTermino`; senão competência informada pelo caller. */
export function resolveTeacherPaymentUpsertKeys(options: {
  competenceYear: number
  competenceMonth: number
  periodoTermino?: Date | null
}): { year: number; month: number } {
  if (options.periodoTermino) {
    return teacherPaymentCompetenceKeyFromPeriodoTermino(options.periodoTermino)
  }
  return { year: options.competenceYear, month: options.competenceMonth }
}

function lastDayOfMonthUtc(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate()
}

/**
 * Período de competência do mês de referência `year`/`month` (1–12), com pagamento no dia `dueDay`:
 * do dia `dueDay` do mês anterior até o **dia anterior** ao pagamento no mês atual (último dia com aula).
 *
 * Armazenamento: `periodoTermino` = 00:00 BRT (03:00 UTC) do **dia de pagamento** no mês atual =
 * primeiro instante **fora** do período (fim exclusivo).
 * Ex.: venc. 28/03 → aulas até 27/03 23:59:59 BRT inclusive; termino = 28/03 00:00 BRT (28/03 03:00 UTC).
 */
export function teacherPaymentBoundsFromDueDay(
  year: number,
  month: number,
  dueDay: number
): { inicio: Date; termino: Date } {
  // Regra especial e explícita para vencimento no dia 1:
  // competência = mês civil anterior completo (01..último dia), limites em 00:00 BRT (03:00 UTC).
  // Ex.: referência abril/2026 -> 01/03/2026 00:00 BRT .. 01/04/2026 00:00 BRT (fim exclusivo).
  if (dueDay === 1) {
    const prev = month === 1 ? { year: year - 1, month: 12 } : { year, month: month - 1 }
    const inicio = new Date(
      Date.UTC(prev.year, prev.month - 1, 1, BRT_MIDNIGHT_UTC_HOUR, 0, 0, 0)
    )
    const termino = new Date(Date.UTC(year, month - 1, 1, BRT_MIDNIGHT_UTC_HOUR, 0, 0, 0))
    return { inicio, termino }
  }

  const safeDueCurrent = Math.min(Math.max(1, dueDay), lastDayOfMonthUtc(year, month))
  const termino = new Date(
    Date.UTC(year, month - 1, safeDueCurrent, BRT_MIDNIGHT_UTC_HOUR, 0, 0, 0)
  )
  const prev = month === 1 ? { year: year - 1, month: 12 } : { year, month: month - 1 }
  const safeDuePrev = Math.min(Math.max(1, dueDay), lastDayOfMonthUtc(prev.year, prev.month))
  const inicio = new Date(
    Date.UTC(prev.year, prev.month - 1, safeDuePrev, BRT_MIDNIGHT_UTC_HOUR, 0, 0, 0)
  )
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
    const p = teacherPaymentBoundsForCompetenceMonth(refYear, refMonth, d0)
    const corrected = teacherPaymentPeriodBoundsUtc(p.inicio, p.termino)
    if (!corrected) return null
    if (b.endExclusiveMs > corrected.endExclusiveMs) return corrected
    return null
  }

  const c1 = shorterCanonical(year, month)
  if (c1) return c1

  const terminoKey = teacherPaymentCompetenceKeyFromPeriodoTermino(new Date(b.endExclusiveMs))
  const ly = terminoKey.year
  const lm = terminoKey.month
  if (ly !== year || lm !== month) {
    const c2 = shorterCanonical(ly, lm)
    if (c2) return c2
  }

  return b
}

/** true se o instante de início da aula está dentro de algum intervalo [início 00:00 BRT, fim 00:00 BRT exclusivo] */
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
