export type MonthRef = { year: number; month: number }

export type AllocationPaidMonth = {
  enrollmentId: string
  paidYear: number | null
  paidMonth: number | null
}

/** Mês de referência = mês civil da data em que o pagamento entrou. */
export function paymentReferenceMonth(dataPagamento: Date): MonthRef {
  return {
    year: dataPagamento.getFullYear(),
    month: dataPagamento.getMonth() + 1,
  }
}

export function compareMonth(a: MonthRef, b: MonthRef): number {
  if (a.year !== b.year) return a.year - b.year
  return a.month - b.month
}

export function isMonthBefore(a: MonthRef, b: MonthRef): boolean {
  return compareMonth(a, b) < 0
}

export function isEnrollmentMonthUnpaid(status: string | null | undefined): boolean {
  return status !== 'PAGO'
}

export function monthLookupKey(enrollmentId: string, year: number, month: number): string {
  return `${enrollmentId}:${year}-${month}`
}

/**
 * Pagamento quitou competência anterior à data do recebimento e o mês da data ainda não está pago.
 */
export function hasPreviousMonthPaymentPendingCurrent(
  dataPagamento: Date,
  allocations: AllocationPaidMonth[],
  fallback: AllocationPaidMonth | null,
  refMonthStatusByEnrollment: Map<string, string | null | undefined>
): boolean {
  const ref = paymentReferenceMonth(dataPagamento)
  const rows =
    allocations.length > 0
      ? allocations
      : fallback
        ? [fallback]
        : []

  for (const row of rows) {
    if (row.paidYear == null || row.paidMonth == null) continue
    const paid: MonthRef = { year: row.paidYear, month: row.paidMonth }
    if (!isMonthBefore(paid, ref)) continue
    const status = refMonthStatusByEnrollment.get(row.enrollmentId)
    if (status === undefined || isEnrollmentMonthUnpaid(status)) return true
  }

  return false
}

export function buildRefMonthStatusMapForPayment(
  dataPagamento: Date,
  allocations: AllocationPaidMonth[],
  fallback: AllocationPaidMonth | null,
  refMonthByKey: Map<string, string | null | undefined>
): Map<string, string | null | undefined> {
  const ref = paymentReferenceMonth(dataPagamento)
  const rows =
    allocations.length > 0
      ? allocations
      : fallback
        ? [fallback]
        : []
  const out = new Map<string, string | null | undefined>()
  for (const row of rows) {
    if (row.paidYear == null || row.paidMonth == null) continue
    const paid: MonthRef = { year: row.paidYear, month: row.paidMonth }
    if (!isMonthBefore(paid, ref)) continue
    out.set(
      row.enrollmentId,
      refMonthByKey.get(monthLookupKey(row.enrollmentId, ref.year, ref.month)) ?? null
    )
  }
  return out
}

export function collectPreviousMonthPendingLookups(
  items: Array<{
    status: string
    dataPagamento: Date
    allocations: AllocationPaidMonth[]
    fallback: AllocationPaidMonth | null
  }>
): Array<{ enrollmentId: string; year: number; month: number }> {
  const seen = new Set<string>()
  const lookups: Array<{ enrollmentId: string; year: number; month: number }> = []

  for (const item of items) {
    if (item.status !== 'VINCULADO') continue
    const ref = paymentReferenceMonth(item.dataPagamento)
    const rows =
      item.allocations.length > 0
        ? item.allocations
        : item.fallback
          ? [item.fallback]
          : []

    for (const row of rows) {
      if (row.paidYear == null || row.paidMonth == null) continue
      const paid: MonthRef = { year: row.paidYear, month: row.paidMonth }
      if (!isMonthBefore(paid, ref)) continue
      const key = monthLookupKey(row.enrollmentId, ref.year, ref.month)
      if (seen.has(key)) continue
      seen.add(key)
      lookups.push({ enrollmentId: row.enrollmentId, year: ref.year, month: ref.month })
    }
  }

  return lookups
}
