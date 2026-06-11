/**
 * GET /api/admin/lesson-attendance/retention
 * Avisos de exclusão automática (retenção de 60 dias).
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import {
  LESSON_ATTENDANCE_RETENTION_DAYS,
  getUpcomingLessonAttendanceDeletions,
  lessonAttendanceVisibleSinceDateKey,
} from '@/lib/lesson-attendance-retention'
import { formatDateKeyPtBR } from '@/lib/datetime'

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAdmin(request)
    if (!auth.authorized) {
      return NextResponse.json(
        { ok: false, message: auth.message || 'Não autorizado' },
        { status: auth.message?.includes('Não autenticado') ? 401 : 403 }
      )
    }

    const upcoming = await getUpcomingLessonAttendanceDeletions()
    const visibleSince = lessonAttendanceVisibleSinceDateKey()

    return NextResponse.json({
      ok: true,
      data: {
        retentionDays: LESSON_ATTENDANCE_RETENTION_DAYS,
        visibleSinceDateKey: visibleSince,
        visibleSinceLabel: formatDateKeyPtBR(visibleSince),
        upcoming,
      },
    })
  } catch (error) {
    console.error('[api/admin/lesson-attendance/retention GET]', error)
    return NextResponse.json(
      { ok: false, message: 'Erro ao carregar avisos de retenção' },
      { status: 500 }
    )
  }
}
