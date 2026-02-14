/**
 * GET /api/coupons/validate?code=XXX
 * Valida um código de cupom e retorna valor por hora-aula (uso na matrícula pública).
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const code = searchParams.get('code')?.trim().toUpperCase()
    if (!code) {
      return NextResponse.json(
        { ok: false, message: 'Código é obrigatório' },
        { status: 400 }
      )
    }

    const coupon = await prisma.coupon.findFirst({
      where: {
        codigo: code,
        ativo: true,
        OR: [
          { validade: null },
          { validade: { gte: new Date() } },
        ],
      },
    })

    if (!coupon) {
      return NextResponse.json({ ok: false, message: 'Cupom inválido ou expirado' })
    }

    return NextResponse.json({
      ok: true,
      data: {
        id: coupon.id,
        nome: coupon.nome,
        codigo: coupon.codigo,
        valorPorHoraAula: Number(coupon.valorPorHoraAula),
      },
    })
  } catch (error) {
    console.error('[API coupons validate]', error)
    return NextResponse.json(
      { ok: false, message: 'Erro ao validar cupom' },
      { status: 500 }
    )
  }
}
