/**
 * Validadores de dados
 */

/**
 * Valida formato de email
 */
export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

/**
 * Normaliza telefone removendo tudo que não for número
 */
export function normalizePhone(phone: string): string {
  return phone.replace(/\D/g, '')
}

/**
 * Verifica se telefone tem no mínimo X dígitos (padrão 10)
 */
export function requireMinDigits(phone: string, min: number = 10): boolean {
  const normalized = normalizePhone(phone)
  return normalized.length >= min
}

/**
 * Valida WhatsApp (telefone): apenas números, entre 10 e 11 dígitos (BR)
 */
export function isValidWhatsApp(phone: string): boolean {
  const normalized = normalizePhone(phone)
  return normalized.length >= 10 && normalized.length <= 11
}
