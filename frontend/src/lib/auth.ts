/**
 * Helpers de autenticação admin
 */

import { NextRequest } from 'next/server'
import { getAdminSession } from './adminSession'

const SUPER_ADMIN_EMAIL = 'admin@seidmann.com'

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

/** Apenas admin@seidmann.com pode acessar (ex.: página Usuários do ADM) */
export async function requireSuperAdmin(request: NextRequest) {
  const auth = await requireAdmin(request)
  if (!auth.authorized || !auth.session) {
    return auth
  }
  const email = (auth.session.email || '').toLowerCase()
  if (email !== SUPER_ADMIN_EMAIL) {
    return {
      authorized: false,
      message: 'Acesso negado. Apenas o administrador principal pode acessar.',
      session: null,
    }
  }
  return auth
}

export function isSuperAdminEmail(email: string | undefined): boolean {
  return (email || '').toLowerCase() === SUPER_ADMIN_EMAIL
}
