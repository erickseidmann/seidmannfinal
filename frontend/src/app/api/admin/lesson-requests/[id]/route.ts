/**
 * PATCH /api/admin/lesson-requests/[id]
 * Processar solicitação de cancelamento/troca de aula pela gestão
 * Apenas administradores podem processar
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/auth'
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

function adicionarObservacaoReagendamento(notesAtuais: string | null, quemReagendou: string, dataHora: Date, dataReagendamentoAluno?: Date, dataAprovacao?: Date): string {
  let novaObs = ''
  
  // Se foi reagendada pelo aluno e aprovada pelo admin/professor, mostrar informações detalhadas
  // quemReagendou pode ser o nome do admin ou "admin"/"professor" genérico
  if (dataReagendamentoAluno && dataAprovacao) {
    const dataAluno = formatarDataHoraSimples(dataReagendamentoAluno)
    const dataAprovacaoFormatada = formatarDataHoraSimples(dataAprovacao)
    // Se quemReagendou não é "admin" ou "professor" genérico, é o nome específico do admin
    const aprovador = quemReagendou.toLowerCase() === 'admin' ? 'admin' : (quemReagendou.toLowerCase() === 'professor' ? 'professor' : quemReagendou)
    novaObs = `Aula reagendada pelo aluno no dia ${dataAluno} e aprovado pelo ${aprovador} no dia ${dataAprovacaoFormatada}`
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
    const auth = await requireAdmin(request)
    if (!auth.authorized) {
      return NextResponse.json(
        { ok: false, message: auth.message || 'Não autorizado' },
        { status: auth.message?.includes('Não autenticado') ? 401 : 403 }
      )
    }

    const requestId = params.id
    const body = await request.json()
    const {
      action, // APPROVE, REJECT
      newTeacherId, // ID do novo professor (opcional, para troca)
      newStartAt, // ISO string (opcional, para reagendamento)
      adminNotes,
    } = body

    if (!action || !['APPROVE', 'REJECT'].includes(action)) {
      return NextResponse.json(
        { ok: false, message: 'action deve ser APPROVE ou REJECT' },
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

    const lesson = lessonRequest.lesson
    const enrollment = lesson.enrollment

    if (action === 'APPROVE') {
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
          console.error('[api/admin/lesson-requests/[id] PATCH] Erro ao buscar nome do admin:', err)
        }
      }
      
      // Cancelar aula original
      const agora = new Date()
      const notesAtuaisCancelamento = lesson.notes
      const novaObservacaoCancelamento = adicionarObservacaoCancelamento(notesAtuaisCancelamento, nomeAdmin, agora)
      
      await prisma.lesson.update({
        where: { id: lesson.id },
        data: {
          status: 'CANCELLED',
          notes: novaObservacaoCancelamento,
        },
      })

      // Determinar novo professor e data
      const finalTeacherId = newTeacherId || lessonRequest.requestedTeacherId || lessonRequest.teacherId
      const finalStartAt = newStartAt ? new Date(newStartAt) : lessonRequest.requestedStartAt || lesson.startAt

      // Criar nova aula como REPOSICAO (amarelo)
      // Se a solicitação foi criada por um aluno, usar formato detalhado
      const dataReagendamentoAluno = lessonRequest.criadoEm
      const dataAprovacaoAdmin = agora
      
      const notesReagendamento = adicionarObservacaoReagendamento(
        null, 
        nomeAdmin, 
        agora,
        dataReagendamentoAluno,
        dataAprovacaoAdmin
      )
      const notesFinais = adminNotes ? `${notesReagendamento}\n${adminNotes}` : notesReagendamento
      
      const newLesson = await prisma.lesson.create({
        data: {
          enrollmentId: enrollment.id,
          teacherId: finalTeacherId,
          status: 'REPOSICAO', // Nova aula criada como REPOSICAO (amarelo)
          startAt: finalStartAt,
          durationMinutes: lesson.durationMinutes || 60,
          notes: notesFinais,
          createdById: auth.session?.sub || null,
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

      // Enviar emails
      const { diaSemana, data, horario } = formatarDataHora(finalStartAt)
      const oldDate = formatarDataHora(new Date(lesson.startAt))

      // Email para aluno
      const studentSubject = 'Aula reagendada pela gestão - Seidmann Institute'
      const studentText = `Olá ${enrollment.nome || 'Aluno'}!

Informamos que sua solicitação de troca de aula foi processada pela gestão.

✅ Aula reagendada com sucesso:

Nova aula agendada:
${diaSemana}, ${data} às ${horario}
Professor: ${newLesson.teacher?.nome ?? 'N/A'}
${adminNotes ? `Observações: ${adminNotes}` : ''}

Por favor, confirme sua presença na nova data.

📌 Esta é uma mensagem automática. Por favor, não responda este e-mail.

Caso você tenha qualquer dúvida, identifique alguma informação incorreta ou precise de ajuda adicional, entre em contato com a gestão de aulas pelo WhatsApp:
📞 +55 19 97809-4000

Estamos à disposição para ajudar.

Atenciosamente,
Equipe Seidmann Institute`

      if (enrollment.email) {
        await sendEmail({
          to: enrollment.email,
          subject: studentSubject,
          text: studentText,
        })
      }

      // Email para o novo professor (se diferente do original)
      if (finalTeacherId !== lessonRequest.teacherId) {
        const teacherSubject = 'Nova aula adicionada à sua agenda'
        const teacherText = `Olá ${newLesson.teacher?.nome ?? 'Professor'},

Uma nova aula foi adicionada à sua agenda:

Aluno: ${enrollment.nome || 'N/A'}
Data: ${diaSemana}, ${data} às ${horario}
${adminNotes ? `Observações: ${adminNotes}` : ''}

Por favor, confirme sua disponibilidade.

📌 Esta é uma mensagem automática. Por favor, não responda este e-mail.

Atenciosamente,
Equipe Seidmann Institute`

        if (newLesson.teacher?.email) {
          await sendEmail({
            to: newLesson.teacher.email,
            subject: teacherSubject,
            text: teacherText,
          })
        }
      }

      // Atualizar solicitação
      await prisma.lessonRequest.update({
        where: { id: requestId },
        data: {
          status: 'COMPLETED',
          adminNotes: adminNotes?.trim() || null,
          processedById: auth.session?.sub || null,
        },
      })
    } else {
      // REJECT
      await prisma.lessonRequest.update({
        where: { id: requestId },
        data: {
          status: 'ADMIN_REJECTED',
          adminNotes: adminNotes?.trim() || null,
          processedById: auth.session?.sub || null,
        },
      })

      // Notificar aluno
      const { diaSemana, data, horario } = formatarDataHora(new Date(lesson.startAt))
      
      const subject = 'Solicitação de alteração de aula negada'
      const text = `Olá ${enrollment.nome || 'Aluno'},

Infelizmente, sua solicitação de alteração de aula foi negada pela gestão.

Aula original permanece agendada:
${diaSemana}, ${data} às ${horario}
Professor: ${lesson.teacher?.nome ?? 'N/A'}
${adminNotes ? `Motivo: ${adminNotes}` : ''}

Em caso de dúvidas, entre em contato com a gestão de aulas.

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
      message: action === 'APPROVE' ? 'Solicitação aprovada e processada' : 'Solicitação negada',
    })
  } catch (error) {
    console.error('[api/admin/lesson-requests/[id] PATCH]', error)
    return NextResponse.json(
      { ok: false, message: 'Erro ao processar solicitação' },
      { status: 500 }
    )
  }
}
