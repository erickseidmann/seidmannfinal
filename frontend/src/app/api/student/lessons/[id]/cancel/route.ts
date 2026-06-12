/**
 * POST /api/student/lessons/[id]/cancel
 * Cancelar aula diretamente (aluno)
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireStudent } from '@/lib/auth'
import { cancelStudentLessonByStudent } from '@/lib/student-lesson-cancel'

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const auth = await requireStudent(request)
    if (!auth.authorized || !auth.session) {
      return NextResponse.json(
        { ok: false, message: auth.message || 'Não autorizado' },
        { status: auth.message?.includes('Não autenticado') ? 401 : 403 }
      )
    }

    const result = await cancelStudentLessonByStudent(params.id, auth.session.userId)
    if (!result.ok) {
      return NextResponse.json(
        { ok: false, message: result.message },
        { status: result.status }
      )
    }

    return NextResponse.json({
      ok: true,
      cancelamentoTardio: result.cancelamentoTardio,
      message: result.message,
    })
  } catch (error) {
    console.error('[api/student/lessons/[id]/cancel POST]', error)
    return NextResponse.json(
      { ok: false, message: 'Erro ao cancelar aula' },
      { status: 500 }
    )
  }
}
