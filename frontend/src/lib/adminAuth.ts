/**
 * Autenticação básica para rotas admin
 * 
 * Verifica se o request tem o token admin válido no header Authorization
 */

import { NextRequest } from 'next/server'

/**
 * Verifica se o request tem autorização admin válida
 * 
 * @param request - NextRequest com header Authorization
 * @returns { authorized: boolean, message?: string }
 */
export function verifyAdminAuth(request: NextRequest): { authorized: boolean; message?: string } {
  const authHeader = request.headers.get('authorization')

  if (!authHeader) {
    return {
      authorized: false,
      message: 'Token de autorização não fornecido',
    }
  }

  // Formato: "Bearer <token>"
  const parts = authHeader.split(' ')
  if (parts.length !== 2 || parts[0] !== 'Bearer') {
    return {
      authorized: false,
      message: 'Formato de autorização inválido. Use: Bearer <token>',
    }
  }

  const token = parts[1]
  const adminToken = process.env.ADMIN_TOKEN

  if (!adminToken) {
    console.error('[adminAuth] ADMIN_TOKEN não configurado no .env.local')
    return {
      authorized: false,
      message: 'Configuração de segurança não encontrada',
    }
  }

  if (token !== adminToken) {
    return {
      authorized: false,
      message: 'Token de autorização inválido',
    }
  }

  return {
    authorized: true,
  }
}
