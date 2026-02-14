/**
 * API Route: GET /api/admin/me
 * Retorna dados do admin logado (para sidebar: saber se é super admin)
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { isSuperAdminEmail } from '@/lib/auth'

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAdmin(request)
    if (!auth.authorized || !auth.session) {
      return NextResponse.json(
        { ok: false, message: auth.message || 'Não autorizado' },
        { status: auth.message?.includes('Não autenticado') ? 401 : 403 }
      )
    }
    return NextResponse.json({
      ok: true,
      data: {
        id: auth.session.sub,
        email: auth.session.email,
        isSuperAdmin: isSuperAdminEmail(auth.session.email),
        adminPages: auth.session.adminPages ?? [],
      },
    })
  } catch (error) {
    return NextResponse.json(
      { ok: false, message: 'Erro ao obter sessão' },
      { status: 500 }
    )
  }
}
