/**
 * GET /api/admin/kanban – lista todos os cards
 * POST /api/admin/kanban – cria card (title, setor?, assignedToId?, column); notifica assignedTo se informado
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/auth'

const COLUMNS = ['TODO', 'DOING', 'DONE'] as const

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAdmin(request)
    if (!auth.authorized) {
      return NextResponse.json(
        { ok: false, message: auth.message || 'Não autorizado' },
        { status: auth.message?.includes('Não autenticado') ? 401 : 403 }
      )
    }
    const cards = await prisma.kanbanCard.findMany({
      orderBy: [{ column: 'asc' }, { orderIndex: 'asc' }, { criadoEm: 'asc' }],
      include: {
        assignedTo: { select: { id: true, nome: true } },
      },
    })
    return NextResponse.json({
      ok: true,
      data: cards.map((c) => ({
        id: c.id,
        title: c.title,
        setor: c.setor,
        assignedToId: c.assignedToId,
        assignedTo: c.assignedTo ? { id: c.assignedTo.id, nome: c.assignedTo.nome } : null,
        column: c.column,
        orderIndex: c.orderIndex,
        prioridade: c.prioridade ?? null,
        criadoEm: c.criadoEm.toISOString(),
      })),
    })
  } catch (error) {
    console.error('[api/admin/kanban GET]', error)
    return NextResponse.json(
      { ok: false, message: 'Erro ao listar kanban' },
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
    const PRIORIDADES = ['EMERGENCIA', 'PODE_ESPERAR', 'FIQUE_ATENTO'] as const
    const body = await request.json()
    const { title, setor, assignedToId, column, prioridade } = body
    const titleStr = typeof title === 'string' ? title.trim() : ''
    if (!titleStr) {
      return NextResponse.json(
        { ok: false, message: 'Título é obrigatório' },
        { status: 400 }
      )
    }
    const col = column && COLUMNS.includes(column) ? column : 'TODO'
    const prio = prioridade && PRIORIDADES.includes(prioridade) ? prioridade : null
    const maxOrder = await prisma.kanbanCard
      .aggregate({ where: { column: col }, _max: { orderIndex: true } })
      .then((r) => (r._max.orderIndex ?? -1) + 1)

    const card = await prisma.kanbanCard.create({
      data: {
        title: titleStr,
        setor: setor ? String(setor).trim() : null,
        assignedToId: assignedToId || null,
        column: col,
        orderIndex: maxOrder,
        prioridade: prio,
      },
      include: {
        assignedTo: { select: { id: true, nome: true } },
      },
    })

    if (card.assignedToId && card.assignedTo) {
      await prisma.adminNotification.create({
        data: {
          userId: card.assignedToId,
          message: `Kanban: tarefa atribuída a você – "${card.title}"${card.setor ? ` (${card.setor})` : ''}`,
        },
      })
    }

    return NextResponse.json({
      ok: true,
      data: {
        id: card.id,
        title: card.title,
        setor: card.setor,
        assignedToId: card.assignedToId,
        assignedTo: card.assignedTo ? { id: card.assignedTo.id, nome: card.assignedTo.nome } : null,
        column: card.column,
        orderIndex: card.orderIndex,
        prioridade: card.prioridade ?? null,
        criadoEm: card.criadoEm.toISOString(),
      },
    }, { status: 201 })
  } catch (error) {
    console.error('[api/admin/kanban POST]', error)
    return NextResponse.json(
      { ok: false, message: 'Erro ao criar card' },
      { status: 500 }
    )
  }
}
