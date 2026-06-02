/**
 * Admin: gerenciar webhooks (endpoints) na Cora.
 * GET    — lista endpoints
 * POST   — cadastra endpoint
 * DELETE — remove endpoint (?id=)
 */

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAdmin } from '@/lib/auth'
import {
  listCoraWebhookEndpoints,
  createCoraWebhookEndpoint,
  deleteCoraWebhookEndpoint,
  formatCoraApiErrorMessage,
} from '@/lib/cora'

const DEFAULT_WEBHOOK_URL =
  process.env.CORA_WEBHOOK_URL ?? 'https://seidmanninstitute.com/api/webhooks/cora'

const createBodySchema = z.object({
  url: z.string().url().optional(),
  resource: z.string().min(1).optional(),
  trigger: z.string().min(1).optional(),
})

function coraSuccess(status: number): boolean {
  return status >= 200 && status < 300
}

function httpStatusFromCora(coraStatus: number): number {
  if (coraStatus >= 400 && coraStatus < 600) return coraStatus
  return 502
}

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAdmin(request)
    if (!auth.authorized) {
      return NextResponse.json(
        { ok: false, message: auth.message || 'Não autorizado' },
        { status: auth.message?.includes('Não autenticado') ? 401 : 403 }
      )
    }

    const { status, data } = await listCoraWebhookEndpoints()
    if (!coraSuccess(status)) {
      console.error('[api/admin/cora/webhooks GET] Cora:', { status, data })
      return NextResponse.json(
        { ok: false, message: formatCoraApiErrorMessage(status, data) },
        { status: httpStatusFromCora(status) }
      )
    }

    return NextResponse.json({ ok: true, data })
  } catch (error) {
    console.error('[api/admin/cora/webhooks GET]', error)
    return NextResponse.json(
      {
        ok: false,
        message: error instanceof Error ? error.message : 'Erro ao listar webhooks Cora',
      },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAdmin(request)
    if (!auth.authorized) {
      return NextResponse.json(
        { ok: false, message: auth.message || 'Não autorizado' },
        { status: auth.message?.includes('Não autenticado') ? 401 : 403 }
      )
    }

    const raw = await request.json().catch(() => ({}))
    const parsed = createBodySchema.safeParse(raw)
    if (!parsed.success) {
      return NextResponse.json(
        { ok: false, message: 'Body inválido', details: parsed.error.flatten() },
        { status: 400 }
      )
    }

    const payload = {
      url: parsed.data.url ?? DEFAULT_WEBHOOK_URL,
      resource: parsed.data.resource ?? 'invoice',
      trigger: parsed.data.trigger ?? 'paid',
    }

    const { status, data } = await createCoraWebhookEndpoint(payload)
    if (!coraSuccess(status)) {
      console.error('[api/admin/cora/webhooks POST] Cora:', { status, data, payload })
      return NextResponse.json(
        { ok: false, message: formatCoraApiErrorMessage(status, data) },
        { status: httpStatusFromCora(status) }
      )
    }

    return NextResponse.json({ ok: true, data })
  } catch (error) {
    console.error('[api/admin/cora/webhooks POST]', error)
    return NextResponse.json(
      {
        ok: false,
        message: error instanceof Error ? error.message : 'Erro ao cadastrar webhook Cora',
      },
      { status: 500 }
    )
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const auth = await requireAdmin(request)
    if (!auth.authorized) {
      return NextResponse.json(
        { ok: false, message: auth.message || 'Não autorizado' },
        { status: auth.message?.includes('Não autenticado') ? 401 : 403 }
      )
    }

    const id = new URL(request.url).searchParams.get('id')?.trim()
    if (!id) {
      return NextResponse.json(
        { ok: false, message: 'Query param id é obrigatório' },
        { status: 400 }
      )
    }

    const { status, data } = await deleteCoraWebhookEndpoint(id)
    if (!coraSuccess(status)) {
      console.error('[api/admin/cora/webhooks DELETE] Cora:', { status, data, id })
      return NextResponse.json(
        { ok: false, message: formatCoraApiErrorMessage(status, data) },
        { status: httpStatusFromCora(status) }
      )
    }

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('[api/admin/cora/webhooks DELETE]', error)
    return NextResponse.json(
      {
        ok: false,
        message: error instanceof Error ? error.message : 'Erro ao remover webhook Cora',
      },
      { status: 500 }
    )
  }
}
