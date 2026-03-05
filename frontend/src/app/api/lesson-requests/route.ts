/**
 * POST /api/lesson-requests
 * Criar solicitação de cancelamento/troca de aula
 * Alunos e professores podem criar solicitações
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireStudent, requireTeacher } from '@/lib/auth'
import { sendEmail } from '@/lib/email'

const DIAS_SEMANA = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado']

function formatarDataHora(d: Date): { diaSemana: string; data: string; horario: string } {
  const diaSemana = DIAS_SEMANA[d.getDay()]
  const data = d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
  const horario = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', hour12: false })
  return { diaSemana, data, horario }
}

export async function POST(request: NextRequest) {
  try {
    // Verificar se o modelo existe no Prisma Client
    if (!prisma.lessonRequest) {
      console.error('[api/lesson-requests] Modelo LessonRequest não encontrado. Execute: npx prisma generate && npx prisma migrate deploy')
      return NextResponse.json(
        { ok: false, message: 'Modelo LessonRequest não disponível. Execute: npx prisma generate && npx prisma migrate deploy' },
        { status: 503 }
      )
    }

    // Verificar se é aluno ou professor
    const studentAuth = await requireStudent(request)
    const teacherAuth = await requireTeacher(request)
    
    if (!studentAuth.authorized && !teacherAuth.authorized) {
      return NextResponse.json(
        { ok: false, message: 'Não autorizado' },
        { status: 401 }
      )
    }

    const auth = studentAuth.authorized ? studentAuth : teacherAuth
    const isStudent = studentAuth.authorized

    const body = await request.json()
    const {
      lessonId,
      type, // CANCELAMENTO, TROCA_PROFESSOR, TROCA_AULA
      requestedStartAt, // ISO string opcional
      requestedTeacherId, // ID do professor desejado (opcional)
      notes,
    } = body

    if (!lessonId || !type) {
      return NextResponse.json(
        { ok: false, message: 'lessonId e type são obrigatórios' },
        { status: 400 }
      )
    }

    const validTypes = ['CANCELAMENTO', 'TROCA_PROFESSOR', 'TROCA_AULA']
    if (!validTypes.includes(type)) {
      return NextResponse.json(
        { ok: false, message: 'Tipo inválido' },
        { status: 400 }
      )
    }

    // Buscar a aula e verificar permissões
    const lesson = await prisma.lesson.findUnique({
      where: { id: lessonId },
      include: {
        enrollment: {
          select: {
            id: true,
            nome: true,
            userId: true,
            escolaMatricula: true,
            cancelamentoAntecedenciaHoras: true,
            tipoAula: true,
            user: true,
          },
        },
        teacher: true,
      },
    })

    if (!lesson) {
      return NextResponse.json(
        { ok: false, message: 'Aula não encontrada' },
        { status: 404 }
      )
    }

    // Verificar se o usuário tem permissão para solicitar alteração desta aula
    if (isStudent) {
      // Aluno só pode solicitar alteração de suas próprias aulas
      // Verificar se o userId da sessão corresponde ao userId do enrollment
      const sessionUserId = auth.session?.userId
      const enrollmentUserId = lesson.enrollment.userId
      
      // Se o enrollment não tem userId vinculado, verificar se o aluno tem algum enrollment com esse ID
      if (!enrollmentUserId) {
        // Buscar se o aluno tem algum enrollment com esse ID
        const studentEnrollments = await prisma.enrollment.findMany({
          where: { userId: sessionUserId },
          select: { id: true },
        })
        const enrollmentIds = studentEnrollments.map(e => e.id)
        
        if (!enrollmentIds.includes(lesson.enrollmentId)) {
          console.error('[api/lesson-requests] Permissão negada - enrollment sem userId:', {
            enrollmentId: lesson.enrollmentId,
            sessionUserId,
            studentEnrollmentIds: enrollmentIds,
          })
          return NextResponse.json(
            { ok: false, message: 'Você não tem permissão para alterar esta aula' },
            { status: 403 }
          )
        }
      } else if (enrollmentUserId !== sessionUserId) {
        console.error('[api/lesson-requests] Permissão negada:', {
          enrollmentUserId,
          sessionUserId,
        })
        return NextResponse.json(
          { ok: false, message: 'Você não tem permissão para alterar esta aula' },
          { status: 403 }
        )
      }

      // Aulas em grupo não podem ser canceladas nem trocadas pelo portal do aluno
      if (lesson.enrollment.tipoAula === 'GRUPO') {
        return NextResponse.json(
          { ok: false, message: 'Aulas em grupo não podem ser canceladas nem trocadas pelo portal do aluno. Entre em contato com a gestão.' },
          { status: 403 }
        )
      }
    } else {
      // Professor só pode solicitar alteração de suas próprias aulas
      // Para professores, verificar se o teacherId corresponde ao userId da sessão
      // Primeiro, buscar o teacher pelo userId
      const teacher = await prisma.teacher.findFirst({
        where: { userId: auth.session?.userId },
        select: { id: true },
      })
      
      if (!teacher || teacher.id !== lesson.teacherId) {
        return NextResponse.json(
          { ok: false, message: 'Você não tem permissão para alterar esta aula' },
          { status: 403 }
        )
      }
    }

    // Verificar se a aula original está em feriado
    const lessonDate = new Date(lesson.startAt)
    const lessonDateKey = lessonDate.toISOString().split('T')[0]
    const holiday = await prisma.holiday.findUnique({
      where: { dateKey: lessonDateKey },
    })
    
    if (holiday) {
      return NextResponse.json(
        { ok: false, message: 'Não é possível reagendar uma aula que está em um feriado' },
        { status: 400 }
      )
    }

    // Verificar tempo de antecedência para cancelamento
    const escolaMatricula = lesson.enrollment.escolaMatricula
    const isYoubecome = escolaMatricula === 'YOUBECOME'
    
    // Obter tempo de antecedência: padrão 24h para YOUBECOME, 6h para outros, ou valor personalizado
    let horasAntecedencia = isYoubecome ? 24 : 6
    const cancelamentoHoras = (lesson.enrollment as any).cancelamentoAntecedenciaHoras
    if (cancelamentoHoras !== null && cancelamentoHoras !== undefined && typeof cancelamentoHoras === 'number') {
      horasAntecedencia = cancelamentoHoras
    }
    
    if (type === 'CANCELAMENTO') {
      const agora = new Date()
      const diffHoras = (lessonDate.getTime() - agora.getTime()) / (1000 * 60 * 60)
      
      if (diffHoras < horasAntecedencia) {
        const mensagem = isYoubecome
          ? `Alunos YOUBECOME só podem cancelar aulas com pelo menos ${horasAntecedencia} horas de antecedência`
          : `É necessário cancelar com pelo menos ${horasAntecedencia} horas de antecedência`
        return NextResponse.json(
          { ok: false, message: mensagem },
          { status: 400 }
        )
      }
    }

    // Verificar se a data solicitada é válida (para TROCA_AULA)
    if (type === 'TROCA_AULA' && requestedStartAt) {
      const requestedDate = new Date(requestedStartAt)
      const requestedDateKey = requestedDate.toISOString().split('T')[0]
      const requestedDateOnly = new Date(requestedDateKey + 'T00:00:00')
      const lessonDateOnly = new Date(lessonDateKey + 'T00:00:00')
      
      // Verificar se é anterior à aula original
      if (requestedDateOnly < lessonDateOnly) {
        return NextResponse.json(
          { ok: false, message: 'Não é possível agendar para uma data anterior à aula original' },
          { status: 400 }
        )
      }
      
      // Verificar se é feriado
      const requestedHoliday = await prisma.holiday.findUnique({
        where: { dateKey: requestedDateKey },
      })
      
      if (requestedHoliday) {
        return NextResponse.json(
          { ok: false, message: 'Não é possível agendar uma reposição em um feriado' },
          { status: 400 }
        )
      }
    }

    // Verificar se precisa de aprovação do professor
    // Para YOUBECOME: troca de aula/professor requer aprovação do professor
    const requiresTeacherApproval = isYoubecome && (type === 'TROCA_PROFESSOR' || type === 'TROCA_AULA')

    if (!lesson.teacherId) {
      return NextResponse.json(
        { ok: false, message: 'Esta aula não possui professor designado. Não é possível criar solicitação.' },
        { status: 400 }
      )
    }
    
    console.log('[api/lesson-requests] Criando solicitação:', {
      lessonId: lesson.id,
      teacherId: lesson.teacherId,
      type,
      isYoubecome,
      requiresTeacherApproval,
    })

    // Criar solicitação
    let lessonRequest
    try {
      // Validar tipo antes de criar
      const validType = validTypes.includes(type) ? type : 'CANCELAMENTO'
      
      lessonRequest = await prisma.lessonRequest.create({
        data: {
          lessonId: lesson.id,
          enrollmentId: lesson.enrollmentId,
          teacherId: lesson.teacherId,
          type: validType as 'CANCELAMENTO' | 'TROCA_PROFESSOR' | 'TROCA_AULA',
          status: 'PENDING',
          requiresTeacherApproval,
          requestedStartAt: requestedStartAt ? new Date(requestedStartAt) : null,
          requestedTeacherId: requestedTeacherId || null,
          notes: notes?.trim() || null,
          createdById: auth.session?.userId || null,
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
        },
      })
    } catch (createError) {
      console.error('[api/lesson-requests POST] Erro ao criar lessonRequest:', createError)
      throw new Error(`Erro ao criar solicitação no banco de dados: ${createError instanceof Error ? createError.message : 'Erro desconhecido'}`)
    }

    // Se requer aprovação do professor, notificar o professor
    if (requiresTeacherApproval) {
      const { diaSemana, data, horario } = formatarDataHora(new Date(lesson.startAt))
      const subject = 'Solicitação de alteração de aula - Aprovação necessária'
      const text = `Olá ${lesson.teacher?.nome ?? 'Professor'},

Uma solicitação de ${type === 'TROCA_PROFESSOR' ? 'troca de professor' : 'troca de aula'} foi feita para a seguinte aula:

Aluno: ${lesson.enrollment.nome || 'N/A'}
Data: ${diaSemana}, ${data} às ${horario}
${requestedStartAt ? `Nova data solicitada: ${formatarDataHora(new Date(requestedStartAt)).diaSemana}, ${formatarDataHora(new Date(requestedStartAt)).data} às ${formatarDataHora(new Date(requestedStartAt)).horario}` : ''}
${notes ? `Observações: ${notes}` : ''}

Por favor, acesse o Portal do Professor para aprovar ou negar esta solicitação.

📌 Esta é uma mensagem automática. Por favor, não responda este e-mail.

Atenciosamente,
Equipe Seidmann Institute`

      const teacherEmail = lesson.teacher?.email
      if (teacherEmail) {
        await sendEmail({
          to: teacherEmail,
          subject,
          text,
        })
      }
    }

    return NextResponse.json({
      ok: true,
      request: {
        id: lessonRequest.id,
        type: lessonRequest.type,
        status: lessonRequest.status,
        requiresTeacherApproval: lessonRequest.requiresTeacherApproval,
      },
    })
  } catch (error) {
    console.error('[api/lesson-requests POST]', error)
    const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido'
    const errorStack = error instanceof Error ? error.stack : undefined
    console.error('[api/lesson-requests POST] Detalhes:', { errorMessage, errorStack })
    return NextResponse.json(
      { ok: false, message: `Erro ao criar solicitação: ${errorMessage}` },
      { status: 500 }
    )
  }
}
