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
        enrollmentId: true,
        teacherId: true,
        enrollment: { select: { nome: true, email: true, curso: true } },
        teacher: { select: { nome: true, email: true } },
      },
    })
    if (!lessonBefore) {
      return NextResponse.json({ ok: false, message: 'Aula não encontrada' }, { status: 404 })
    }

    const effectiveEnrollmentId = updateData.enrollmentId ?? lessonBefore.enrollmentId
    const effectiveTeacherId = updateData.teacherId ?? lessonBefore.teacherId
    const effectiveStartAt = updateData.startAt ?? lessonBefore.startAt

    // Verificar se aluno está pausado e tentando atribuir professor durante período pausado
    if (effectiveEnrollmentId && effectiveTeacherId && updateData.teacherId) {
      const enrollment = await prisma.enrollment.findUnique({
        where: { id: effectiveEnrollmentId },
        select: { status: true, pausedAt: true, activationDate: true },
      })
      if (enrollment && enrollment.status === 'PAUSED' && enrollment.pausedAt) {
        const pausedAt = new Date(enrollment.pausedAt)
        pausedAt.setHours(0, 0, 0, 0)
        const lessonDate = new Date(effectiveStartAt)
        lessonDate.setHours(0, 0, 0, 0)
        const activationDate = enrollment.activationDate ? new Date(enrollment.activationDate) : null
        if (activationDate) {
          activationDate.setHours(0, 0, 0, 0)
        }
        if (lessonDate >= pausedAt && (!activationDate || lessonDate < activationDate)) {
          return NextResponse.json(
            { ok: false, message: 'Não é possível atribuir professor para aulas de alunos pausados durante o período de pausa. Defina uma data de ativação.' },
            { status: 400 }
          )
        }
      }
    }

    if (effectiveEnrollmentId && effectiveTeacherId) {
      const [enrollment, teacher] = await Promise.all([
        prisma.enrollment.findUnique({
          where: { id: effectiveEnrollmentId },
          select: { curso: true },
        }),
        prisma.teacher.findUnique({
          where: { id: effectiveTeacherId },
          select: { idiomasEnsina: true },
        }),
      ])
      if (enrollment && teacher) {
        const curso = (enrollment as { curso?: string | null }).curso
        const ensina = Array.isArray(teacher.idiomasEnsina)
          ? (teacher.idiomasEnsina as string[])
          : teacher.idiomasEnsina
            ? [String(teacher.idiomasEnsina)]
            : []
        if (curso === 'INGLES' && !ensina.includes('INGLES')) {
          return NextResponse.json(
            { ok: false, message: 'Isso não pode ser feito porque o professor não ensina esse idioma.' },
            { status: 400 }
          )
        }
        if (curso === 'ESPANHOL' && !ensina.includes('ESPANHOL')) {
          return NextResponse.json(
            { ok: false, message: 'Isso não pode ser feito porque o professor não ensina esse idioma.' },
            { status: 400 }
          )
        }
        if (curso === 'INGLES_E_ESPANHOL' && (!ensina.includes('INGLES') || !ensina.includes('ESPANHOL'))) {
          return NextResponse.json(
            { ok: false, message: 'Isso não pode ser feito porque o professor não ensina esse idioma.' },
            { status: 400 }
          )
        }
      }
    }

    const lesson = await prisma.lesson.update({
      where: { id },
      data: updateData,
      include: {
        enrollment: { select: { id: true, nome: true, email: true, frequenciaSemanal: true } },
        teacher: { select: { id: true, nome: true, email: true } },
      },
    })

    // E-mail: envia quando o status mudou para CANCELLED (ex.: Confirmada→Cancelada ou Reposição→Cancelada) ou para REPOSICAO
    const oldStatus = lessonBefore?.status as string | undefined
    const newStatus = (updateData.status ?? oldStatus) as string | undefined
    const statusChanged = updateData.status != null && String(oldStatus) !== String(newStatus)
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

    const lesson = await prisma.lesson.findUnique({
      where: { id },
    })

    if (!lesson) {
      return NextResponse.json(
        { ok: false, message: 'Aula não encontrada' },
        { status: 404 }
      )
    }

    // Excluir aula(s): não envia e-mail. E-mail de cancelamento só ao salvar com status "Cancelada".
    if (!deleteFuture) {
      await prisma.lesson.delete({ where: { id } })
      return NextResponse.json({ ok: true, data: { deleted: id, count: 1 } })
    }

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
