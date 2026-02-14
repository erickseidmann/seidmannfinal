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

function formatarDataHoraSimples(d: Date): string {
  return d.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function adicionarObservacaoCancelamento(notesAtuais: string | null, quemCancelou: string, dataHora: Date): string {
  const novaObs = `Aula foi cancelada pelo ${quemCancelou} às ${formatarDataHoraSimples(dataHora)}`
  if (notesAtuais && notesAtuais.trim()) {
    return `${notesAtuais}\n${novaObs}`
  }
  return novaObs
}

function adicionarObservacaoReagendamento(notesAtuais: string | null, quemReagendou: string, dataHora: Date): string {
  const novaObs = `Aula foi reagendada pelo ${quemReagendou} às ${formatarDataHoraSimples(dataHora)}`
  if (notesAtuais && notesAtuais.trim()) {
    return `${notesAtuais}\n${novaObs}`
  }
  return novaObs
}

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
      select: {
        id: true,
        enrollmentId: true,
        teacherId: true,
        status: true,
        startAt: true,
        durationMinutes: true,
        notes: true,
        createdByName: true,
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
      createdByName,
    } = body

    const updateData: {
      enrollmentId?: string
      teacherId?: string
      status?: 'CONFIRMED' | 'CANCELLED' | 'REPOSICAO'
      startAt?: Date
      durationMinutes?: number
      notes?: string | null
      createdByName?: string | null
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
    if (createdByName !== undefined) updateData.createdByName = createdByName?.trim() || null

    const lessonBefore = await prisma.lesson.findUnique({
      where: { id },
      include: {
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
        if (curso === 'INGLES_E_ESPANHOL' && (!ensina.includes('INGLES') && !ensina.includes('ESPANHOL'))) {
          return NextResponse.json(
            { ok: false, message: 'Isso não pode ser feito porque o professor não ensina esse idioma.' },
            { status: 400 }
          )
        }
      }
    }

    // Adicionar observações automáticas quando status muda
    const oldStatus = lessonBefore?.status as string | undefined
    const newStatus = (updateData.status ?? oldStatus) as string | undefined
    const statusChanged = updateData.status != null && String(oldStatus) !== String(newStatus)
    
    if (statusChanged && newStatus) {
      const agora = new Date()
      // Buscar nome do admin logado
      let nomeAdmin = 'admin'
      if (auth.session?.sub) {
        try {
          const adminUser = await prisma.user.findUnique({
            where: { id: auth.session.sub },
            select: { nome: true },
          })
          if (adminUser?.nome) {
            nomeAdmin = adminUser.nome
          }
        } catch (err) {
          console.error('[api/admin/lessons/[id] PATCH] Erro ao buscar nome do admin:', err)
        }
      }
      
      // Se o admin já forneceu notes, usar essas; senão usar as notes atuais da aula
      const notesAtuais = updateData.notes !== undefined && updateData.notes !== null 
        ? updateData.notes 
        : (lessonBefore?.notes || null)
      
      if (newStatus === 'CANCELLED') {
        const novaObs = adicionarObservacaoCancelamento(notesAtuais, nomeAdmin, agora)
        updateData.notes = novaObs
      } else if (newStatus === 'REPOSICAO') {
        const novaObs = adicionarObservacaoReagendamento(notesAtuais, nomeAdmin, agora)
        updateData.notes = novaObs
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

    // Verificar se há solicitações pendentes associadas a esta aula e marcá-las como processadas
    try {
      const pendingRequests = await prisma.lessonRequest.findMany({
        where: {
          lessonId: id,
          status: { in: ['PENDING', 'TEACHER_REJECTED'] },
        },
      })

      if (pendingRequests.length > 0) {
        // Buscar nome do admin logado
        let nomeAdmin = 'admin'
        if (auth.session?.sub) {
          try {
            const adminUser = await prisma.user.findUnique({
              where: { id: auth.session.sub },
              select: { nome: true },
            })
            if (adminUser?.nome) {
              nomeAdmin = adminUser.nome
            }
          } catch (err) {
            console.error('[api/admin/lessons/[id] PATCH] Erro ao buscar nome do admin:', err)
          }
        }

        // Marcar todas as solicitações pendentes como COMPLETED
        await prisma.lessonRequest.updateMany({
          where: {
            lessonId: id,
            status: { in: ['PENDING', 'TEACHER_REJECTED'] },
          },
          data: {
            status: 'COMPLETED',
            processedById: auth.session?.sub || null,
            adminNotes: `Processado pela gestão através da atualização da aula pelo ${nomeAdmin}`,
          },
        })

        // Enviar email para o aluno informando que a solicitação foi processada
        if (lessonBefore.enrollment.email) {
          const enrollment = lessonBefore.enrollment
          const teacher = await prisma.teacher.findUnique({
            where: { id: effectiveTeacherId },
            select: { nome: true },
          })
          
          const { sendEmail } = await import('@/lib/email')
          
          // Formatar data e hora
          const DIAS_SEMANA_EMAIL = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado']
          const dataAula = new Date(effectiveStartAt)
          const diaSemana = DIAS_SEMANA_EMAIL[dataAula.getDay()]
          const data = dataAula.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
          const horario = dataAula.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', hour12: false })
          
          const studentSubject = 'Aula reagendada pela gestão - Seidmann Institute'
          const studentText = `Olá ${enrollment.nome || 'Aluno'}!

Informamos que sua solicitação de troca de aula foi processada pela gestão.

✅ Aula reagendada com sucesso:

Nova aula agendada:
${diaSemana}, ${data} às ${horario}
Professor: ${teacher?.nome || 'N/A'}

Por favor, confirme sua presença na nova data.

📌 Esta é uma mensagem automática. Por favor, não responda este e-mail.

Caso você tenha qualquer dúvida, identifique alguma informação incorreta ou precise de ajuda adicional, entre em contato com a gestão de aulas pelo WhatsApp:
📞 +55 19 97809-4000

Estamos à disposição para ajudar.

Atenciosamente,
Equipe Seidmann Institute`

          await sendEmail({
            to: enrollment.email,
            subject: studentSubject,
            text: studentText,
          })
        }
      }
    } catch (err) {
      console.error('[api/admin/lessons/[id] PATCH] Erro ao processar solicitações:', err)
      // Não bloquear a atualização da aula se houver erro ao processar solicitações
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

    // Excluir apenas do dia da exclusão para frente: mesma matrícula e professor, mesmo dia da semana e horário, startAt >= aula selecionada (nunca exclui aulas anteriores).
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
