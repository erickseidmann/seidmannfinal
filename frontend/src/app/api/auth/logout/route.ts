/**
 * API Route: POST /api/auth/logout
 * 
 * Remove a sessão do usuário (limpa cookie)
 */

import { NextRequest, NextResponse } from 'next/server'
import { clearSession } from '@/lib/session'

export async function POST(request: NextRequest) {
  const response = NextResponse.json({
    ok: true,
    message: 'Logout realizado com sucesso',
  })

  // Limpar sessão (remover cookie)
  return clearSession(response)
}
