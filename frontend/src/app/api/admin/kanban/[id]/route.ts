/**
 * PATCH /api/admin/kanban/[id] – atualiza card (title, setor, assignedToId, column, orderIndex); notifica se assignedToId mudar
 * DELETE /api/admin/kanban/[id] – remove card
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/auth'

const COLUMNS = ['TODO', 'DOING', 'DONE'] as const
const PRIORIDADES = ['EMERGENCIA', 'PODE_ESPERAR', 'FIQUE_ATENTO'] as const

export async function PATCH(
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
    const { id } = await params
    const body = await request.json()
    const existing = await prisma.kanbanCard.findUnique({ where: { id }, include: { assignedTo: true } })
    if (!existing) {
      return NextResponse.json(
        { ok: false, message: 'Card não encontrado' },
        { status: 404 }
      )
    }
    const data: { title?: string; setor?: string | null; assignedToId?: string | null; column?: string; orderIndex?: number; prioridade?: string | null } = {}
    if (typeof body.title === 'string' && body.title.trim()) data.title = body.title.trim()
    if ('setor' in body) data.setor = body.setor ? String(body.setor).trim() : null
    if ('assignedToId' in body) data.assignedToId = body.assignedToId || null
    if (body.column && COLUMNS.includes(body.column)) data.column = body.column
    if (typeof body.orderIndex === 'number') data.orderIndex = body.orderIndex
    if ('prioridade' in body) data.prioridade = body.prioridade && PRIORIDADES.includes(body.prioridade) ? body.prioridade : null

    const card = await prisma.kanbanCard.update({
      where: { id },
      data,
      include: {
        assignedTo: { select: { id: true, nome: true } },
      },
    })

    if (data.assignedToId !== undefined && data.assignedToId && data.assignedToId !== existing.assignedToId) {
      await prisma.adminNotification.create({
        data: {
          userId: data.assignedToId,
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
    })
  } catch (error) {
    console.error('[api/admin/kanban PATCH]', error)
    return NextResponse.json(
      { ok: false, message: 'Erro ao atualizar card' },
      { status: 500 }
    )
  }
}

export async function DELETE(
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
    const { id } = await params
    await prisma.kanbanCard.delete({ where: { id } })
    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('[api/admin/kanban DELETE]', error)
    return NextResponse.json(
      { ok: false, message: 'Erro ao excluir card' },
      { status: 500 }
    )
  }
}
