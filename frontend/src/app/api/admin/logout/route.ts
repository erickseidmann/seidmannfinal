/**
 * API Route: POST /api/admin/logout
 * 
 * Remove a sessão admin (limpa cookie)
 */

import { NextRequest, NextResponse } from 'next/server'
import { clearSessionCookie } from '@/lib/adminSession'

export async function POST(request: NextRequest) {
  const response = NextResponse.json({
    ok: true,
    message: 'Logout realizado com sucesso',
  })

  // Limpar sessão (remover cookie)
  const clearedResponse = clearSessionCookie(response)
  
  // Redirecionar para home após logout
  return clearedResponse
}
