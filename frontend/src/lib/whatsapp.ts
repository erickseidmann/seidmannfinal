/**
 * whatsapp.ts
 * 
 * Utilitários para links do WhatsApp com mensagens pré-preenchidas.
 */

export const WHATSAPP_NUMBER = '5519987121980'
export const WHATSAPP_URL = `https://wa.me/${WHATSAPP_NUMBER}`

/**
 * Cria um link do WhatsApp com mensagem pré-preenchida
 */
export function createWhatsAppLink(message: string): string {
  const encodedMessage = encodeURIComponent(message)
  return `${WHATSAPP_URL}?text=${encodedMessage}`
}

/**
 * Mensagens pré-definidas
 */
export const WHATSAPP_MESSAGES = {
  evaluation: 'Olá! Quero fazer uma avaliação de nível no Seidmann Institute. Pode me ajudar?',
  info: 'Olá! Gostaria de saber mais sobre os cursos do Seidmann Institute.',
  pricing: 'Olá! Gostaria de conhecer os planos e valores do Seidmann Institute.',
}
