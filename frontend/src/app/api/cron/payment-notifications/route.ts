/**
 * Endpoint para disparo manual do job: enviar notificações de pagamento.
 * Protegido por autenticação admin. O scheduler roda este job às 12h UTC (9h BRT).
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { runPaymentNotifications } from '@/lib/cron/jobs'

export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request)
  if (!auth.authorized) {
    return NextResponse.json(
      { ok: false, message: auth.message || 'Não autorizado' },
      { status: auth.message?.includes('Não autenticado') ? 401 : 403 }
    )
  }
  try {
    const result = await runPaymentNotifications()
    return NextResponse.json(result)
  } catch (error) {
    console.error('[cron/payment-notifications] Erro:', error)
    return NextResponse.json(
      { ok: false, message: 'Erro ao enviar notificações' },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  return GET(request)
}
