/**
 * PATCH /api/lesson-requests/[id]/teacher-approval
 * Professor aprova ou nega uma solicitação de alteração de aula
 * Apenas o professor da aula original pode aprovar/negar
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireTeacher } from '@/lib/auth'
import { sendEmail } from '@/lib/email'

const DIAS_SEMANA = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado']

function formatarDataHora(d: Date): { diaSemana: string; data: string; horario: string } {
  const diaSemana = DIAS_SEMANA[d.getDay()]
  const data = d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
  const horario = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', hour12: false })
  return { diaSemana, data, horario }
}

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

function adicionarObservacaoReagendamento(notesAtuais: string | null, quemReagendou: string, dataHora: Date, dataReagendamentoAluno?: Date, dataAprovacaoProfessor?: Date): string {
  let novaObs = ''
  
  // Se foi reagendada pelo aluno e aprovada pelo professor, mostrar informações detalhadas
  if (quemReagendou === 'professor' && dataReagendamentoAluno && dataAprovacaoProfessor) {
    const dataAluno = formatarDataHoraSimples(dataReagendamentoAluno)
    const dataProfessor = formatarDataHoraSimples(dataAprovacaoProfessor)
    novaObs = `Aula reagendada pelo aluno no dia ${dataAluno} e aprovado pelo professor no dia ${dataProfessor}`
  } else {
    novaObs = `Aula foi reagendada pelo ${quemReagendou} às ${formatarDataHoraSimples(dataHora)}`
  }
  
  if (notesAtuais && notesAtuais.trim()) {
    return `${notesAtuais}\n${novaObs}`
  }
  return novaObs
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const auth = await requireTeacher(request)
    if (!auth.authorized || !auth.session) {
      return NextResponse.json(
        { ok: false, message: auth.message || 'Não autorizado' },
        { status: auth.message?.includes('Não autenticado') ? 401 : 403 }
      )
    }

    // Buscar o teacher pelo userId
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

    const requestId = params.id
    const body = await request.json()
    const { approved } = body // boolean

    if (typeof approved !== 'boolean') {
      return NextResponse.json(
        { ok: false, message: 'approved deve ser true ou false' },
        { status: 400 }
      )
    }

    // Buscar solicitação
    const lessonRequest = await prisma.lessonRequest.findUnique({
      where: { id: requestId },
      include: {
        lesson: {
          include: {
            enrollment: {
              include: {
                user: true,
              },
            },
            teacher: true,
          },
        },
        teacher: true,
        requestedTeacher: true,
      },
    })

    if (!lessonRequest) {
      return NextResponse.json(
        { ok: false, message: 'Solicitação não encontrada' },
        { status: 404 }
      )
    }

    // Verificar se o professor tem permissão para aprovar esta solicitação
    // Comparar teacherId da solicitação com o teacherId do professor logado
    if (lessonRequest.teacherId !== teacher.id) {
      console.error('[api/lesson-requests/[id]/teacher-approval] Permissão negada:', {
        requestTeacherId: lessonRequest.teacherId,
        loggedTeacherId: teacher.id,
        sessionUserId: auth.session.userId,
      })
      return NextResponse.json(
        { ok: false, message: 'Você não tem permissão para aprovar esta solicitação' },
        { status: 403 }
      )
    }

    // Permitir que o professor aprove qualquer solicitação relacionada à sua aula
    // Mesmo que não "requeira" aprovação formalmente, o professor pode aprovar se quiser
    // Isso dá mais controle ao professor sobre suas aulas

    // Verificar se já foi processada
    if (lessonRequest.status !== 'PENDING') {
      return NextResponse.json(
        { ok: false, message: 'Esta solicitação já foi processada' },
        { status: 400 }
      )
    }

    // Atualizar solicitação
    const updatedRequest = await prisma.lessonRequest.update({
      where: { id: requestId },
      data: {
        teacherApproval: approved ? 'APPROVED' : 'REJECTED',
        teacherApprovedAt: new Date(),
        status: approved ? 'TEACHER_APPROVED' : 'TEACHER_REJECTED',
      },
      include: {
        lesson: {
          include: {
            enrollment: {
              include: {
                user: true,
              },
            },
            teacher: true,
          },
        },
        teacher: true,
        requestedTeacher: true,
      },
    })

    // Se aprovado, processar automaticamente: cancelar aula original e criar nova
    if (approved) {
      const lesson = lessonRequest.lesson
      const enrollment = lesson.enrollment

      // Cancelar aula original
      // Quando o professor aprova uma solicitação do aluno, o cancelamento foi solicitado pelo aluno, não pelo professor
      const agora = new Date()
      const notesAtuaisCancelamento = lesson.notes
      const novaObservacaoCancelamento = adicionarObservacaoCancelamento(notesAtuaisCancelamento, 'aluno', agora)
      
      await prisma.lesson.update({
        where: { id: lesson.id },
        data: {
          status: 'CANCELLED',
          notes: novaObservacaoCancelamento,
        },
      })

      // Criar nova aula se há data/professor solicitado
      let newLesson = null
      if (lessonRequest.requestedStartAt) {
        const newTeacherId = lessonRequest.requestedTeacherId || lessonRequest.teacherId
        
        console.log('[api/lesson-requests/[id]/teacher-approval] Criando nova aula:', {
          enrollmentId: enrollment.id,
          teacherId: newTeacherId,
          status: 'REPOSICAO',
          startAt: lessonRequest.requestedStartAt,
          durationMinutes: lesson.durationMinutes || 60,
        })
        
        // Usar a data de criação da solicitação (quando o aluno reagendou) e a data atual (quando o professor aprovou)
        const dataReagendamentoAluno = lessonRequest.criadoEm
        const dataAprovacaoProfessor = agora
        
        const notesReagendamento = adicionarObservacaoReagendamento(
          null, 
          'professor', 
          agora,
          dataReagendamentoAluno,
          dataAprovacaoProfessor
        )
        
        newLesson = await prisma.lesson.create({
          data: {
            enrollmentId: enrollment.id,
            teacherId: newTeacherId,
            status: 'REPOSICAO', // Nova aula criada como REPOSICAO (amarelo)
            startAt: lessonRequest.requestedStartAt,
            durationMinutes: lesson.durationMinutes || 60,
            notes: notesReagendamento,
          },
          include: {
            enrollment: {
              include: {
                user: true,
              },
            },
            teacher: true,
          },
        })

        // Enviar email para aluno e professor(es)
        const { diaSemana, data, horario } = formatarDataHora(new Date(lessonRequest.requestedStartAt))
        const oldDate = formatarDataHora(new Date(lesson.startAt))
        
        const subject = 'Aula reagendada - Seidmann Institute'
        const text = `Olá ${enrollment.nome || 'Aluno'},

Sua solicitação de alteração de aula foi aprovada pelo professor.

Aula original cancelada:
${oldDate.diaSemana}, ${oldDate.data} às ${oldDate.horario}

Nova aula agendada:
${diaSemana}, ${data} às ${horario}
Professor: ${newLesson.teacher.nome || 'N/A'}

Por favor, confirme sua presença na nova data.

📌 Esta é uma mensagem automática. Por favor, não responda este e-mail.

Atenciosamente,
Equipe Seidmann Institute`

        if (enrollment.email) {
          await sendEmail({
            to: enrollment.email,
            subject,
            text,
          })
        }

        // Email para o novo professor (se diferente)
        if (newTeacherId !== lessonRequest.teacherId && newLesson.teacher.email) {
          const teacherSubject = 'Nova aula adicionada à sua agenda'
          const teacherText = `Olá ${newLesson.teacher.nome || 'Professor'},

Uma nova aula foi adicionada à sua agenda:

Aluno: ${enrollment.nome || 'N/A'}
Data: ${diaSemana}, ${data} às ${horario}

Por favor, confirme sua disponibilidade.

📌 Esta é uma mensagem automática. Por favor, não responda este e-mail.

Atenciosamente,
Equipe Seidmann Institute`

          await sendEmail({
            to: newLesson.teacher.email,
            subject: teacherSubject,
            text: teacherText,
          })
        }
      }

      // Marcar solicitação como concluída
      await prisma.lessonRequest.update({
        where: { id: requestId },
        data: {
          status: 'COMPLETED',
        },
      })
      
      console.log('[api/lesson-requests/[id]/teacher-approval] Solicitação aprovada e processada:', {
        requestId,
        oldLessonId: lesson.id,
        newLessonId: newLesson?.id,
        oldLessonStatus: 'CANCELLED',
        newLessonStatus: 'REPOSICAO',
      })
    } else {
        // Se negado, notificar aluno e enviar para gestão
      const { diaSemana, data, horario } = formatarDataHora(new Date(lesson.startAt))
      
      const subject = 'Solicitação de alteração negada pelo professor'
      const text = `Olá ${enrollment.nome || 'Aluno'},

Infelizmente, sua solicitação de alteração de aula foi negada pelo professor.

Aula original:
${diaSemana}, ${data} às ${horario}
Professor: ${lesson.teacher.nome || 'N/A'}

Sua solicitação foi encaminhada para a gestão, que entrará em contato para encontrar uma solução alternativa.

📌 Esta é uma mensagem automática. Por favor, não responda este e-mail.

Atenciosamente,
Equipe Seidmann Institute`

      if (enrollment.email) {
        await sendEmail({
          to: enrollment.email,
          subject,
          text,
        })
      }
    }

    return NextResponse.json({
      ok: true,
      request: {
        id: updatedRequest.id,
        status: updatedRequest.status,
        teacherApproval: updatedRequest.teacherApproval,
        teacherApprovedAt: updatedRequest.teacherApprovedAt,
      },
    })
  } catch (error) {
    console.error('[api/lesson-requests/[id]/teacher-approval PATCH]', error)
    return NextResponse.json(
      { ok: false, message: 'Erro ao processar aprovação' },
      { status: 500 }
    )
  }
}
