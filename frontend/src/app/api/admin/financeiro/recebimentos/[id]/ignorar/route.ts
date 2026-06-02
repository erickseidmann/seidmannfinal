/**
 * POST /api/admin/financeiro/recebimentos/[id]/ignorar
 * v1: não há reabertura de IGNORADO.
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { ignoreReceivedPayment } from '@/lib/payments'

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const auth = await requireAdmin(request)
    if (!auth.authorized) {
      return NextResponse.json(
        { ok: false, message: auth.message || 'Não autorizado' },
        { status: auth.message?.includes('Não autenticado') ? 401 : 403 }
      )
    }

    const payment = await ignoreReceivedPayment(params.id)

    return NextResponse.json({
      ok: true,
      data: { id: payment.id, status: payment.status },
    })
  } catch (error) {
    console.error('[recebimentos/ignorar POST]', error)
    const message =
      error instanceof Error ? error.message : 'Erro ao ignorar recebimento'
    return NextResponse.json({ ok: false, message }, { status: 400 })
  }
}
