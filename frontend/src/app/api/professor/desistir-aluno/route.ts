/**
 * API: POST /api/professor/desistir-aluno
 *
 * Professor desiste do aluno: remove-se de todas as aulas futuras desse enrollment.
 * As aulas ficam sem professor (teacherId = null) e o admin pode redesignar depois.
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireTeacher } from '@/lib/auth'

export async function POST(request: NextRequest) {
  try {
    const auth = await requireTeacher(request)
    if (!auth.authorized || !auth.session) {
      return NextResponse.json(
        { ok: false, message: auth.message || 'Não autorizado' },
        { status: auth.message?.includes('Não autenticado') ? 401 : 403 }
      )
    }

    const teacher = await prisma.teacher.findFirst({
      where: { userId: auth.session.userId },
      select: { id: true },
    })
    if (!teacher) {
      return NextResponse.json(
        { ok: false, message: 'Professor não encontrado' },
        { status: 404 }
      )
    }

    const body = await request.json().catch(() => ({}))
    const enrollmentId = typeof body.enrollmentId === 'string' ? body.enrollmentId.trim() : null
    if (!enrollmentId) {
      return NextResponse.json(
        { ok: false, message: 'enrollmentId é obrigatório' },
        { status: 400 }
      )
    }

    // Só aulas a partir do dia da alteração (00:00 de hoje)
    const hoje = new Date()
    hoje.setHours(0, 0, 0, 0)
    const result = await prisma.lesson.updateMany({
      where: {
        enrollmentId,
        teacherId: teacher.id,
        status: { not: 'CANCELLED' },
        startAt: { gte: hoje },
      },
      data: { teacherId: null },
    })

    return NextResponse.json({
      ok: true,
      message: `Você saiu da agenda deste aluno. ${result.count} aula(s) futura(s) ficaram sem professor. A administração poderá redesignar.`,
      data: { updatedCount: result.count },
    })
  } catch (error) {
    console.error('[api/professor/desistir-aluno]', error)
    return NextResponse.json(
      { ok: false, message: 'Erro ao processar. Tente novamente.' },
      { status: 500 }
    )
  }
}
