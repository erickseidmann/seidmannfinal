/**
 * Validação de link de videoconferência (Google Meet, Zoom, Microsoft Teams).
 * Usado no frontend (formulários admin e professor) e nas APIs antes de salvar.
 */

export const ALLOWED_PREFIXES = [
  'https://meet.google.com/',
  'https://zoom.us/',
  'https://teams.microsoft.com/',
  'https://us02web.zoom.us/',
  'https://us04web.zoom.us/',
  'https://us05web.zoom.us/',
  'https://us06web.zoom.us/',
] as const

export const MEETING_LINK_ERROR_MESSAGE =
  'Link inválido. Use um link do Google Meet, Zoom ou Microsoft Teams.'

/**
 * Retorna true se o valor é vazio/null/undefined (campo opcional).
 * Retorna true se o valor é uma string que começa com um dos prefixos permitidos.
 * Caso contrário retorna false.
 */
export function isValidMeetingLink(value: string | null | undefined): boolean {
  const trimmed = typeof value === 'string' ? value.trim() : ''
  if (!trimmed) return true
  return ALLOWED_PREFIXES.some((prefix) => trimmed.toLowerCase().startsWith(prefix))
}

/**
 * Retorna objeto com valid: boolean e opcionalmente error: string.
 * Uso: const { valid, error } = validateMeetingLink(form.link); if (!valid) setError(error);
 */
export function validateMeetingLink(
  value: string | null | undefined
): { valid: boolean; error?: string } {
  if (isValidMeetingLink(value)) return { valid: true }
  return { valid: false, error: MEETING_LINK_ERROR_MESSAGE }
}
