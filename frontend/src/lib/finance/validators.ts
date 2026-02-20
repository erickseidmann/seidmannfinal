/**
 * Validadores para dados financeiros (CPF, email, etc.)
 */

export function isValidCPF(cpf: string): boolean {
  const digits = cpf.replace(/\D/g, '')
  if (digits.length !== 11) return false
  if (/^(\d)\1{10}$/.test(digits)) return false
  let sum = 0
  for (let i = 0; i < 9; i++) sum += parseInt(digits[i]) * (10 - i)
  let check = 11 - (sum % 11)
  if (check >= 10) check = 0
  if (parseInt(digits[9]) !== check) return false
  sum = 0
  for (let i = 0; i < 10; i++) sum += parseInt(digits[i]) * (11 - i)
  check = 11 - (sum % 11)
  if (check >= 10) check = 0
  if (parseInt(digits[10]) !== check) return false
  return true
}

export function validateEmail(email: string): { valid: boolean; suggestion?: string; message?: string } {
  if (!email || !email.trim()) {
    return { valid: false, message: 'Email não informado' }
  }

  const trimmed = email.trim().toLowerCase()
  const basicEmailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  if (!basicEmailRegex.test(trimmed)) {
    return { valid: false, message: 'Formato de email inválido' }
  }

  const domainTypoMap: Record<string, string> = {
    'gamil.com': 'gmail.com',
    'gmial.com': 'gmail.com',
    'gmaill.com': 'gmail.com',
    'hotmal.com': 'hotmail.com',
    'hotmial.com': 'hotmail.com',
    'hotmai.com': 'hotmail.com',
    'outloo.com': 'outlook.com',
    'outlok.com': 'outlook.com',
    'yaho.com': 'yahoo.com',
    'yhoo.com': 'yahoo.com',
  }

  const [, domain] = trimmed.split('@')
  if (domain && domainTypoMap[domain]) {
    const corrected = trimmed.replace(`@${domain}`, `@${domainTypoMap[domain]}`)
    return { valid: false, suggestion: corrected, message: `Email com possível typo (${domain} → ${domainTypoMap[domain]})` }
  }

  return { valid: true }
}
