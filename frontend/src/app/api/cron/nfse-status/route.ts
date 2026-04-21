/**
 * Endpoint para disparo manual do job: atualizar status das NFSe.
 * Protegido por autenticação admin. O scheduler chama runNfseStatus() direto a cada 5 minutos (automático).
 *
 * GET sem manual: mesmo critério do cron (só processando_autorizacao com +2 min).
 * POST { "manual": true } ou GET ?manual=1: consulta todas as notas exceto autorizadas ativas (limite 500 por vez).
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { runNfseStatus } from '@/lib/cron/jobs'

function parseManual(request: NextRequest, body: unknown): boolean {
  const q = new URL(request.url).searchParams.get('manual')
  if (q === '1' || q === 'true') return true
  if (body && typeof body === 'object' && 'manual' in body && (body as { manual?: unknown }).manual === true) {
    return true
  }
  return false
}

export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request)
  if (!auth.authorized) {
    return NextResponse.json(
      { ok: false, message: auth.message || 'Não autorizado' },
      { status: auth.message?.includes('Não autenticado') ? 401 : 403 }
    )
  }
  try {
    const manual = parseManual(request, null)
    const result = await runNfseStatus({ manual })
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
  const auth = await requireAdmin(request)
  if (!auth.authorized) {
    return NextResponse.json(
      { ok: false, message: auth.message || 'Não autorizado' },
      { status: auth.message?.includes('Não autenticado') ? 401 : 403 }
    )
  }
  try {
    const body = await request.json().catch(() => ({}))
    const manual = parseManual(request, body)
    const result = await runNfseStatus({ manual })
    return NextResponse.json(result)
  } catch (error) {
    console.error('[cron/nfse-status] Erro:', error)
    return NextResponse.json(
      { ok: false, message: 'Erro ao atualizar status das NFSe' },
      { status: 500 }
    )
  }
}
