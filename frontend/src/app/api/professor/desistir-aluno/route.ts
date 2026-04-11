/**
 * API: POST /api/professor/desistir-aluno
 *
 * Professor desiste do aluno: remove-se de todas as aulas futuras desse enrollment.
 * As aulas ficam sem professor (teacherId = null) e somem do calendário.
 * Notificação "Alunos para redirecionar" é enviada aos admins.
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireTeacher } from '@/lib/auth'
import { LESSON_STATUSES_SCHEDULED } from '@/lib/lesson-status'

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
      select: { id: true, nome: true },
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

    const enrollment = await prisma.enrollment.findUnique({
      where: { id: enrollmentId },
      select: { nome: true },
    })
    const nomeAluno = enrollment?.nome ?? 'Aluno'

    // Só aulas a partir do dia da alteração (00:00 de hoje)
    const hoje = new Date()
    hoje.setHours(0, 0, 0, 0)
    const result = await prisma.lesson.updateMany({
      where: {
        enrollmentId,
        teacherId: teacher.id,
        status: { in: [...LESSON_STATUSES_SCHEDULED] },
        startAt: { gte: hoje },
      },
      data: { teacherId: null },
    })

    // Notificar admins: "Alunos para redirecionar"
    if (result.count > 0 && prisma.adminNotification) {
      const admins = await prisma.user.findMany({
        where: { role: 'ADMIN', status: 'ACTIVE' },
        select: { id: true },
      })
      const message = `Alunos para redirecionar: ${nomeAluno} – professor ${teacher.nome} desistiu por causa do horário. ${result.count} aula(s) removida(s) do calendário.`
      for (const admin of admins) {
        await prisma.adminNotification.create({
          data: { userId: admin.id, message },
        })
      }
    }

    return NextResponse.json({
      ok: true,
      message: `Você saiu da agenda deste aluno. ${result.count} aula(s) futura(s) foram removidas do calendário. A administração recebeu a notificação "Alunos para redirecionar".`,
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
