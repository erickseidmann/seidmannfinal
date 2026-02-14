/**
 * GET /api/admin/coupons - Lista cupons
 * POST /api/admin/coupons - Cria cupom
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/auth'

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAdmin(request)
    if (!auth.authorized) {
      return NextResponse.json(
        { ok: false, message: auth.message || 'Não autorizado' },
        { status: auth.message?.includes('Não autenticado') ? 401 : 403 }
      )
    }

    const coupons = await prisma.coupon.findMany({
      orderBy: { criadoEm: 'desc' },
      include: { _count: { select: { enrollments: true } } },
    })

    const data = coupons.map((c) => ({
      id: c.id,
      nome: c.nome,
      codigo: c.codigo,
      valorPorHoraAula: c.valorPorHoraAula ? Number(c.valorPorHoraAula) : null,
      validade: c.validade?.toISOString() ?? null,
      ativo: c.ativo,
      criadoEm: c.criadoEm.toISOString(),
      inscricoesCount: Number(c._count?.enrollments ?? 0),
    }))

    return NextResponse.json({ ok: true, data })
  } catch (error) {
    console.error('[API coupons GET]', error)
    return NextResponse.json(
      { ok: false, message: 'Erro ao listar cupons' },
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

    const body = await request.json()
    const { nome, codigo, valorPorHoraAula, validade, permanente } = body

    if (!nome || typeof nome !== 'string' || nome.trim() === '') {
      return NextResponse.json(
        { ok: false, message: 'Nome do cupom é obrigatório' },
        { status: 400 }
      )
    }

    const valor = typeof valorPorHoraAula === 'number' ? valorPorHoraAula : parseFloat(String(valorPorHoraAula || '0'))
    if (Number.isNaN(valor) || valor < 0) {
      return NextResponse.json(
        { ok: false, message: 'Valor por hora-aula deve ser um número maior ou igual a zero' },
        { status: 400 }
      )
    }

    let validadeDate: Date | null = null
    if (!permanente) {
      if (validade) {
        validadeDate = new Date(validade)
        if (Number.isNaN(validadeDate.getTime())) {
          return NextResponse.json(
            { ok: false, message: 'Data de validade inválida' },
            { status: 400 }
          )
        }
      }
    }

    const codigoTrim = typeof codigo === 'string' ? codigo.trim() || null : null
    if (codigoTrim) {
      const existing = await prisma.coupon.findUnique({
        where: { codigo: codigoTrim },
      })
      if (existing) {
        return NextResponse.json(
          { ok: false, message: 'Já existe um cupom com este código' },
          { status: 400 }
        )
      }
    }

    const coupon = await prisma.coupon.create({
      data: {
        nome: nome.trim(),
        codigo: codigoTrim,
        valorPorHoraAula: valor,
        validade: validadeDate,
        ativo: true,
      },
    })

    return NextResponse.json({
      ok: true,
      data: {
        id: coupon.id,
        nome: coupon.nome,
        codigo: coupon.codigo,
        valorPorHoraAula: Number(coupon.valorPorHoraAula),
        validade: coupon.validade?.toISOString() ?? null,
        ativo: coupon.ativo,
        criadoEm: coupon.criadoEm.toISOString(),
      },
    })
  } catch (error) {
    console.error('[API coupons POST]', error)
    return NextResponse.json(
      { ok: false, message: 'Erro ao criar cupom' },
      { status: 500 }
    )
  }
}
