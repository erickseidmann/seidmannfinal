/**
 * GET /api/admin/coupons/[id]/enrollments
 * Lista inscrições (enrollments) que usaram o cupom.
 * Query: month & year (filtro por mês) ou start & end (período).
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/auth'

export async function GET(
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

    const { id: couponId } = await params
    const { searchParams } = new URL(request.url)
    const monthParam = searchParams.get('month')
    const yearParam = searchParams.get('year')
    const startParam = searchParams.get('start')
    const endParam = searchParams.get('end')

    const coupon = await prisma.coupon.findUnique({
      where: { id: couponId },
    })
    if (!coupon) {
      return NextResponse.json(
        { ok: false, message: 'Cupom não encontrado' },
        { status: 404 }
      )
    }

    let startDate: Date | null = null
    let endDate: Date | null = null

    if (monthParam && yearParam) {
      const month = parseInt(monthParam, 10)
      const year = parseInt(yearParam, 10)
      if (!Number.isNaN(month) && month >= 1 && month <= 12 && !Number.isNaN(year)) {
        startDate = new Date(year, month - 1, 1)
        endDate = new Date(year, month, 0, 23, 59, 59, 999)
      }
    } else if (startParam && endParam) {
      const s = new Date(startParam)
      const e = new Date(endParam)
      if (!Number.isNaN(s.getTime()) && !Number.isNaN(e.getTime())) {
        startDate = s
        startDate.setHours(0, 0, 0, 0)
        endDate = e
        endDate.setHours(23, 59, 59, 999)
      }
    }

    const where: { couponId: string; criadoEm?: { gte?: Date; lte?: Date } } = {
      couponId,
    }
    if (startDate && endDate) {
      where.criadoEm = { gte: startDate, lte: endDate }
    }

    const enrollments = await prisma.enrollment.findMany({
      where,
      select: {
        id: true,
        nome: true,
        email: true,
        criadoEm: true,
      },
      orderBy: { criadoEm: 'asc' },
    })

    const data = enrollments.map((e) => ({
      id: e.id,
      nome: e.nome,
      email: e.email,
      criadoEm: e.criadoEm.toISOString(),
    }))

    return NextResponse.json({
      ok: true,
      data,
      periodo: startDate && endDate
        ? { start: startDate.toISOString(), end: endDate.toISOString() }
        : null,
    })
  } catch (error) {
    console.error('[API coupons enrollments GET]', error)
    return NextResponse.json(
      { ok: false, message: 'Erro ao listar inscrições' },
      { status: 500 }
    )
  }
}
