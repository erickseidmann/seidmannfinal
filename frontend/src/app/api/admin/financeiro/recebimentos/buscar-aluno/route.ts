/**
 * GET /api/admin/financeiro/recebimentos/buscar-aluno?q=
 * Autocomplete para vínculo manual.
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

    const q = (new URL(request.url).searchParams.get('q') ?? '').trim()
    if (q.length < 2) {
      return NextResponse.json({ ok: true, data: { items: [] } })
    }

    const digits = q.replace(/\D/g, '')
    const items = await prisma.enrollment.findMany({
      where: {
        OR: [
          { nome: { contains: q } },
          { email: { contains: q } },
          ...(digits.length >= 3 ? [{ cpf: { contains: digits } }] : []),
        ],
      },
      select: {
        id: true,
        nome: true,
        email: true,
        cpf: true,
        valorMensalidade: true,
        status: true,
      },
      orderBy: { nome: 'asc' },
      take: 15,
    })

    return NextResponse.json({
      ok: true,
      data: {
        items: items.map((e) => ({
          id: e.id,
          nome: e.nome,
          email: e.email,
          cpf: e.cpf,
          valorMensalidade:
            e.valorMensalidade != null ? Number(e.valorMensalidade) : null,
          status: e.status,
        })),
      },
    })
  } catch (error) {
    console.error('[recebimentos/buscar-aluno GET]', error)
    return NextResponse.json(
      { ok: false, message: 'Erro na busca' },
      { status: 500 }
    )
  }
}
