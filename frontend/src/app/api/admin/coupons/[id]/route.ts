/**
 * PATCH /api/admin/coupons/[id] - Atualiza cupom (ex.: ativo)
 * DELETE /api/admin/coupons/[id] - Exclui cupom
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/auth'

export async function PATCH(
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

    const couponId = params.id
    const coupon = await prisma.coupon.findUnique({ where: { id: couponId } })
    if (!coupon) {
      return NextResponse.json(
        { ok: false, message: 'Cupom não encontrado' },
        { status: 404 }
      )
    }

    const body = await request.json().catch(() => ({}))
    const ativo = body.ativo
    if (typeof ativo !== 'boolean') {
      return NextResponse.json(
        { ok: false, message: 'Envie ativo (true/false)' },
        { status: 400 }
      )
    }

    await prisma.coupon.update({
      where: { id: couponId },
      data: { ativo },
    })

    return NextResponse.json({
      ok: true,
      message: ativo ? 'Cupom ativado' : 'Cupom inativado',
    })
  } catch (error) {
    console.error('[API coupons PATCH]', error)
    return NextResponse.json(
      { ok: false, message: 'Erro ao atualizar cupom' },
      { status: 500 }
    )
  }
}

export async function DELETE(
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

    const couponId = params.id
    const coupon = await prisma.coupon.findUnique({ where: { id: couponId } })
    if (!coupon) {
      return NextResponse.json(
        { ok: false, message: 'Cupom não encontrado' },
        { status: 404 }
      )
    }

    await prisma.coupon.delete({ where: { id: couponId } })

    return NextResponse.json({
      ok: true,
      message: 'Cupom excluído',
    })
  } catch (error) {
    console.error('[API coupons DELETE]', error)
    return NextResponse.json(
      { ok: false, message: 'Erro ao excluir cupom' },
      { status: 500 }
    )
  }
}
