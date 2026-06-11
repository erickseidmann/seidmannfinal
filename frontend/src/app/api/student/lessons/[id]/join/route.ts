/**
 * POST /api/student/lessons/[id]/join
 * Registra entrada do aluno na aula (presença em tempo real).
 */

import { NextRequest, NextResponse } from 'next/server'
import { resolveStudentIdentity } from '@/lib/resolve-identity'
import { registerJoin } from '@/lib/lesson-attendance-service'

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const resolved = await resolveStudentIdentity(request)
    if (!resolved.ok) {
      return NextResponse.json(
        { ok: false, message: resolved.message },
        { status: resolved.status }
      )
    }

    const result = await registerJoin(params.id, resolved.identity)
    if (!result.ok) {
      return NextResponse.json(
        { ok: false, message: result.message },
        { status: result.status }
      )
    }

    return NextResponse.json(result)
  } catch (error) {
    console.error('[api/student/lessons/[id]/join] Erro:', error)
    return NextResponse.json(
      { ok: false, message: 'Erro ao registrar entrada na aula' },
      { status: 500 }
    )
  }
}
