/**
 * POST /api/admin/financeiro/administracao/expenses
 * Adiciona despesa(s) administrativa(s). Se repeatMonths > 1, cria uma linha por mês.
 * Body: name, description?, valor, repeatMonthly (boolean), repeatMonths (number), startYear?, startMonth?
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/auth'

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
    const { name, description, valor, repeatMonthly, repeatMonths: repeatMonthsParam, startYear, startMonth } = body
    const nameTrim = typeof name === 'string' ? name.trim() : ''
    if (!nameTrim) {
      return NextResponse.json(
        { ok: false, message: 'Nome da despesa é obrigatório' },
        { status: 400 }
      )
    }
    const valorNum = Number(valor)
    if (Number.isNaN(valorNum) || valorNum < 0) {
      return NextResponse.json(
        { ok: false, message: 'Valor inválido' },
        { status: 400 }
      )
    }
    const repeat = repeatMonthly === true || repeatMonthly === 'true'
    const repeatMonths = repeat ? Math.min(120, Math.max(1, Number(repeatMonthsParam) || 1)) : 1
    const now = new Date()
    const startY = startYear != null ? Number(startYear) : now.getFullYear()
    const startM = startMonth != null ? Number(startMonth) : now.getMonth() + 1
    if (Number.isNaN(startY) || Number.isNaN(startM) || startM < 1 || startM > 12) {
      return NextResponse.json(
        { ok: false, message: 'Ano/mês de início inválido' },
        { status: 400 }
      )
    }

    if (!prisma.adminExpense) {
      return NextResponse.json(
        { ok: false, message: 'Modelo não disponível. Rode: npx prisma generate' },
        { status: 503 }
      )
    }

    const created: { id: string; year: number; month: number }[] = []
    for (let i = 0; i < repeatMonths; i++) {
      let y = startY
      let m = startM + i
      while (m > 12) {
        m -= 12
        y += 1
      }
      const expense = await prisma.adminExpense.create({
        data: {
          name: nameTrim,
          description: typeof description === 'string' ? description.trim() || null : null,
          valor: valorNum,
          year: y,
          month: m,
          paymentStatus: 'EM_ABERTO',
        },
      })
      created.push({ id: expense.id, year: y, month: m })
    }

    return NextResponse.json({
      ok: true,
      data: { count: created.length, created },
      message: created.length > 1 ? `${created.length} despesas criadas` : 'Despesa criada',
    })
  } catch (error) {
    console.error('[api/admin/financeiro/administracao/expenses POST]', error)
    return NextResponse.json(
      { ok: false, message: 'Erro ao criar despesa(s)' },
      { status: 500 }
    )
  }
}
