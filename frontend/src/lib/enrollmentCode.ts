/**
 * Geração de código único de matrícula
 */

import { prisma } from './prisma'

/**
 * Gera um código de matrícula: MAT- + 8 caracteres alfanuméricos
 */
export function generateEnrollmentCode(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
  let result = 'MAT-'
  for (let i = 0; i < 8; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return result
}

/**
 * Cria um código único de matrícula, tentando até 5 vezes
 */
export async function createUniqueEnrollmentCode(): Promise<string> {
  let attempts = 0
  const maxAttempts = 5

  while (attempts < maxAttempts) {
    const code = generateEnrollmentCode()
    
    // Verificar se já existe
    const existing = await prisma.enrollment.findUnique({
      where: { trackingCode: code },
    })

    if (!existing) {
      return code
    }

    attempts++
  }

  throw new Error('Não foi possível gerar um código único de matrícula após várias tentativas')
}
