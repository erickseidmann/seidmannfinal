/**
 * GET /api/admin/lesson-attendance/archive?lessonDate=YYYY-MM-DD
 * Dados para exportar PDF antes da exclusão automática.
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { fetchLessonAttendanceSummariesForLessonDateKey } from '@/lib/lesson-attendance-retention'

const DATE_KEY_RE = /^\d{4}-\d{2}-\d{2}$/

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAdmin(request)
    if (!auth.authorized) {
      return NextResponse.json(
        { ok: false, message: auth.message || 'Não autorizado' },
        { status: auth.message?.includes('Não autenticado') ? 401 : 403 }
      )
    }

    const lessonDate = new URL(request.url).searchParams.get('lessonDate')?.trim() ?? ''
    if (!DATE_KEY_RE.test(lessonDate)) {
      return NextResponse.json(
        { ok: false, message: 'Parâmetro lessonDate inválido (use AAAA-MM-DD)' },
        { status: 400 }
      )
    }

    const summaries = await fetchLessonAttendanceSummariesForLessonDateKey(lessonDate)

    return NextResponse.json({
      ok: true,
      data: { lessonDateKey: lessonDate, summaries },
    })
  } catch (error) {
    console.error('[api/admin/lesson-attendance/archive GET]', error)
    return NextResponse.json(
      { ok: false, message: 'Erro ao carregar dados para exportação' },
      { status: 500 }
    )
  }
}
