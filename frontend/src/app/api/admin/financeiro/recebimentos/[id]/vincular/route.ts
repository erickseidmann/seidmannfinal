/**
 * POST /api/admin/financeiro/recebimentos/[id]/vincular
 * body: { enrollmentId } | { alocacoes: [{ enrollmentId, valorCentavos }] }
 */

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAdmin } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import {
  manualLinkReceivedPaymentAllocations,
  type PaymentAllocationInput,
} from '@/lib/payments/reconcile'

const alocacaoSchema = z.object({
  enrollmentId: z.string().min(1),
  valorCentavos: z.number().int().positive(),
})

const bodySchema = z.union([
  z.object({ enrollmentId: z.string().min(1) }),
  z.object({ alocacoes: z.array(alocacaoSchema).min(1) }),
])

function parseAlocacoes(
  body: z.infer<typeof bodySchema>,
  valorTotal: number
): PaymentAllocationInput[] {
  if ('alocacoes' in body) {
    return body.alocacoes
  }
  return [{ enrollmentId: body.enrollmentId, valorCentavos: valorTotal }]
}

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
        { ok: false, message: 'Body inválido: enrollmentId ou alocacoes[]' },
        { status: 400 }
      )
    }

    const rp = await prisma.receivedPayment.findUnique({
      where: { id: params.id },
      select: { valor: true },
    })
    if (!rp) {
      return NextResponse.json(
        { ok: false, message: 'Recebimento não encontrado' },
        { status: 404 }
      )
    }

    const alocacoes = parseAlocacoes(parsed.data, rp.valor)

    const payment = await manualLinkReceivedPaymentAllocations(
      params.id,
      alocacoes,
      auth.session?.sub ?? null
    )

    const allocations = await prisma.receivedPaymentAllocation.findMany({
      where: { receivedPaymentId: payment.id },
      include: {
        enrollment: { select: { id: true, nome: true } },
      },
      orderBy: { createdAt: 'asc' },
    })

    return NextResponse.json({
      ok: true,
      data: {
        id: payment.id,
        status: payment.status,
        enrollmentId: payment.enrollmentId,
        semCobrancaAberta: payment.semCobrancaAberta,
        allocations: allocations.map((a) => ({
          id: a.id,
          enrollmentId: a.enrollmentId,
          enrollmentNome: a.enrollment.nome,
          valorCentavos: a.valorCentavos,
          enrollmentPaymentMonthId: a.enrollmentPaymentMonthId,
        })),
      },
    })
  } catch (error) {
    console.error('[recebimentos/vincular POST]', error)
    const message =
      error instanceof Error ? error.message : 'Erro ao vincular recebimento'
    return NextResponse.json({ ok: false, message }, { status: 400 })
  }
}
