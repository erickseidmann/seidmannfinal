/**
 * GET /api/admin/holidays?start=YYYY-MM-DD&end=YYYY-MM-DD  — lista feriados no intervalo
 * POST /api/admin/holidays — body: { date: "YYYY-MM-DD" } — define feriado
 * DELETE /api/admin/holidays?date=YYYY-MM-DD — remove feriado
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/auth'

function toDateKey(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

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
    const startParam = searchParams.get('start')
    const endParam = searchParams.get('end')
    if (!startParam || !endParam) {
      return NextResponse.json(
        { ok: false, message: 'Parâmetros start e end (YYYY-MM-DD) são obrigatórios' },
        { status: 400 }
      )
    }

    const holidays = await prisma.holiday.findMany({
      where: {
        dateKey: { gte: startParam, lte: endParam },
      },
      orderBy: { dateKey: 'asc' },
    })

    return NextResponse.json({
      ok: true,
      data: { holidays: holidays.map((h) => h.dateKey) },
    })
  } catch (error) {
    console.error('[api/admin/holidays GET]', error)
    return NextResponse.json(
      { ok: false, message: 'Erro ao listar feriados' },
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

    const body = await request.json().catch(() => ({}))
    const dateStr = body.date
    if (!dateStr || typeof dateStr !== 'string') {
      return NextResponse.json(
        { ok: false, message: 'Campo date (YYYY-MM-DD) é obrigatório' },
        { status: 400 }
      )
    }

    const d = new Date(dateStr + 'T12:00:00')
    if (Number.isNaN(d.getTime())) {
      return NextResponse.json(
        { ok: false, message: 'Data inválida' },
        { status: 400 }
      )
    }
    const dateKey = toDateKey(d)

    try {
      await prisma.holiday.create({ data: { dateKey } })
    } catch (createError: unknown) {
      // P2002 = unique constraint (já existe feriado nessa data)
      const code = (createError as { code?: string })?.code
      if (code !== 'P2002') throw createError
    }

    return NextResponse.json({ ok: true, data: { dateKey } })
  } catch (error) {
    console.error('[api/admin/holidays POST]', error)
    return NextResponse.json(
      { ok: false, message: 'Erro ao definir feriado' },
      { status: 500 }
    )
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const auth = await requireAdmin(request)
    if (!auth.authorized) {
      return NextResponse.json(
        { ok: false, message: auth.message || 'Não autorizado' },
        { status: auth.message?.includes('Não autenticado') ? 401 : 403 }
      )
    }

    const { searchParams } = new URL(request.url)
    const dateStr = searchParams.get('date')
    if (!dateStr) {
      return NextResponse.json(
        { ok: false, message: 'Parâmetro date (YYYY-MM-DD) é obrigatório' },
        { status: 400 }
      )
    }

    await prisma.holiday.deleteMany({
      where: { dateKey: dateStr },
    })

    return NextResponse.json({ ok: true, message: 'Feriado removido' })
  } catch (error) {
    console.error('[api/admin/holidays DELETE]', error)
    return NextResponse.json(
      { ok: false, message: 'Erro ao remover feriado' },
      { status: 500 }
    )
  }
}
