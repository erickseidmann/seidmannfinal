/**
 * PATCH /api/admin/dashboard-todos/[id]
 *   - { urgent: boolean } — marca/desmarca urgência (fogo); lista ordena urgentes no topo
 *   - { done: boolean, resolutionNote?: string } — ao concluir (done: true), resolutionNote é obrigatório (1–2000 caracteres)
 * DELETE /api/admin/dashboard-todos/[id]
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/auth'

function todoJson(t: {
  id: string
  text: string
  category: string
  isUrgent: boolean
  dayKey: string
  status: string
  criadoEm: Date
  createdByUserId: string
  resolutionNote: string | null
  completedAt: Date | null
  completedByUserId: string | null
  createdBy: { nome: string }
  completedBy: { nome: string } | null
}) {
  return {
    id: t.id,
    text: t.text,
    category: t.category,
    isUrgent: t.isUrgent,
    dayKey: t.dayKey,
    status: t.status,
    criadoEm: t.criadoEm.toISOString(),
    createdByUserId: t.createdByUserId,
    createdByName: t.createdBy.nome,
    resolutionNote: t.resolutionNote,
    completedAt: t.completedAt?.toISOString() ?? null,
    completedByUserId: t.completedByUserId,
    completedByName: t.completedBy?.nome ?? null,
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAdmin(request)
    if (!auth.authorized || !auth.session) {
      return NextResponse.json(
        { ok: false, message: auth.message || 'Não autorizado' },
        { status: auth.message?.includes('Não autenticado') ? 401 : 403 }
      )
    }

    const { id } = await params
    if (!id) {
      return NextResponse.json({ ok: false, message: 'ID inválido' }, { status: 400 })
    }

    let body: unknown
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ ok: false, message: 'JSON inválido' }, { status: 400 })
    }

    const obj = typeof body === 'object' && body !== null ? (body as Record<string, unknown>) : {}
    const hasUrgent = typeof obj.urgent === 'boolean'
    const hasDone = typeof obj.done === 'boolean'

    if (!hasUrgent && !hasDone) {
      return NextResponse.json(
        { ok: false, message: 'Envie urgent (boolean) e/ou done (boolean)' },
        { status: 400 }
      )
    }

    const existing = await prisma.adminDashboardTodo.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json({ ok: false, message: 'Tarefa não encontrada' }, { status: 404 })
    }

    const userId = auth.session.sub

    const data: {
      isUrgent?: boolean
      status?: string
      completedAt?: Date | null
      completedByUserId?: string | null
      resolutionNote?: string | null
    } = {}

    if (hasUrgent) {
      data.isUrgent = obj.urgent as boolean
    }

    if (hasDone) {
      const done = obj.done as boolean
      if (done) {
        const note =
          typeof obj.resolutionNote === 'string' ? (obj.resolutionNote as string).trim() : ''
        if (!note || note.length > 2000) {
          return NextResponse.json(
            { ok: false, message: 'Descreva o que foi feito para concluir (1–2000 caracteres)' },
            { status: 400 }
          )
        }
        data.status = 'DONE'
        data.completedAt = new Date()
        data.completedByUserId = userId
        data.resolutionNote = note
      } else {
        data.status = 'OPEN'
        data.completedAt = null
        data.completedByUserId = null
        data.resolutionNote = null
      }
    }

    const updated = await prisma.adminDashboardTodo.update({
      where: { id },
      data,
      include: {
        createdBy: { select: { id: true, nome: true } },
        completedBy: { select: { id: true, nome: true } },
      },
    })

    return NextResponse.json({
      ok: true,
      data: { todo: todoJson(updated) },
    })
  } catch (e) {
    console.error('[dashboard-todos PATCH]', e)
    return NextResponse.json({ ok: false, message: 'Erro ao atualizar tarefa' }, { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAdmin(request)
    if (!auth.authorized || !auth.session) {
      return NextResponse.json(
        { ok: false, message: auth.message || 'Não autorizado' },
        { status: auth.message?.includes('Não autenticado') ? 401 : 403 }
      )
    }

    const { id } = await params
    if (!id) {
      return NextResponse.json({ ok: false, message: 'ID inválido' }, { status: 400 })
    }

    const existing = await prisma.adminDashboardTodo.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json({ ok: false, message: 'Tarefa não encontrada' }, { status: 404 })
    }

    const userId = auth.session.sub
    if (existing.createdByUserId !== userId) {
      return NextResponse.json(
        { ok: false, message: 'Apenas o criador pode excluir esta tarefa.' },
        { status: 403 }
      )
    }

    await prisma.adminDashboardTodo.delete({ where: { id } })
    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('[dashboard-todos DELETE]', e)
    return NextResponse.json({ ok: false, message: 'Erro ao remover tarefa' }, { status: 500 })
  }
}
