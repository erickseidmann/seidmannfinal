/**
 * Bulk delete de registros de aula por dia (timezone São Paulo).
 *
 * GET    /api/admin/lesson-records/by-day?date=YYYY-MM-DD
 *   Devolve a contagem e um resumo dos registros que SERIAM removidos.
 *
 * DELETE /api/admin/lesson-records/by-day?date=YYYY-MM-DD
 *   Remove todos os LessonRecord cujas aulas (Lesson.startAt) caem no dia indicado
 *   (interpretado em America/Sao_Paulo). NÃO remove a aula em si — só o registro.
 *   LessonRecordStudent vai junto pelo onDelete: Cascade do schema.
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/auth'
import { toDateKeyInTZ } from '@/lib/datetime'

const BRAZIL_TZ = 'America/Sao_Paulo'

/** Recebe "YYYY-MM-DD" tratado como data civil em São Paulo e devolve o intervalo
 *  [startUtc, endUtc) que cobre as 24h desse dia em São Paulo (UTC-3, sem DST atualmente). */
function computeBrazilDayRange(dateKey: string): { startUtc: Date; endUtc: Date } | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) return null
  const [y, m, d] = dateKey.split('-').map(Number)
  if (!y || !m || !d) return null
  // Construímos um instante "meio-dia em São Paulo" e ajustamos para o início do dia local.
  // Hoje (2026), São Paulo é sempre UTC-3 (não há mais horário de verão).
  // Para robustez, derivamos o offset real do dia consultando Intl com a data alvo.
  const probe = new Date(Date.UTC(y, m - 1, d, 12, 0, 0))
  const tzKey = toDateKeyInTZ(probe, BRAZIL_TZ)
  if (tzKey !== dateKey) {
    // Em casos extremos de fronteira, ajustamos +/- 1 dia até bater.
    // Loop conservador, no máximo 3 tentativas.
    for (const delta of [-1, 1]) {
      const probe2 = new Date(Date.UTC(y, m - 1, d + delta, 12, 0, 0))
      if (toDateKeyInTZ(probe2, BRAZIL_TZ) === dateKey) {
        const startUtc = new Date(probe2.getTime() - 12 * 60 * 60 * 1000)
        const endUtc = new Date(startUtc.getTime() + 24 * 60 * 60 * 1000)
        return { startUtc, endUtc }
      }
    }
    return null
  }
  const startUtc = new Date(probe.getTime() - 12 * 60 * 60 * 1000)
  const endUtc = new Date(startUtc.getTime() + 24 * 60 * 60 * 1000)
  return { startUtc, endUtc }
}

async function loadRecordsOfDay(dateKey: string) {
  const range = computeBrazilDayRange(dateKey)
  if (!range) return { ok: false as const, message: 'Data inválida (use YYYY-MM-DD).' }
  const records = await prisma.lessonRecord.findMany({
    where: {
      lesson: {
        startAt: { gte: range.startUtc, lt: range.endUtc },
      },
    },
    select: {
      id: true,
      lesson: {
        select: {
          startAt: true,
          enrollment: { select: { id: true, nome: true, tipoAula: true, nomeGrupo: true } },
          teacher: { select: { id: true, nome: true } },
        },
      },
    },
    orderBy: { lesson: { startAt: 'asc' } },
  })
  return { ok: true as const, range, records }
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

    const dateKey = request.nextUrl.searchParams.get('date') || ''
    const result = await loadRecordsOfDay(dateKey)
    if (!result.ok) {
      return NextResponse.json({ ok: false, message: result.message }, { status: 400 })
    }

    return NextResponse.json({
      ok: true,
      data: {
        dateKey,
        total: result.records.length,
        records: result.records.map((r) => ({
          id: r.id,
          startAt: r.lesson.startAt.toISOString(),
          alunoLabel:
            r.lesson.enrollment?.tipoAula === 'GRUPO' && r.lesson.enrollment?.nomeGrupo?.trim()
              ? r.lesson.enrollment.nomeGrupo.trim()
              : r.lesson.enrollment?.nome ?? '—',
          professorNome: r.lesson.teacher?.nome ?? '—',
        })),
      },
    })
  } catch (error) {
    console.error('[api/admin/lesson-records/by-day GET]', error)
    return NextResponse.json(
      { ok: false, message: 'Erro ao listar registros do dia' },
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

    const dateKey = request.nextUrl.searchParams.get('date') || ''
    const result = await loadRecordsOfDay(dateKey)
    if (!result.ok) {
      return NextResponse.json({ ok: false, message: result.message }, { status: 400 })
    }

    if (result.records.length === 0) {
      return NextResponse.json({
        ok: true,
        data: { dateKey, deleted: 0 },
        message: 'Nenhum registro encontrado para o dia selecionado.',
      })
    }

    const ids = result.records.map((r) => r.id)
    const deleted = await prisma.lessonRecord.deleteMany({
      where: { id: { in: ids } },
    })

    console.info(
      `[api/admin/lesson-records/by-day DELETE] Admin ${auth.session?.email} removeu ${deleted.count} registros do dia ${dateKey}`
    )

    return NextResponse.json({
      ok: true,
      data: { dateKey, deleted: deleted.count },
      message: `${deleted.count} registro(s) de aula removido(s) com sucesso.`,
    })
  } catch (error) {
    console.error('[api/admin/lesson-records/by-day DELETE]', error)
    return NextResponse.json(
      { ok: false, message: 'Erro ao remover registros do dia' },
      { status: 500 }
    )
  }
}
