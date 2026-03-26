/**
 * GET /api/admin/dashboard-todos?date=YYYY-MM-DD — lista tarefas do dia (rollover de OPEN para hoje se date=hoje)
 * POST /api/admin/dashboard-todos?date=YYYY-MM-DD — cria tarefa no dia indicado (default: hoje BR)
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/auth'
import { ymdInTZ } from '@/lib/datetime'

const DATE_KEY_RE = /^\d{4}-\d{2}-\d{2}$/

function parseCategory(raw: unknown): 'GESTAO' | 'FINANCEIRO' {
  if (raw === 'FINANCEIRO' || raw === 'GESTAO') return raw
  return 'GESTAO'
}

function parseDateKey(raw: string | null, todayKey: string): string {
  if (raw && DATE_KEY_RE.test(raw)) return raw
  return todayKey
}

/** Compara chaves YYYY-MM-DD (ordem lexicográfica = ordem cronológica). */
function dateKeyIsAfter(a: string, b: string): boolean {
  return a > b
}

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAdmin(request)
    if (!auth.authorized || !auth.session) {
      return NextResponse.json(
        { ok: false, message: auth.message || 'Não autorizado' },
        { status: auth.message?.includes('Não autenticado') ? 401 : 403 }
      )
    }

    const todayKey = ymdInTZ(new Date())
    const { searchParams } = new URL(request.url)
    const requestedDate = parseDateKey(searchParams.get('date'), todayKey)

    const todos = await prisma.$transaction(async (tx) => {
      if (requestedDate === todayKey) {
        await tx.adminDashboardTodo.updateMany({
          where: { status: 'OPEN', dayKey: { lt: todayKey } },
          data: { dayKey: todayKey },
        })
      }

      // Inclui abertas e concluídas do bucket do dia. Dia futuro: também pendentes (OPEN) de dias anteriores.
      const where = dateKeyIsAfter(requestedDate, todayKey)
        ? {
            OR: [
              { dayKey: requestedDate },
              { AND: [{ status: 'OPEN' }, { dayKey: { lt: requestedDate } }] },
            ],
          }
        : { dayKey: requestedDate }

      return tx.adminDashboardTodo.findMany({
        where,
        orderBy: [{ isUrgent: 'desc' }, { criadoEm: 'asc' }],
        include: {
          createdBy: { select: { id: true, nome: true } },
          completedBy: { select: { id: true, nome: true } },
        },
      })
    })

    return NextResponse.json({
      ok: true,
      data: {
        todayKey,
        date: requestedDate,
        todos: todos.map((t) => ({
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
        })),
      },
    })
  } catch (e) {
    console.error('[dashboard-todos GET]', e)
    return NextResponse.json({ ok: false, message: 'Erro ao listar tarefas' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAdmin(request)
    if (!auth.authorized || !auth.session) {
      return NextResponse.json(
        { ok: false, message: auth.message || 'Não autorizado' },
        { status: auth.message?.includes('Não autenticado') ? 401 : 403 }
      )
    }

    const todayKey = ymdInTZ(new Date())
    const { searchParams } = new URL(request.url)
    const dayKey = parseDateKey(searchParams.get('date'), todayKey)

    let body: unknown
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ ok: false, message: 'JSON inválido' }, { status: 400 })
    }
    const text =
      typeof body === 'object' && body !== null && typeof (body as { text?: unknown }).text === 'string'
        ? (body as { text: string }).text.trim()
        : ''
    if (!text || text.length > 500) {
      return NextResponse.json({ ok: false, message: 'Texto da tarefa inválido (1–500 caracteres)' }, { status: 400 })
    }

    const category = parseCategory(
      typeof body === 'object' && body !== null ? (body as { category?: unknown }).category : undefined
    )

    const userId = auth.session.sub
    const created = await prisma.adminDashboardTodo.create({
      data: {
        text,
        category,
        dayKey,
        status: 'OPEN',
        createdByUserId: userId,
      },
      include: {
        createdBy: { select: { id: true, nome: true } },
        completedBy: { select: { id: true, nome: true } },
      },
    })

    return NextResponse.json({
      ok: true,
      data: {
        todo: {
          id: created.id,
          text: created.text,
          category: created.category,
          isUrgent: created.isUrgent,
          dayKey: created.dayKey,
          status: created.status,
          criadoEm: created.criadoEm.toISOString(),
          createdByUserId: created.createdByUserId,
          createdByName: created.createdBy.nome,
          resolutionNote: created.resolutionNote,
          completedAt: null,
          completedByUserId: null,
          completedByName: null,
        },
      },
    })
  } catch (e) {
    console.error('[dashboard-todos POST]', e)
    return NextResponse.json({ ok: false, message: 'Erro ao criar tarefa' }, { status: 500 })
  }
}
