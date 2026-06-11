/**
 * PUT /api/admin/financeiro/relatorios/entrada-justificativa
 * Salva justificativa quando entradas do extrato ≠ pagamentos de alunos no mês.
 */

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAdmin } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const MIN_JUSTIFICATIVA_LEN = 15

const bodySchema = z.object({
  year: z.number().int().min(2000).max(2100),
  month: z.number().int().min(1).max(12),
  justificativa: z.string().trim().min(MIN_JUSTIFICATIVA_LEN),
})

export async function PUT(request: NextRequest) {
  try {
    const auth = await requireAdmin(request)
    if (!auth.authorized) {
      return NextResponse.json(
        { ok: false, message: auth.message || 'Não autorizado' },
        { status: auth.message?.includes('Não autenticado') ? 401 : 403 }
      )
    }

    const body = await request.json().catch(() => ({}))
    const parsed = bodySchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        {
          ok: false,
          message: `Informe uma justificativa com pelo menos ${MIN_JUSTIFICATIVA_LEN} caracteres.`,
        },
        { status: 400 }
      )
    }

    const { year, month, justificativa } = parsed.data

    const row = await prisma.adminFinanceiroEntradaJustificativa.upsert({
      where: { year_month: { year, month } },
      create: { year, month, justificativa },
      update: { justificativa },
      select: { id: true, year: true, month: true, justificativa: true, atualizadoEm: true },
    })

    return NextResponse.json({ ok: true, data: { item: row } })
  } catch (e) {
    console.error('[relatorios/entrada-justificativa PUT]', e)
    return NextResponse.json({ ok: false, message: 'Erro ao salvar justificativa.' }, { status: 500 })
  }
}
