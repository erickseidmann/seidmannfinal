/**
 * PATCH /api/admin/financeiro/administracao/expenses/[id] – atualiza valor ou status
 * DELETE /api/admin/financeiro/administracao/expenses/[id] – remove a despesa
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/auth'
import { updateExpenseSchema } from '@/lib/finance'

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
    const parsed = updateExpenseSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { ok: false, message: 'Dados inválidos', details: parsed.error.flatten() },
        { status: 400 }
      )
    }
    const data = parsed.data
    const updateData: {
      name?: string
      description?: string | null
      valor?: number
      paymentStatus?: string
      paidAt?: Date | null
      receiptUrl?: string | null
    } = {}
    if (data.name !== undefined) updateData.name = data.name.trim()
    if (data.description !== undefined) {
      const desc = data.description?.trim()
      updateData.description = desc ? desc : null
    }
    if (data.valor !== undefined) updateData.valor = data.valor
    if (data.paymentStatus === 'EM_ABERTO') {
      updateData.paymentStatus = 'EM_ABERTO'
      updateData.paidAt = null
      updateData.receiptUrl = null
    } else if (data.paymentStatus === 'PAGO') {
      updateData.paymentStatus = 'PAGO'
      if (data.paidAt) {
        const parts = data.paidAt.trim().split('-').map(Number)
        const [y, mo, d] = parts
        if (y && mo && d) {
          updateData.paidAt = new Date(Date.UTC(y, mo - 1, d, 12, 0, 0))
        }
      }
      updateData.receiptUrl = data.receiptUrl?.trim() ?? null
    } else if (data.paymentStatus !== undefined) {
      updateData.paymentStatus = data.paymentStatus
    }

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
