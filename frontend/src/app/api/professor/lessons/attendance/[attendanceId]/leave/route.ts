/**
 * POST /api/professor/lessons/attendance/[attendanceId]/leave
 * Registra saída do professor da aula.
 */

import { NextRequest, NextResponse } from 'next/server'
import { resolveTeacherIdentity } from '@/lib/resolve-identity'
import { registerLeave } from '@/lib/lesson-attendance-service'

export async function POST(
  request: NextRequest,
  { params }: { params: { attendanceId: string } }
) {
  try {
    const resolved = await resolveTeacherIdentity(request)
    if (!resolved.ok) {
      return NextResponse.json(
        { ok: false, message: resolved.message },
        { status: resolved.status }
      )
    }

    let finalizeCall = false
    try {
      const body = await request.json()
      finalizeCall = body?.finalizeCall === true
    } catch {
      // corpo vazio é válido (saída simples)
    }

    const result = await registerLeave(params.attendanceId, resolved.identity, { finalizeCall })
    if (!result.ok) {
      return NextResponse.json(
        { ok: false, message: result.message },
        { status: result.status }
      )
    }

    return NextResponse.json(result)
  } catch (error) {
    console.error('[api/professor/lessons/attendance/leave] Erro:', error)
    return NextResponse.json(
      { ok: false, message: 'Erro ao registrar saída da aula' },
      { status: 500 }
    )
  }
}
