/**
 * Webhooks multi-provedor: InfinitePay, Santander, Lixel (+ Cora via redirect interno).
 * TODO: validação de assinatura/HMAC por provedor.
 */

import { NextRequest, NextResponse } from 'next/server'
import type { PaymentProvider } from '@prisma/client'
import { normalizeByProvider, reconcilePayment } from '@/lib/payments'

const PROVIDERS: PaymentProvider[] = ['CORA', 'INFINITEPAY', 'SANTANDER', 'LIXEL']

function parseProvider(param: string): PaymentProvider | null {
  const upper = param.toUpperCase()
  if (PROVIDERS.includes(upper as PaymentProvider)) {
    return upper as PaymentProvider
  }
  return null
}

export async function GET(
  _request: NextRequest,
  { params }: { params: { provider: string } }
) {
  const provider = parseProvider(params.provider)
  if (!provider) {
    return NextResponse.json({ ok: false, message: 'Provedor inválido' }, { status: 404 })
  }
  if (provider === 'CORA') {
    return NextResponse.json({
      status: 'ok',
      message: 'Use /api/webhooks/cora para webhooks Cora',
    })
  }
  return NextResponse.json({ status: 'ok', message: `Webhook ${provider} ativo` })
}

export async function POST(
  request: NextRequest,
  { params }: { params: { provider: string } }
) {
  const provider = parseProvider(params.provider)
  if (!provider) {
    return NextResponse.json({ ok: false, message: 'Provedor inválido' }, { status: 404 })
  }

  if (provider === 'CORA') {
    return NextResponse.json(
      { ok: false, message: 'Use /api/webhooks/cora' },
      { status: 400 }
    )
  }

  try {
    const body = await request.json().catch(() => null)
    if (body == null) {
      return NextResponse.json({ ok: false, message: 'Payload inválido' }, { status: 400 })
    }

    const np = normalizeByProvider(provider, body)
    if (!np) {
      return NextResponse.json({ ok: false, message: 'Payload inválido' }, { status: 400 })
    }

    await reconcilePayment(np)
    return NextResponse.json({ success: true }, { status: 200 })
  } catch (error) {
    console.error(`[webhooks/${params.provider}]`, error)
    if (error instanceof Error && error.message.includes('Documento')) {
      return NextResponse.json({ ok: false, message: error.message }, { status: 400 })
    }
    return NextResponse.json({ success: true }, { status: 200 })
  }
}
