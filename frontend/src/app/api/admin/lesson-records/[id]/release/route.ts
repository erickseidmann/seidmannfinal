/**
 * POST /api/admin/lesson-records/[id]/release
 * Libera aula cancelada sem reposição para o professor registrar e receber.
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/auth'
import { releaseCancelledNoReplacementLessonRecord } from '@/lib/lesson-cancel-no-replacement-release'

export async function POST(
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

    let adminName = 'admin'
    if (auth.session.sub) {
      const adminUser = await prisma.user.findUnique({
        where: { id: auth.session.sub },
        select: { nome: true },
      })
      if (adminUser?.nome) adminName = adminUser.nome
    }

    const result = await releaseCancelledNoReplacementLessonRecord({
      recordId: id,
      adminUserId: auth.session.sub,
      adminName,
    })

    if (!result.ok) {
      return NextResponse.json({ ok: false, message: result.message }, { status: result.status })
    }

    return NextResponse.json({ ok: true, message: result.message })
  } catch (error) {
    console.error('[api/admin/lesson-records/[id]/release POST]', error)
    return NextResponse.json(
      { ok: false, message: 'Erro ao liberar aula' },
      { status: 500 }
    )
  }
}
