/**
 * Período de pagamento do aluno (mensal, trimestral, semestral, anual).
 * Um pagamento confirmado cobre os meses seguintes conforme o plano.
 */

export type PeriodoPagamentoAluno = 'MENSAL' | 'TRIMESTRAL' | 'SEMESTRAL' | 'ANUAL'

const PERIODOS_VALIDOS: PeriodoPagamentoAluno[] = ['MENSAL', 'TRIMESTRAL', 'SEMESTRAL', 'ANUAL']

export function normalizePeriodoPagamento(
  value: string | null | undefined
): PeriodoPagamentoAluno {
  if (value && PERIODOS_VALIDOS.includes(value as PeriodoPagamentoAluno)) {
    return value as PeriodoPagamentoAluno
  }
  return 'MENSAL'
}

/** Quantidade de meses cobertos por um pagamento. */
export function periodMonthsCount(periodo: string | null | undefined): number {
  switch (normalizePeriodoPagamento(periodo)) {
    case 'TRIMESTRAL':
      return 3
    case 'SEMESTRAL':
      return 6
    case 'ANUAL':
      return 12
    default:
      return 1
  }
}

export function addCalendarMonths(
  year: number,
  month: number,
  delta: number
): { year: number; month: number } {
  const zeroBased = month - 1 + delta
  const y = year + Math.floor(zeroBased / 12)
  const m = ((zeroBased % 12) + 12) % 12
  return { year: y, month: m + 1 }
}

/** Meses (ano/mês) cobertos a partir do mês em que o pagamento foi registrado. */
export function listCoveredMonths(
  paidYear: number,
  paidMonth: number,
  periodo: string | null | undefined
): { year: number; month: number }[] {
  const count = periodMonthsCount(periodo)
  const months: { year: number; month: number }[] = []
  for (let i = 0; i < count; i++) {
    months.push(addCalendarMonths(paidYear, paidMonth, i))
  }
  return months
}

/** Verifica se o mês visualizado está dentro da cobertura de um pagamento confirmado. */
export function isMonthCoveredByPayment(
  targetYear: number,
  targetMonth: number,
  paidYear: number,
  paidMonth: number,
  periodo: string | null | undefined
): boolean {
  const covered = listCoveredMonths(paidYear, paidMonth, periodo)
  return covered.some((m) => m.year === targetYear && m.month === targetMonth)
}

export function isMonthCoveredByAnyPayment(
  targetYear: number,
  targetMonth: number,
  periodo: string | null | undefined,
  paidMonths: { year: number; month: number }[]
): boolean {
  if (periodMonthsCount(periodo) <= 1) return false
  return paidMonths.some((p) =>
    isMonthCoveredByPayment(targetYear, targetMonth, p.year, p.month, periodo)
  )
}
