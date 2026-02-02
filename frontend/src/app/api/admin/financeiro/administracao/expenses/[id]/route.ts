/**
 * PATCH /api/admin/financeiro/administracao/expenses/[id] – atualiza valor ou status
 * DELETE /api/admin/financeiro/administracao/expenses/[id] – remove a despesa
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/auth'

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAdmin(request)
    if (!auth.authorized) {
      return NextResponse.json(
        { ok: false, message: auth.message || 'Não autorizado' },
        { status: auth.message?.includes('Não autenticado') ? 401 : 403 }
      )
    }

    const { id } = await params
    const body = await request.json().catch(() => ({}))
    const { valor, paymentStatus } = body

    const updateData: { valor?: number; paymentStatus?: string } = {}
    if (valor !== undefined) {
      const v = Number(valor)
      if (!Number.isNaN(v) && v >= 0) updateData.valor = v
    }
    if (paymentStatus !== undefined) updateData.paymentStatus = paymentStatus === 'PAGO' ? 'PAGO' : 'EM_ABERTO'

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json({ ok: true, message: 'Nada a atualizar' })
    }

    if (!prisma.adminExpense) {
      return NextResponse.json(
        { ok: false, message: 'Modelo não disponível' },
        { status: 503 }
      )
    }

    await prisma.adminExpense.update({
      where: { id },
      data: updateData,
    })
    return NextResponse.json({ ok: true, message: 'Despesa atualizada' })
  } catch (error) {
    console.error('[api/admin/financeiro/administracao/expenses/[id] PATCH]', error)
    return NextResponse.json(
      { ok: false, message: 'Erro ao atualizar' },
      { status: 500 }
    )
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAdmin(request)
    if (!auth.authorized) {
      return NextResponse.json(
        { ok: false, message: auth.message || 'Não autorizado' },
        { status: auth.message?.includes('Não autenticado') ? 401 : 403 }
      )
    }

    const { id } = await params
    if (!prisma.adminExpense) {
      return NextResponse.json(
        { ok: false, message: 'Modelo não disponível' },
        { status: 503 }
      )
    }

    await prisma.adminExpense.delete({
      where: { id },
    })
    return NextResponse.json({ ok: true, message: 'Despesa removida' })
  } catch (error) {
    console.error('[api/admin/financeiro/administracao/expenses/[id] DELETE]', error)
    return NextResponse.json(
      { ok: false, message: 'Erro ao remover' },
      { status: 500 }
    )
  }
}
