/**
 * POST /api/admin/redirect-handled
 * Marca que o admin já tratou um aluno da lista "Alunos para redirecionar".
 * Efeito: esse enrollment deixa de aparecer na lista e no contador.
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/auth'

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAdmin(request)
    if (!auth.authorized) {
      return NextResponse.json(
        { ok: false, message: auth.message || 'Não autorizado' },
        { status: auth.message?.includes('Não autenticado') ? 401 : 403 }
      )
    }

    const body = await request.json().catch(() => null) as { enrollmentId?: string } | null
    const enrollmentId = body?.enrollmentId?.trim()
    if (!enrollmentId) {
      return NextResponse.json(
        { ok: false, message: 'enrollmentId é obrigatório' },
        { status: 400 }
      )
    }

    const existing = await prisma.adminRedirectHandled.findFirst({
      where: { enrollmentId },
      select: { id: true },
    })

    if (!existing) {
      await prisma.adminRedirectHandled.create({
        data: { enrollmentId },
      })
    }

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('[api/admin/redirect-handled POST]', error)
    return NextResponse.json(
      { ok: false, message: 'Erro ao marcar aluno como já tratado.' },
      { status: 500 }
    )
  }
}

