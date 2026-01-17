/**
 * Helpers de autenticação admin
 */

import { NextRequest } from 'next/server'
import { getAdminSession } from './adminSession'

export async function requireAdmin(request: NextRequest) {
  const session = await getAdminSession(request)

  if (!session) {
    return {
      authorized: false,
      message: 'Não autenticado',
      session: null,
    }
  }

  if (session.role !== 'ADMIN') {
    return {
      authorized: false,
      message: 'Acesso negado. Apenas administradores podem acessar.',
      session: null,
    }
  }

  return {
    authorized: true,
    message: null,
    session,
  }
}
