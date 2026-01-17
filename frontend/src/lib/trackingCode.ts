/**
 * Geração de código de acompanhamento único (trackingCode)
 * Formato: MAT- + 8 caracteres alfanuméricos
 */

import { prisma } from './prisma'

/**
 * Gera um código de acompanhamento: MAT- + 8 caracteres alfanuméricos
 */
export function generateTrackingCode(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
  let result = 'MAT-'
  for (let i = 0; i < 8; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return result
}

/**
 * Cria um código de acompanhamento único, tentando até garantir unicidade
 */
export async function createUniqueTrackingCode(): Promise<string> {
  let attempts = 0
  const maxAttempts = 10

  while (attempts < maxAttempts) {
    const code = generateTrackingCode()
    
    // Verificar se já existe
    const existing = await prisma.enrollment.findUnique({
      where: { trackingCode: code },
    })

    if (!existing) {
      return code
    }

    attempts++
  }

  throw new Error('Não foi possível gerar um código de acompanhamento único após várias tentativas')
}
