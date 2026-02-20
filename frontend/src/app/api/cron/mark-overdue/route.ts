/**
 * Endpoint para disparo manual do job: marcar meses como ATRASADO.
 * Protegido por autenticação admin. O scheduler também roda este job às 8h UTC.
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { runMarkOverdue } from '@/lib/cron/jobs'

export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request)
  if (!auth.authorized) {
    return NextResponse.json(
      { ok: false, message: auth.message || 'Não autorizado' },
      { status: auth.message?.includes('Não autenticado') ? 401 : 403 }
    )
  }
  try {
    const result = await runMarkOverdue()
    return NextResponse.json(result)
  } catch (error) {
    console.error('[cron/mark-overdue] Erro:', error)
    return NextResponse.json(
      { ok: false, message: 'Erro ao marcar atrasados' },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  return GET(request)
}
