/**
 * POST /api/admin/financeiro/recebimentos/[id]/vincular
 * body: { enrollmentId, justificativaConciliacao? } | { alocacoes: [...], justificativaConciliacao? }
 */

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAdmin } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import {
  manualLinkReceivedPaymentAllocations,
  type PaymentAllocationInput,
} from '@/lib/payments/reconcile'
import { mensalidadeCentavos } from '@/lib/payments/confirm-enrollment-payment'
import {
  requiresRecebimentoJustificativa,
  validateRecebimentoJustificativa,
} from '@/lib/payments/recebimento-justificativa'

const alocacaoSchema = z.object({
  enrollmentId: z.string().min(1),
  valorCentavos: z.number().int().positive(),
})

const bodySchema = z.union([
  z.object({
    enrollmentId: z.string().min(1),
    justificativaConciliacao: z.string().optional(),
  }),
  z.object({
    alocacoes: z.array(alocacaoSchema).min(1),
    justificativaConciliacao: z.string().optional(),
  }),
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

function getJustificativaFromBody(body: z.infer<typeof bodySchema>): string | undefined {
  return body.justificativaConciliacao
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
      select: { valor: true, divergenciaValor: true },
    })
    if (!rp) {
      return NextResponse.json(
        { ok: false, message: 'Recebimento não encontrado' },
        { status: 404 }
      )
    }

    const alocacoes = parseAlocacoes(parsed.data, rp.valor)
    const enrollmentIds = alocacoes.map((a) => a.enrollmentId)
    const enrollments = await prisma.enrollment.findMany({
      where: { id: { in: enrollmentIds } },
      select: {
        id: true,
        valorMensalidade: true,
        paymentInfo: { select: { valorMensal: true } },
      },
    })
    const mensalidadeById = new Map(
      enrollments.map((e) => [e.id, mensalidadeCentavos(e) || null] as const)
    )

    const justificativaRequired = requiresRecebimentoJustificativa({
      divergenciaValor: rp.divergenciaValor,
      valorRecebimentoCentavos: rp.valor,
      alocacoes: alocacoes.map((a) => ({
        valorCentavos: a.valorCentavos,
        valorMensalidadeCentavos: mensalidadeById.get(a.enrollmentId) ?? null,
      })),
    })

    const justificativaCheck = validateRecebimentoJustificativa(
      getJustificativaFromBody(parsed.data),
      justificativaRequired
    )
    if (!justificativaCheck.ok) {
      return NextResponse.json({ ok: false, message: justificativaCheck.message }, { status: 400 })
    }

    const payment = await manualLinkReceivedPaymentAllocations(
      params.id,
      alocacoes,
      auth.session?.sub ?? null,
      { justificativaConciliacao: justificativaCheck.value }
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
        justificativaConciliacao: payment.justificativaConciliacao,
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
