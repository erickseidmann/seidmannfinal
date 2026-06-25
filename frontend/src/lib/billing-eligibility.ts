/**
 * Regras compartilhadas: quem pode receber cobrança/lembrete e quando um mês bloqueia envio.
 */

/** Status mensal que impede nova cobrança ou lembrete automático. */
export const BILLING_BLOCKED_MONTH_STATUSES = ['PAGO', 'REMOVIDO'] as const

export function enrollmentMonthBlocksBilling(paymentStatus: string | null | undefined): boolean {
  if (!paymentStatus) return false
  return (BILLING_BLOCKED_MONTH_STATUSES as readonly string[]).includes(paymentStatus)
}

const STATUS_LABELS: Record<string, string> = {
  INACTIVE: 'Aluno inativo',
  PAUSED: 'Aluno pausado',
}

/** Matrícula pode receber e-mails/cobranças (manual ou automático). */
export function enrollmentReceivesBillingMessages(enrollment: {
  bolsista?: boolean | null
  status?: string | null
}): { ok: true } | { ok: false; reason: string } {
  if (enrollment.bolsista) {
    return { ok: false, reason: 'Aluno bolsista' }
  }
  const status = enrollment.status ?? 'ACTIVE'
  if (status !== 'ACTIVE') {
    return {
      ok: false,
      reason: STATUS_LABELS[status] ?? `Matrícula não ativa (${status})`,
    }
  }
  return { ok: true }
}

/** Próximo vencimento a partir do dia fixo (mesma regra do envio manual de cobrança). */
export function nextDueDateFromBillingDay(dayOfMonth: number, afterDate?: Date): Date {
  const after = afterDate ?? new Date()
  const year = after.getFullYear()
  const month = after.getMonth()
  const safeDay = Math.min(dayOfMonth, new Date(year, month + 1, 0).getDate())
  const candidate = new Date(year, month, safeDay)
  if (candidate > after) return candidate
  const nextSafe = Math.min(dayOfMonth, new Date(year, month + 2, 0).getDate())
  return new Date(year, month + 1, nextSafe)
}

export function billingYearMonthFromEnrollment(enrollment: {
  diaPagamento?: number | null
  paymentInfo?: { dueDay?: number | null } | null
}): { year: number; month: number } {
  const day = enrollment.diaPagamento ?? enrollment.paymentInfo?.dueDay ?? 10
  const due = nextDueDateFromBillingDay(day, new Date())
  return { year: due.getFullYear(), month: due.getMonth() + 1 }
}
