/**
 * Endpoint para disparo manual do job: processar agendamentos de NF (emitir e enviar e-mail no dia/hora).
 * O scheduler roda este job a cada minuto.
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { runNfseScheduled } from '@/lib/cron/jobs'

export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request)
  if (!auth.authorized) {
    return NextResponse.json(
      { ok: false, message: auth.message || 'Não autorizado' },
      { status: auth.message?.includes('Não autenticado') ? 401 : 403 }
    )
  }
  try {
    const result = await runNfseScheduled()
    return NextResponse.json(result)
  } catch (error) {
    console.error('[cron/nfse-scheduled] Erro:', error)
    return NextResponse.json(
      { ok: false, message: 'Erro ao processar agendamentos de NF' },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  return GET(request)
}
