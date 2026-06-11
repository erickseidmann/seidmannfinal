/**
 * Valor mensal efetivo do aluno (matrícula + paymentInfo).
 * Usado em relatórios onde inativos devem manter o valor histórico, não zerar.
 */

export function resolveEnrollmentValorMensalidade(options: {
  bolsista?: boolean | null
  valorMensalidade: unknown
  paymentInfoValorMensal?: unknown
}): number {
  if (options.bolsista) return 0

  const parse = (v: unknown): number | null => {
    if (v == null || v === '') return null
    const n = Number(v)
    return Number.isFinite(n) ? n : null
  }

  const fromEnrollment = parse(options.valorMensalidade)
  const fromPayment = parse(options.paymentInfoValorMensal)

  if (fromEnrollment != null && fromEnrollment > 0) return fromEnrollment
  if (fromPayment != null && fromPayment > 0) return fromPayment
  if (fromEnrollment != null) return fromEnrollment
  return fromPayment ?? 0
}
