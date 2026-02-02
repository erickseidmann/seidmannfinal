/**
 * Next.js Middleware
 *
 * Protege rotas admin (cookie admin_session) e Dashboard Professores (cookie session_token, role TEACHER).
 */

import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession } from './lib/adminSession'
import { getSession } from './lib/session'

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Proteger rotas Dashboard Professores e API professor
  if (pathname.startsWith('/dashboard-professores') || pathname.startsWith('/api/professor')) {
    const session = await getSession(request)
    if (!session) {
      if (pathname.startsWith('/api/')) {
        return NextResponse.json({ ok: false, message: 'Não autenticado' }, { status: 401 })
      }
      return NextResponse.redirect(new URL('/login', request.url))
    }
    if (session.role !== 'TEACHER') {
      if (pathname.startsWith('/api/')) {
        return NextResponse.json({ ok: false, message: 'Acesso negado' }, { status: 403 })
      }
      return NextResponse.redirect(new URL('/', request.url))
    }
    return NextResponse.next()
  }

  // Proteger rotas Dashboard Aluno e API student
  if (pathname.startsWith('/dashboard-aluno') || pathname.startsWith('/api/student')) {
    const session = await getSession(request)
    if (!session) {
      if (pathname.startsWith('/api/')) {
        return NextResponse.json({ ok: false, message: 'Não autenticado' }, { status: 401 })
      }
      return NextResponse.redirect(new URL('/login', request.url))
    }
    if (session.role !== 'STUDENT') {
      if (pathname.startsWith('/api/')) {
        return NextResponse.json({ ok: false, message: 'Acesso negado' }, { status: 403 })
      }
      return NextResponse.redirect(new URL('/', request.url))
    }
    return NextResponse.next()
  }

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
    '/dashboard-professores',
    '/dashboard-professores/:path*',
    '/api/professor/:path*',
    '/dashboard-aluno',
    '/dashboard-aluno/:path*',
    '/api/student/:path*',
    '/admin/:path*',
    '/api/admin/:path*',
  ],
}
