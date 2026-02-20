/**
 * DELETE /api/admin/financeiro/cobrancas/[id] - Cancela boleto na Cora
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/auth'
import { cancelInvoice } from '@/lib/cora/client'

export async function DELETE(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const auth = await requireAdmin(_request)
    if (!auth.authorized) {
      return NextResponse.json(
        { ok: false, message: auth.message || 'Não autorizado' },
        { status: auth.message?.includes('Não autenticado') ? 401 : 403 }
      )
    }

    const id = params.id
    const invoice = await prisma.coraInvoice.findUnique({
      where: { id },
    })

    if (!invoice) {
      return NextResponse.json(
        { ok: false, message: 'Boleto não encontrado' },
        { status: 404 }
      )
    }

    if (invoice.status === 'PAID') {
      return NextResponse.json(
        { ok: false, message: 'Não é possível cancelar boleto já pago' },
        { status: 400 }
      )
    }

    if (invoice.status === 'CANCELLED') {
      return NextResponse.json(
        { ok: true, message: 'Boleto já estava cancelado' }
      )
    }

    await cancelInvoice(invoice.coraInvoiceId)
    await prisma.coraInvoice.update({
      where: { id },
      data: { status: 'CANCELLED' },
    })

    return NextResponse.json({
      ok: true,
      message: 'Boleto cancelado com sucesso',
    })
  } catch (error) {
    console.error('[api/admin/financeiro/cobrancas DELETE]', error)
    return NextResponse.json(
      {
        ok: false,
        message: error instanceof Error ? error.message : 'Erro ao cancelar boleto',
      },
      { status: 500 }
    )
  }
}
