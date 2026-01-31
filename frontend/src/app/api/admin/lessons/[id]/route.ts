/**
 * API: PATCH /api/admin/lessons/[id] (atualizar aula)
 *      GET /api/admin/lessons/[id] (obter uma aula)
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/auth'
import {
  sendEmail,
  mensagemAulaCancelada,
  mensagemAulasCanceladas,
  mensagemReposicaoAgendada,
} from '@/lib/email'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAdmin(request)
    if (!auth.authorized) {
      return NextResponse.json(
        { ok: false, message: auth.message || 'Não autorizado' },
        { status: auth.message?.includes('Não autenticado') ? 401 : 403 }
      )
    }

    if (!prisma.lesson) {
      return NextResponse.json(
        { ok: false, message: 'Modelo Lesson não disponível. Rode: npx prisma generate && npx prisma migrate dev' },
        { status: 503 }
      )
    }

    const { id } = await params
    const lesson = await prisma.lesson.findUnique({
      where: { id },
      include: {
        enrollment: { select: { id: true, nome: true, frequenciaSemanal: true } },
        teacher: { select: { id: true, nome: true } },
      },
    })

    if (!lesson) {
      return NextResponse.json(
        { ok: false, message: 'Aula não encontrada' },
        { status: 404 }
      )
    }

    return NextResponse.json({ ok: true, data: { lesson } })
  } catch (error) {
    console.error('[api/admin/lessons/[id] GET]', error)
    return NextResponse.json(
      { ok: false, message: 'Erro ao buscar aula' },
      { status: 500 }
    )
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAdmin(request)
    if (!auth.authorized) {
      return NextResponse.json(
        { ok: false, message: auth.message || 'Não autorizado' },
        { status: auth.message?.includes('Não autenticado') ? 401 : 403 }
      )
    }

    if (!prisma.lesson) {
      return NextResponse.json(
        { ok: false, message: 'Modelo Lesson não disponível. Rode: npx prisma generate && npx prisma migrate dev' },
        { status: 503 }
      )
    }

    const { id } = await params
    const body = await request.json()
    const {
      enrollmentId,
      teacherId,
      status,
      startAt: startAtStr,
      durationMinutes,
      notes,
    } = body

    const updateData: {
      enrollmentId?: string
      teacherId?: string
      status?: 'CONFIRMED' | 'CANCELLED' | 'REPOSICAO'
      startAt?: Date
      durationMinutes?: number
      notes?: string | null
    } = {}

    if (enrollmentId != null) updateData.enrollmentId = enrollmentId
    if (teacherId != null) updateData.teacherId = teacherId
    if (status != null && ['CONFIRMED', 'CANCELLED', 'REPOSICAO'].includes(status)) {
      updateData.status = status
    }
    if (startAtStr != null) {
      const d = new Date(startAtStr)
      if (!Number.isNaN(d.getTime())) updateData.startAt = d
    }
    if (durationMinutes != null) updateData.durationMinutes = Number(durationMinutes) || 60
    if (notes !== undefined) updateData.notes = notes?.trim() || null

    const lessonBefore = await prisma.lesson.findUnique({
      where: { id },
      include: {
        enrollment: { select: { nome: true, email: true } },
        teacher: { select: { nome: true, email: true } },
      },
    })

    const lesson = await prisma.lesson.update({
      where: { id },
      data: updateData,
      include: {
        enrollment: { select: { id: true, nome: true, email: true, frequenciaSemanal: true } },
        teacher: { select: { id: true, nome: true, email: true } },
      },
    })

    // E-mail: só envia quando o status mudou para CANCELLED ou REPOSICAO
    const oldStatus = lessonBefore?.status
    const newStatus = updateData.status ?? oldStatus
    const statusChanged = updateData.status != null && oldStatus !== newStatus
    if (statusChanged && newStatus && lesson.enrollment && lesson.teacher) {
      const nomeAluno = lesson.enrollment.nome
      const nomeProfessor = lesson.teacher.nome
      const emailAluno = lesson.enrollment.email
      const emailProfessor = lesson.teacher.email
      const dataAula = lesson.startAt
      try {
        if (newStatus === 'CANCELLED') {
          if (emailAluno) {
            const { subject, text } = mensagemAulaCancelada({
              nomeAluno,
              nomeProfessor,
              data: dataAula,
              destinatario: 'aluno',
            })
            await sendEmail({ to: emailAluno, subject, text })
          }
          if (emailProfessor) {
            const { subject, text } = mensagemAulaCancelada({
              nomeAluno,
              nomeProfessor,
              data: dataAula,
              destinatario: 'professor',
            })
            await sendEmail({ to: emailProfessor, subject, text })
          }
        } else if (newStatus === 'REPOSICAO') {
          if (emailAluno) {
            const { subject, text } = mensagemReposicaoAgendada({
              nomeAluno,
              nomeProfessor,
              data: dataAula,
              destinatario: 'aluno',
            })
            await sendEmail({ to: emailAluno, subject, text })
          }
          if (emailProfessor) {
            const { subject, text } = mensagemReposicaoAgendada({
              nomeAluno,
              nomeProfessor,
              data: dataAula,
              destinatario: 'professor',
            })
            await sendEmail({ to: emailProfessor, subject, text })
          }
        }
      } catch (err) {
        console.error('[api/admin/lessons/[id] PATCH] Erro ao enviar e-mail:', err)
      }
    }

    return NextResponse.json({ ok: true, data: { lesson } })
  } catch (error) {
    console.error('[api/admin/lessons/[id] PATCH]', error)
    return NextResponse.json(
      { ok: false, message: 'Erro ao atualizar aula' },
      { status: 500 }
    )
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAdmin(request)
    if (!auth.authorized) {
      return NextResponse.json(
        { ok: false, message: auth.message || 'Não autorizado' },
        { status: auth.message?.includes('Não autenticado') ? 401 : 403 }
      )
    }

    if (!prisma.lesson) {
      return NextResponse.json(
        { ok: false, message: 'Modelo Lesson não disponível. Rode: npx prisma generate && npx prisma migrate dev' },
        { status: 503 }
      )
    }

    const { id } = await params
    let body: { deleteFuture?: boolean } = {}
    try {
      body = await request.json()
    } catch {
      // body vazio
    }

    const deleteFuture = body.deleteFuture === true

    const lessonWithRelations = await prisma.lesson.findUnique({
      where: { id },
      include: {
        enrollment: { select: { nome: true, email: true } },
        teacher: { select: { nome: true, email: true } },
      },
    })

    if (!lessonWithRelations) {
      return NextResponse.json(
        { ok: false, message: 'Aula não encontrada' },
        { status: 404 }
      )
    }

    const { enrollment, teacher } = lessonWithRelations
    const nomeAluno = enrollment?.nome ?? ''
    const nomeProfessor = teacher?.nome ?? ''
    const emailAluno = enrollment?.email
    const emailProfessor = teacher?.email

    const sendCancelEmails = async (startAt: Date) => {
      try {
        if (emailAluno) {
          const { subject, text } = mensagemAulaCancelada({
            nomeAluno,
            nomeProfessor,
            data: startAt,
            destinatario: 'aluno',
          })
          await sendEmail({ to: emailAluno, subject, text })
        }
        if (emailProfessor) {
          const { subject, text } = mensagemAulaCancelada({
            nomeAluno,
            nomeProfessor,
            data: startAt,
            destinatario: 'professor',
          })
          await sendEmail({ to: emailProfessor, subject, text })
        }
      } catch (err) {
        console.error('[api/admin/lessons/[id] DELETE] Erro ao enviar e-mail:', err)
      }
    }

    if (!deleteFuture) {
      const startAt = lessonWithRelations.startAt
      await prisma.lesson.delete({ where: { id } })
      await sendCancelEmails(startAt)
      return NextResponse.json({ ok: true, data: { deleted: id, count: 1 } })
    }

    const lesson = lessonWithRelations
    const refDay = lesson.startAt.getDay()
    const refHours = lesson.startAt.getHours()
    const refMinutes = lesson.startAt.getMinutes()

    const futureLessons = await prisma.lesson.findMany({
      where: {
        enrollmentId: lesson.enrollmentId,
        teacherId: lesson.teacherId,
        startAt: { gte: lesson.startAt },
      },
    })

    const toDelete = futureLessons.filter((l) => {
      const d = new Date(l.startAt)
      return d.getDay() === refDay && d.getHours() === refHours && d.getMinutes() === refMinutes
    })

    try {
      if (toDelete.length === 1) {
        await sendCancelEmails(toDelete[0].startAt)
      } else if (toDelete.length > 1) {
        const aulas = toDelete.map((l) => ({ startAt: l.startAt }))
        if (emailAluno) {
          const { subject, text } = mensagemAulasCanceladas({
            nomeAluno,
            nomeProfessor,
            aulas,
            destinatario: 'aluno',
          })
          await sendEmail({ to: emailAluno, subject, text })
        }
        if (emailProfessor) {
          const { subject, text } = mensagemAulasCanceladas({
            nomeAluno,
            nomeProfessor,
            aulas,
            destinatario: 'professor',
          })
          await sendEmail({ to: emailProfessor, subject, text })
        }
      }
    } catch (err) {
      console.error('[api/admin/lessons/[id] DELETE] Erro ao enviar e-mail:', err)
    }

    await prisma.lesson.deleteMany({
      where: { id: { in: toDelete.map((l) => l.id) } },
    })

    return NextResponse.json({
      ok: true,
      data: { deleted: id, count: toDelete.length, ids: toDelete.map((l) => l.id) },
    })
  } catch (error) {
    console.error('[api/admin/lessons/[id] DELETE]', error)
    return NextResponse.json(
      { ok: false, message: 'Erro ao excluir aula' },
      { status: 500 }
    )
  }
}
