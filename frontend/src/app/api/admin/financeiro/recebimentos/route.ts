/**
 * GET /api/admin/financeiro/recebimentos — fila de conciliação (paginada).
 */

import { NextRequest, NextResponse } from 'next/server'
import type { PaymentProvider, ReceivedPaymentStatus, Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/auth'
import {
  buildRefMonthStatusMapForPayment,
  collectPreviousMonthPendingLookups,
  hasPreviousMonthPaymentPendingCurrent,
  monthLookupKey,
  type AllocationPaidMonth,
} from '@/lib/payments/recebimento-mes-anterior-pendente'

function mapAllocationRows(
  r: {
    enrollmentId: string | null
    enrollmentPaymentMonth: { year: number; month: number } | null
    allocations: Array<{
      enrollmentId: string
      enrollmentPaymentMonth: { year: number; month: number } | null
    }>
  }
): { allocations: AllocationPaidMonth[]; fallback: AllocationPaidMonth | null } {
  const allocations: AllocationPaidMonth[] = r.allocations.map((a) => ({
    enrollmentId: a.enrollmentId,
    paidYear: a.enrollmentPaymentMonth?.year ?? null,
    paidMonth: a.enrollmentPaymentMonth?.month ?? null,
  }))
  const fallback: AllocationPaidMonth | null =
    r.enrollmentId && r.enrollmentPaymentMonth
      ? {
          enrollmentId: r.enrollmentId,
          paidYear: r.enrollmentPaymentMonth.year,
          paidMonth: r.enrollmentPaymentMonth.month,
        }
      : null
  return { allocations, fallback }
}

const PROVIDERS: PaymentProvider[] = ['CORA', 'INFINITEPAY', 'SANTANDER', 'LIXEL']

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAdmin(request)
    if (!auth.authorized) {
      return NextResponse.json(
        { ok: false, message: auth.message || 'Não autorizado' },
        { status: auth.message?.includes('Não autenticado') ? 401 : 403 }
      )
    }

    const { searchParams } = new URL(request.url)
    const statusParam = searchParams.get('status')
    const providerParam = searchParams.get('provider')
    const q = (searchParams.get('q') ?? '').trim()
    const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10) || 1)
    const pageSize = Math.min(
      100,
      Math.max(1, parseInt(searchParams.get('pageSize') ?? '20', 10) || 20)
    )

    const where: Prisma.ReceivedPaymentWhereInput = {}

    if (
      statusParam &&
      (['PENDENTE', 'VINCULADO', 'IGNORADO'] as ReceivedPaymentStatus[]).includes(
        statusParam as ReceivedPaymentStatus
      )
    ) {
      where.status = statusParam as ReceivedPaymentStatus
    }

    if (providerParam && PROVIDERS.includes(providerParam as PaymentProvider)) {
      where.provider = providerParam as PaymentProvider
    }

    if (q) {
      where.OR = [
        { documentoPagador: { contains: q.replace(/\D/g, '') } },
        { nomePagador: { contains: q } },
        { txid: { contains: q } },
        { endToEndId: { contains: q } },
        { referencia: { contains: q } },
        { providerPaymentId: { contains: q } },
      ]
    }

    const [total, items] = await Promise.all([
      prisma.receivedPayment.count({ where }),
      prisma.receivedPayment.findMany({
        where,
        orderBy: { dataPagamento: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          enrollment: { select: { id: true, nome: true, email: true } },
          enrollmentPaymentMonth: { select: { year: true, month: true } },
          allocations: {
            orderBy: { createdAt: 'asc' },
            include: {
              enrollment: { select: { id: true, nome: true } },
              enrollmentPaymentMonth: {
                select: { year: true, month: true, paymentStatus: true },
              },
            },
          },
        },
      }),
    ])

    const pendingLookups = collectPreviousMonthPendingLookups(
      items.map((r) => {
        const { allocations, fallback } = mapAllocationRows(r)
        return {
          status: r.status,
          dataPagamento: r.dataPagamento,
          allocations,
          fallback,
        }
      })
    )

    const refMonthRows =
      pendingLookups.length > 0
        ? await prisma.enrollmentPaymentMonth.findMany({
            where: {
              OR: pendingLookups.map((l) => ({
                enrollmentId: l.enrollmentId,
                year: l.year,
                month: l.month,
              })),
            },
            select: {
              enrollmentId: true,
              year: true,
              month: true,
              paymentStatus: true,
            },
          })
        : []

    const refMonthByKey = new Map<string, string | null>()
    for (const row of refMonthRows) {
      refMonthByKey.set(
        monthLookupKey(row.enrollmentId, row.year, row.month),
        row.paymentStatus
      )
    }

    return NextResponse.json({
      ok: true,
      data: {
        items: items.map((r) => {
          const { allocations, fallback } = mapAllocationRows(r)
          const mesAnteriorReferenciaPendente =
            r.status === 'VINCULADO' &&
            hasPreviousMonthPaymentPendingCurrent(
              r.dataPagamento,
              allocations,
              fallback,
              buildRefMonthStatusMapForPayment(
                r.dataPagamento,
                allocations,
                fallback,
                refMonthByKey
              )
            )

          return {
            id: r.id,
            provider: r.provider,
            providerPaymentId: r.providerPaymentId,
            valor: r.valor,
            dataPagamento: r.dataPagamento.toISOString(),
            metodo: r.metodo,
            documentoPagador: r.documentoPagador,
            nomePagador: r.nomePagador,
            txid: r.txid,
            endToEndId: r.endToEndId,
            referencia: r.referencia,
            status: r.status,
            divergenciaValor: r.divergenciaValor,
            semCobrancaAberta: r.semCobrancaAberta,
            mesAnteriorReferenciaPendente,
            enrollmentId: r.enrollmentId,
            enrollmentNome: r.enrollment?.nome ?? null,
            allocations: r.allocations.map((a) => ({
              id: a.id,
              enrollmentId: a.enrollmentId,
              enrollmentNome: a.enrollment.nome,
              valorCentavos: a.valorCentavos,
              paidYear: a.enrollmentPaymentMonth?.year ?? null,
              paidMonth: a.enrollmentPaymentMonth?.month ?? null,
            })),
            createdAt: r.createdAt.toISOString(),
          }
        }),
        total,
        page,
        pageSize,
      },
    })
  } catch (error) {
    console.error('[api/admin/financeiro/recebimentos GET]', error)
    return NextResponse.json(
      { ok: false, message: 'Erro ao listar recebimentos' },
      { status: 500 }
    )
  }
}
