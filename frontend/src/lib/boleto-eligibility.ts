/**
 * Regras de elegibilidade para geração de boleto/PIX na Cora.
 * Um aluno só pode ter um boleto por mês (enrollmentId + year + month).
 */

export const BOLETO_ALREADY_EXISTS_MESSAGE =
  'Este aluno já possui boleto/cobrança gerada para este mês.'

export const BOLETO_NOT_ELIGIBLE_MESSAGE =
  'Este aluno não paga por boleto (método PIX, cartão, bolsista ou faturamento em empresa).'

export type EnrollmentForBoletoCheck = {
  bolsista?: boolean | null
  faturamentoTipo?: string | null
  metodoPagamento?: string | null
  paymentInfo?: { metodo?: string | null } | null
}

function normalizeMetodo(value: string | null | undefined): string {
  return (value ?? '')
    .trim()
    .toUpperCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
}

export function isCartaoPayment(
  metodoPagamento: string | null | undefined,
  paymentInfoMetodo: string | null | undefined
): boolean {
  const m = normalizeMetodo(metodoPagamento)
  const p = normalizeMetodo(paymentInfoMetodo)
  return (
    m === 'CARTAO' ||
    p === 'CARTAO' ||
    m.includes('CARTAO') ||
    p.includes('CARTAO') ||
    m.includes('CREDITO') ||
    p.includes('CREDITO') ||
    m.includes('DEBITO') ||
    p.includes('DEBITO')
  )
}

export function isPixOnlyPayment(
  metodoPagamento: string | null | undefined,
  paymentInfoMetodo: string | null | undefined
): boolean {
  const m = normalizeMetodo(metodoPagamento)
  const p = normalizeMetodo(paymentInfoMetodo)
  const mentionsBoleto = m.includes('BOLETO') || p.includes('BOLETO')
  if (mentionsBoleto) return false
  return m === 'PIX' || p === 'PIX' || m.includes('PIX') || p.includes('PIX')
}

/** Aluno configurado para pagar via boleto (não PIX exclusivo, não cartão). */
export function enrollmentPaysByBoleto(enrollment: EnrollmentForBoletoCheck): boolean {
  if (isCartaoPayment(enrollment.metodoPagamento, enrollment.paymentInfo?.metodo ?? null)) {
    return false
  }
  if (isPixOnlyPayment(enrollment.metodoPagamento, enrollment.paymentInfo?.metodo ?? null)) {
    return false
  }
  const m = normalizeMetodo(enrollment.metodoPagamento)
  const p = normalizeMetodo(enrollment.paymentInfo?.metodo ?? null)
  if (m === 'BOLETO' || p === 'BOLETO') return true
  // Legado sem método definido: permite boleto (exceto PIX/cartão já filtrados acima)
  if (!m && !p) return true
  return false
}

export function enrollmentEligibleForBoleto(enrollment: EnrollmentForBoletoCheck): boolean {
  if (enrollment.bolsista) return false
  const faturamento = (enrollment.faturamentoTipo ?? 'ALUNO').toUpperCase()
  if (faturamento === 'EMPRESA') return false
  return enrollmentPaysByBoleto(enrollment)
}

export function boletoIneligibilityReason(enrollment: EnrollmentForBoletoCheck): string | null {
  if (enrollment.bolsista) return 'Aluno bolsista'
  if ((enrollment.faturamentoTipo ?? 'ALUNO').toUpperCase() === 'EMPRESA') {
    return 'Faturamento em nome de empresa'
  }
  if (isCartaoPayment(enrollment.metodoPagamento, enrollment.paymentInfo?.metodo ?? null)) {
    return 'Método de pagamento: cartão'
  }
  if (isPixOnlyPayment(enrollment.metodoPagamento, enrollment.paymentInfo?.metodo ?? null)) {
    return 'Método de pagamento: PIX'
  }
  const m = normalizeMetodo(enrollment.metodoPagamento)
  const p = normalizeMetodo(enrollment.paymentInfo?.metodo ?? null)
  if (m && p && m !== 'BOLETO' && p !== 'BOLETO' && m !== p) {
    return `Método de pagamento: ${enrollment.metodoPagamento ?? enrollment.paymentInfo?.metodo}`
  }
  if (m && m !== 'BOLETO' && !p) return `Método de pagamento: ${enrollment.metodoPagamento}`
  if (p && p !== 'BOLETO' && !m) return `Método de pagamento: ${enrollment.paymentInfo?.metodo}`
  return null
}
