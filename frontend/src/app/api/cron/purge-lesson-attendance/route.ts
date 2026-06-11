/**
 * Endpoint para disparo manual: excluir presença em chamada além da retenção (60 dias).
 * O scheduler também roda este job diariamente às 5h UTC.
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { runPurgeLessonAttendance } from '@/lib/cron/jobs'

export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request)
  if (!auth.authorized) {
    return NextResponse.json(
      { ok: false, message: auth.message || 'Não autorizado' },
      { status: auth.message?.includes('Não autenticado') ? 401 : 403 }
    )
  }
  try {
    const result = await runPurgeLessonAttendance()
    return NextResponse.json(result)
  } catch (error) {
    console.error('[cron/purge-lesson-attendance] Erro:', error)
    return NextResponse.json(
      { ok: false, message: 'Erro ao excluir registros expirados' },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  return GET(request)
}
