/**
 * POST /api/student/lessons/[id]/cancel
 * Cancelar aula diretamente (aluno)
 * Apenas alunos autenticados podem cancelar suas próprias aulas
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireStudent } from '@/lib/auth'

function formatarDataHora(d: Date): string {
  return d.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function adicionarObservacaoCancelamento(notesAtuais: string | null, quemCancelou: string, dataHora: Date): string {
  const novaObs = `Aula foi cancelada pelo aluno às ${formatarDataHora(dataHora)}`
  if (notesAtuais && notesAtuais.trim()) {
    return `${notesAtuais}\n${novaObs}`
  }
  return novaObs
}

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

    const lessonId = params.id

    // Buscar a aula
    const lesson = await prisma.lesson.findUnique({
      where: { id: lessonId },
      include: {
        enrollment: {
          select: {
            id: true,
            userId: true,
            nome: true,
            email: true,
            tipoAula: true,
          },
        },
      },
    })

    if (!lesson) {
      return NextResponse.json(
        { ok: false, message: 'Aula não encontrada' },
        { status: 404 }
      )
    }

    // Verificar se o aluno tem permissão para cancelar esta aula
    const sessionUserId = auth.session.userId
    const enrollmentUserId = lesson.enrollment.userId

    if (!enrollmentUserId) {
      // Se o enrollment não tem userId vinculado, verificar se o aluno tem algum enrollment com esse ID
      const studentEnrollments = await prisma.enrollment.findMany({
        where: { userId: sessionUserId },
        select: { id: true },
      })
      const enrollmentIds = studentEnrollments.map(e => e.id)

      if (!enrollmentIds.includes(lesson.enrollmentId)) {
        return NextResponse.json(
          { ok: false, message: 'Você não tem permissão para cancelar esta aula' },
          { status: 403 }
        )
      }
    } else if (enrollmentUserId !== sessionUserId) {
      return NextResponse.json(
        { ok: false, message: 'Você não tem permissão para cancelar esta aula' },
        { status: 403 }
      )
    }

    // Verificar se a aula já está cancelada
    if (lesson.status === 'CANCELLED') {
      return NextResponse.json(
        { ok: false, message: 'Esta aula já está cancelada' },
        { status: 400 }
      )
    }

    // Aulas em grupo não podem ser canceladas pelo portal do aluno
    if (lesson.enrollment.tipoAula === 'GRUPO') {
      return NextResponse.json(
        { ok: false, message: 'Aulas em grupo não podem ser canceladas pelo portal do aluno. Entre em contato com a gestão.' },
        { status: 403 }
      )
    }

    // Cancelar a aula (sem restrição de tempo mínimo para cancelamento direto)
    const agora = new Date()
    const notesAtuais = lesson.notes
    const novaObservacao = adicionarObservacaoCancelamento(notesAtuais, 'aluno', agora)
    
    await prisma.lesson.update({
      where: { id: lessonId },
      data: {
        status: 'CANCELLED',
        notes: novaObservacao,
      },
    })

    return NextResponse.json({
      ok: true,
      message: 'Aula cancelada com sucesso',
    })
  } catch (error) {
    console.error('[api/student/lessons/[id]/cancel POST]', error)
    return NextResponse.json(
      { ok: false, message: 'Erro ao cancelar aula' },
      { status: 500 }
    )
  }
}
