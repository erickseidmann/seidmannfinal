/**
 * POST /api/admin/financeiro/recebimentos/[id]/vincular
 * body: { enrollmentId }
 */

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAdmin } from '@/lib/auth'
import { manualLinkReceivedPayment } from '@/lib/payments'

const bodySchema = z.object({
  enrollmentId: z.string().min(1),
})

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

    const body = await request.json().catch(() => ({}))
    const parsed = bodySchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { ok: false, message: 'enrollmentId obrigatório' },
        { status: 400 }
      )
    }

    const payment = await manualLinkReceivedPayment(
      params.id,
      parsed.data.enrollmentId,
      auth.session?.sub ?? null
    )

    return NextResponse.json({
      ok: true,
      data: {
        id: payment.id,
        status: payment.status,
        enrollmentId: payment.enrollmentId,
        semCobrancaAberta: payment.semCobrancaAberta,
      },
    })
  } catch (error) {
    console.error('[recebimentos/vincular POST]', error)
    const message =
      error instanceof Error ? error.message : 'Erro ao vincular recebimento'
    return NextResponse.json({ ok: false, message }, { status: 400 })
  }
}
