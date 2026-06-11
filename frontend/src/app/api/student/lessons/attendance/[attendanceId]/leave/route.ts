/**
 * POST /api/student/lessons/attendance/[attendanceId]/leave
 * Registra saída do aluno da aula.
 */

import { NextRequest, NextResponse } from 'next/server'
import { resolveStudentIdentity } from '@/lib/resolve-identity'
import { registerLeave } from '@/lib/lesson-attendance-service'

export async function POST(
  request: NextRequest,
  { params }: { params: { attendanceId: string } }
) {
  try {
    const resolved = await resolveStudentIdentity(request)
    if (!resolved.ok) {
      return NextResponse.json(
        { ok: false, message: resolved.message },
        { status: resolved.status }
      )
    }

    const result = await registerLeave(params.attendanceId, resolved.identity)
    if (!result.ok) {
      return NextResponse.json(
        { ok: false, message: result.message },
        { status: result.status }
      )
    }

    return NextResponse.json(result)
  } catch (error) {
    console.error('[api/student/lessons/attendance/leave] Erro:', error)
    return NextResponse.json(
      { ok: false, message: 'Erro ao registrar saída da aula' },
      { status: 500 }
    )
  }
}
