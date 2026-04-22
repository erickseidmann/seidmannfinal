/**
 * GET / POST — regras de categoria por favorecido (identificação do extrato).
 */

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/auth'
import { normalizarIdentificacaoMovimentacao } from '@/lib/movimentacao-ident-regra'

const postSchema = z.object({
  identificacaoOriginal: z.string().min(1).max(500),
  movTipo: z.enum(['ENTRADA', 'SAIDA']),
  categoriaPrincipal: z.string().min(1).max(64),
  subcategoria: z.string().max(64).optional().default(''),
  categoriaOutro: z.string().max(500).optional().default(''),
})

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAdmin(request)
    if (!auth.authorized) {
      return NextResponse.json(
        { ok: false, message: auth.message || 'Não autorizado' },
        { status: auth.message?.includes('Não autenticado') ? 401 : 403 }
      )
    }

    const rows = await prisma.adminMovimentacaoIdentRegra.findMany({
      orderBy: [{ identificacaoExemplo: 'asc' }, { identificacaoChave: 'asc' }],
    })
    return NextResponse.json({
      ok: true,
      data: {
        items: rows.map((r) => ({
          id: r.id,
          identificacaoChave: r.identificacaoChave,
          identificacaoExemplo: r.identificacaoExemplo,
          movTipo: r.movTipo,
          categoriaPrincipal: r.categoriaPrincipal,
          subcategoria: r.subcategoria,
          categoriaOutro: r.categoriaOutro,
        })),
      },
    })
  } catch (e) {
    console.error('[movimentacao-ident-regras GET]', e)
    return NextResponse.json({ ok: false, message: 'Erro ao listar regras' }, { status: 500 })
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
    const parsed = postSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { ok: false, message: 'Dados inválidos', details: parsed.error.flatten() },
        { status: 400 }
      )
    }
    const b = parsed.data
    const identificacaoChave = normalizarIdentificacaoMovimentacao(b.identificacaoOriginal)
    if (!identificacaoChave) {
      return NextResponse.json({ ok: false, message: 'Identificação inválida após normalização' }, { status: 400 })
    }

    const row = await prisma.adminMovimentacaoIdentRegra.upsert({
      where: {
        identificacaoChave_movTipo: { identificacaoChave, movTipo: b.movTipo },
      },
      create: {
        identificacaoChave,
        movTipo: b.movTipo,
        categoriaPrincipal: b.categoriaPrincipal,
        subcategoria: b.subcategoria,
        categoriaOutro: b.categoriaOutro,
        identificacaoExemplo: b.identificacaoOriginal.trim().slice(0, 500),
      },
      update: {
        categoriaPrincipal: b.categoriaPrincipal,
        subcategoria: b.subcategoria,
        categoriaOutro: b.categoriaOutro,
        identificacaoExemplo: b.identificacaoOriginal.trim().slice(0, 500),
      },
    })

    return NextResponse.json({
      ok: true,
      message: 'Regra salva. Novas importações e a lista ao atualizar usarão esta categoria.',
      data: { id: row.id },
    })
  } catch (e) {
    console.error('[movimentacao-ident-regras POST]', e)
    return NextResponse.json({ ok: false, message: 'Erro ao salvar regra' }, { status: 500 })
  }
}
