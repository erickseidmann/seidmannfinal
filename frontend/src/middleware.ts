/**
 * Next.js Middleware
 * 
 * Protege rotas admin verificando sessão JWT via cookie httpOnly.
 * Protege: /admin/* e /api/admin/* (exceto /api/admin/login)
 */

import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession } from './lib/adminSession'

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Proteger rotas /admin/* (exceto login que redireciona)
  if (pathname.startsWith('/admin') && !pathname.startsWith('/admin/login')) {
    const session = await getAdminSession(request)

    if (!session) {
      return NextResponse.redirect(new URL('/login', request.url))
    }

    // Validar que é ADMIN (o token já garante isso, mas validação extra)
    if (session.role !== 'ADMIN') {
      return NextResponse.redirect(new URL('/', request.url))
    }

    // Permitir acesso
    return NextResponse.next()
  }

  // Proteger rotas /api/admin/* (exceto /api/admin/login)
  if (pathname.startsWith('/api/admin') && !pathname.startsWith('/api/admin/login')) {
    const session = await getAdminSession(request)

    // Se não está logado, retornar 401 JSON
    if (!session) {
      return NextResponse.json(
        { ok: false, message: 'Unauthorized' },
        { status: 401 }
      )
    }

    // Validar que é ADMIN
    if (session.role !== 'ADMIN') {
      return NextResponse.json(
        { ok: false, message: 'Forbidden' },
        { status: 403 }
      )
    }

    // Permitir acesso
    return NextResponse.next()
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    '/admin/:path*',
    '/api/admin/:path*',
  ],
}
