/**
 * API Route: GET /api/admin/me
 * Retorna dados do admin logado (para sidebar: saber se é super admin)
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/auth'
import { isSuperAdminEmail } from '@/lib/auth'
import {
  canAdminApprovePastLessonEdit,
  canAdminDirectEditPastLesson,
} from '@/lib/lesson-past-edit'

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAdmin(request)
    if (!auth.authorized || !auth.session) {
      return NextResponse.json(
        { ok: false, message: auth.message || 'Não autorizado' },
        { status: auth.message?.includes('Não autenticado') ? 401 : 403 }
      )
    }

    const user = await prisma.user.findUnique({
      where: { id: auth.session.sub },
      select: { canApproveLateLessonEdits: true, nome: true },
    })
    const canApproveLateLessonEdits = user?.canApproveLateLessonEdits ?? false
    const isSuperAdmin = isSuperAdminEmail(auth.session.email)

    return NextResponse.json({
      ok: true,
      data: {
        id: auth.session.sub,
        nome: user?.nome ?? null,
        email: auth.session.email,
        isSuperAdmin,
        canApproveLateLessonEdits,
        canDirectEditPastLessons: canAdminDirectEditPastLesson(
          auth.session.email,
          canApproveLateLessonEdits
        ),
        canApprovePastLessonEdits: canAdminApprovePastLessonEdit(
          auth.session.email,
          canApproveLateLessonEdits
        ),
        adminPages: auth.session.adminPages ?? [],
      },
    })
  } catch (error) {
    return NextResponse.json(
      { ok: false, message: 'Erro ao obter sessão' },
      { status: 500 }
    )
  }
}
