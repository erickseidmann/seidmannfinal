/**
 * Endpoint para disparo manual do job: atualizar status das NFSe pendentes.
 * Protegido por autenticação admin. O scheduler roda este job a cada 5 minutos.
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { runNfseStatus } from '@/lib/cron/jobs'

export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request)
  if (!auth.authorized) {
    return NextResponse.json(
      { ok: false, message: auth.message || 'Não autorizado' },
      { status: auth.message?.includes('Não autenticado') ? 401 : 403 }
    )
  }
  try {
    const result = await runNfseStatus()
    return NextResponse.json(result)
  } catch (error) {
    console.error('[cron/nfse-status] Erro:', error)
    return NextResponse.json(
      { ok: false, message: 'Erro ao atualizar status das NFSe' },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  return GET(request)
}
