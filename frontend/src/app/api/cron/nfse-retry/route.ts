/**
 * Endpoint para disparo manual do job: reprocessar NFSe com erro.
 * Protegido por autenticação admin. O scheduler roda este job às 10h UTC.
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { runNfseRetry } from '@/lib/cron/jobs'

export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request)
  if (!auth.authorized) {
    return NextResponse.json(
      { ok: false, message: auth.message || 'Não autorizado' },
      { status: auth.message?.includes('Não autenticado') ? 401 : 403 }
    )
  }
  try {
    const result = await runNfseRetry()
    return NextResponse.json(result)
  } catch (error) {
    console.error('[cron/nfse-retry] Erro:', error)
    return NextResponse.json(
      { ok: false, message: 'Erro ao reprocessar NFSe' },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  return GET(request)
}
