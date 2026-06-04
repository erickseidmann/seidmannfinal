/**
 * POST /api/admin/santander/sync-extrato — dispara sync do extrato Santander + conciliação imediata.
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { runSyncSantanderExtrato } from '@/lib/cron/jobs'

export async function POST(request: NextRequest) {
  const auth = await requireAdmin(request)
  if (!auth.authorized) {
    return NextResponse.json(
      { ok: false, message: auth.message || 'Não autorizado' },
      { status: auth.message?.includes('Não autenticado') ? 401 : 403 }
    )
  }

  try {
    const result = await runSyncSantanderExtrato()
    return NextResponse.json({
      ok: result.ok,
      data: {
        total: result.total,
        novas: result.novas,
        conciliadas: result.conciliadas,
        pendentes: result.pendentes,
        ignoradas: result.ignoradas,
        erros: result.erros,
        start: result.start,
        end: result.end,
      },
      message: result.message,
    })
  } catch (error) {
    console.error('[api/admin/santander/sync-extrato]', error)
    return NextResponse.json(
      { ok: false, message: 'Erro ao sincronizar extrato Santander' },
      { status: 500 }
    )
  }
}
