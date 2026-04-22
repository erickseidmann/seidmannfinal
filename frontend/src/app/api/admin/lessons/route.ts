/**
 * API: GET /api/admin/lessons (listar por período)
 *      POST /api/admin/lessons (criar aula)
 */

import { NextRequest, NextResponse } from 'next/server'
import { lessonIntervalsOverlap } from '@/lib/lesson-overlap'

function formatDataHora(d: Date): string {
  return d.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' }) +
    ' às ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}
import { prisma } from '@/lib/prisma'
import { isTeacherAlertEnrollmentIdColumnError } from '@/lib/prisma-teacher-alert-enrollment-column'
import { buildNewStudentTeacherAlertMessage } from '@/lib/teacher-new-student-alert'
import { requireAdmin } from '@/lib/auth'
import {
  ENROLLMENT_STATUSES_PRE_SCHEDULING,
  enrollmentAllowsSchedulingLessons,
} from '@/lib/enrollment-scheduling'
import { LESSON_STATUSES_SCHEDULED, lessonStatusValidOriginForReposicao } from '@/lib/lesson-status'
import { sendEmail, mensagemAulaConfirmada, mensagemReposicaoAgendada, mensagemCancelamentoComReposicao } from '@/lib/email'

export async function GET(request: NextRequest) {
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

    const { searchParams } = new URL(request.url)
    const startParam = searchParams.get('start') // ISO date or datetime
    const endParam = searchParams.get('end')
    const teacherIdParam = searchParams.get('teacherId')
    const bolsistaOnly = searchParams.get('bolsistaOnly') === 'true'
    /** Filtro opcional por escola de matrícula: TODAS | SEM_ESCOLA | SEIDMANN | YOUBECOME | HIGHWAY | OUTRO */
    const escolaFiltro = searchParams.get('escola')?.trim() ?? ''

    if (!startParam || !endParam) {
      return NextResponse.json(
        { ok: false, message: 'Parâmetros start e end são obrigatórios' },
        { status: 400 }
      )
    }

    const startAt = new Date(startParam)
    const endAt = new Date(endParam)
    if (Number.isNaN(startAt.getTime()) || Number.isNaN(endAt.getTime())) {
      return NextResponse.json(
        { ok: false, message: 'Datas inválidas' },
        { status: 400 }
      )
    }

    const enrollmentWhere: Record<string, unknown> = {
      status: { notIn: [...ENROLLMENT_STATUSES_PRE_SCHEDULING] },
    }
    if (bolsistaOnly) {
      enrollmentWhere.bolsista = true
    }
    if (escolaFiltro && escolaFiltro !== 'TODAS') {
      if (escolaFiltro === 'SEM_ESCOLA') {
        enrollmentWhere.escolaMatricula = null
      } else if (['SEIDMANN', 'YOUBECOME', 'HIGHWAY', 'OUTRO'].includes(escolaFiltro)) {
        enrollmentWhere.escolaMatricula = escolaFiltro
      }
    }

    const where: Record<string, unknown> = {
      startAt: { gte: startAt, lte: endAt },
      // Não mostrar aulas sem professor: nenhum aluno pode ficar no calendário sem professor
      teacherId: { not: null },
      enrollment: enrollmentWhere,
    }
    if (teacherIdParam?.trim()) {
      where.teacherId = teacherIdParam.trim()
    }

    const lessons = await prisma.lesson.findMany({
      where,
      include: {
        enrollment: {
          select: {
            id: true,
            nome: true,
            bolsista: true,
            escolaMatricula: true,
            escolaMatriculaOutro: true,
            frequenciaSemanal: true,
            tipoAula: true,
            nomeGrupo: true,
            curso: true,
            status: true,
            pausedAt: true,
            activationDate: true,
            paymentInfo: { select: { valorHora: true } },
          },
        },
        teacher: { select: { id: true, nome: true } },
        requests: {
          where: {
            status: { in: ['PENDING', 'TEACHER_APPROVED'] },
          },
          select: {
            id: true,
            type: true,
            status: true,
          },
        },
      },
      orderBy: { startAt: 'asc' },
    })

    return NextResponse.json({
      ok: true,
      data: { lessons },
    })
  } catch (error) {
    console.error('[api/admin/lessons GET]', error)
    return NextResponse.json(
      { ok: false, message: 'Erro ao listar aulas' },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
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

    const body = await request.json()
    const {
      enrollmentId,
      teacherId,
      status = 'CONFIRMED',
      startAt: startAtStr,
      durationMinutes = 30,
      notes,
      repeatWeeks: repeatWeeksParam,
      repeatSameWeek = false,
      repeatSameWeekStartAt = null,
      repeatFrequencyEnabled = false,
      repeatFrequencyWeeks: repeatFrequencyWeeksParam = 0,
      canceledLessonInfo, // { startAt: string, teacherId: string } - informações da aula cancelada para envio de email
    } = body

    if (!enrollmentId || !teacherId || !startAtStr) {
      return NextResponse.json(
        { ok: false, message: 'enrollmentId, teacherId e startAt são obrigatórios' },
        { status: 400 }
      )
    }

    // Validar idioma: professor deve ensinar o(s) idioma(s) do curso do aluno
    // Verificar se o aluno está inativo (não pode criar aulas futuras)
    // Para alunos pausados: pode criar aulas, mas não pode atribuir professor durante o período pausado
    const [enrollment, teacher] = await Promise.all([
      prisma.enrollment.findUnique({
        where: { id: enrollmentId },
        select: { curso: true, status: true, pausedAt: true, activationDate: true },
      }),
      prisma.teacher.findUnique({
        where: { id: teacherId },
        select: { idiomasEnsina: true },
      }),
    ])

    const startAt = new Date(startAtStr)
    if (Number.isNaN(startAt.getTime())) {
      return NextResponse.json(
        { ok: false, message: 'Data/hora inválida' },
        { status: 400 }
      )
    }

    if (enrollment && !enrollmentAllowsSchedulingLessons(enrollment.status)) {
      return NextResponse.json(
        {
          ok: false,
          message:
            'Não é possível agendar aulas para alunos em Matriculado ou Contrato aceito. Avance o status após pagamento/início.',
        },
        { status: 400 }
      )
    }

    // Verificar se aluno está inativo - não pode criar aulas futuras
    if (enrollment && enrollment.status === 'INACTIVE') {
      const hoje = new Date()
      hoje.setHours(0, 0, 0, 0)
      if (startAt >= hoje) {
        return NextResponse.json(
          { ok: false, message: 'Não é possível adicionar aulas futuras para alunos inativos. Ative o aluno primeiro.' },
          { status: 400 }
        )
      }
    }

    // Verificar se aluno está pausado e a aula está no período pausado - não pode atribuir professor
    if (enrollment && enrollment.status === 'PAUSED' && enrollment.pausedAt) {
      const pausedAt = new Date(enrollment.pausedAt)
      pausedAt.setHours(0, 0, 0, 0)
      const lessonDate = new Date(startAt)
      lessonDate.setHours(0, 0, 0, 0)
      const activationDate = enrollment.activationDate ? new Date(enrollment.activationDate) : null
      if (activationDate) {
        activationDate.setHours(0, 0, 0, 0)
      }
      // Se a aula está no período pausado (entre pausedAt e activationDate), não pode atribuir professor
      if (lessonDate >= pausedAt && (!activationDate || lessonDate < activationDate)) {
        return NextResponse.json(
          { ok: false, message: 'Não é possível atribuir professor para aulas de alunos pausados durante o período de pausa. Defina uma data de ativação.' },
          { status: 400 }
        )
      }
    }

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


    const validStatus = [
      'CONFIRMED',
      'CANCELLED',
      'CANCELLED_BY_TEACHER',
      'CANCELLED_NO_REPLACEMENT',
      'REPOSICAO',
    ].includes(status)
      ? status
      : 'CONFIRMED'
    const duration = Number(durationMinutes) || 60
    const notesTrim = notes?.trim() || null

    // Regra de negócio: reposição só pode ser agendada a partir de uma aula cancelada.
    if (validStatus === 'REPOSICAO') {
      const canceledStartAtStr =
        canceledLessonInfo && typeof canceledLessonInfo.startAt === 'string'
          ? canceledLessonInfo.startAt
          : ''
      const canceledTeacherId =
        canceledLessonInfo && typeof canceledLessonInfo.teacherId === 'string'
          ? canceledLessonInfo.teacherId
          : ''

      if (!canceledStartAtStr || !canceledTeacherId) {
        return NextResponse.json(
          {
            ok: false,
            message: 'Reposição só pode ser agendada a partir de uma aula cancelada.',
          },
          { status: 400 }
        )
      }

      const canceledStartAt = new Date(canceledStartAtStr)
      if (Number.isNaN(canceledStartAt.getTime())) {
        return NextResponse.json(
          {
            ok: false,
            message: 'Dados da aula cancelada inválidos para agendar reposição.',
          },
          { status: 400 }
        )
      }

      const canceledLessonIdFromBody =
        canceledLessonInfo && typeof canceledLessonInfo.lessonId === 'string'
          ? canceledLessonInfo.lessonId.trim()
          : ''

      let canceledLesson: { id: string } | null = null
      if (canceledLessonIdFromBody) {
        const cl = await prisma.lesson.findFirst({
          where: { id: canceledLessonIdFromBody, enrollmentId },
          select: { id: true, status: true },
        })
        if (!cl || !lessonStatusValidOriginForReposicao(cl.status)) {
          return NextResponse.json(
            {
              ok: false,
              message:
                cl?.status === 'CANCELLED_NO_REPLACEMENT'
                  ? 'Esta aula foi cancelada sem reposição; não é possível agendar reposição a partir dela.'
                  : 'Não foi encontrada a aula cancelada de origem válida para esta reposição.',
            },
            { status: 400 }
          )
        }
        canceledLesson = { id: cl.id }
      } else {
        canceledLesson = await prisma.lesson.findFirst({
          where: {
            enrollmentId,
            teacherId: canceledTeacherId,
            startAt: canceledStartAt,
            status: { in: ['CANCELLED', 'CANCELLED_BY_TEACHER'] },
          },
          select: { id: true },
        })
        if (!canceledLesson) {
          return NextResponse.json(
            {
              ok: false,
              message: 'Não foi encontrada a aula cancelada de origem para esta reposição.',
            },
            { status: 400 }
          )
        }
      }
    }

    const repeatWeeks = Math.min(52, Math.max(1, Number(repeatWeeksParam) || 1))
    const repeatFrequencyWeeks = repeatFrequencyEnabled ? Math.min(52, Math.max(1, Number(repeatFrequencyWeeksParam) || 1)) : 0

    // Calcular range de datas para repetição
    const firstStart = new Date(startAt)
    let lastStart = new Date(startAt)
    
    // Se há repetição de frequência, calcular até a última semana
    if (repeatFrequencyEnabled && repeatFrequencyWeeks > 0) {
      lastStart.setDate(lastStart.getDate() + (repeatFrequencyWeeks - 1) * 7)
      // Se há repetição na mesma semana, considerar também essa data
      if (repeatSameWeek && repeatSameWeekStartAt) {
        const sameWeekDate = new Date(repeatSameWeekStartAt)
        if (sameWeekDate > lastStart) {
          lastStart = sameWeekDate
        }
      }
    } else if (repeatWeeks > 1) {
      lastStart.setDate(lastStart.getDate() + (repeatWeeks - 1) * 7)
    }
    
    const existingLessonCount = await prisma.lesson.count({
      where: { teacherId, enrollmentId },
    })
    const isFirstLessonForTeacherAndEnrollment = existingLessonCount === 0

    // Buscar nome do admin que está criando a aula
    let createdByName: string | null = null
    if (auth.session?.sub) {
      const adminUser = await prisma.user.findUnique({
        where: { id: auth.session.sub },
        select: { nome: true },
      })
      createdByName = adminUser?.nome || null
    }

    const lessonsCreated: Awaited<ReturnType<typeof prisma.lesson.create>>[] = []

    // Sobreposição: mesmo aluno não pode ter duas aulas no mesmo intervalo (qualquer professor);
    // mesmo professor não pode ter duas aulas no mesmo intervalo (outros alunos).
    const checkOverlap = async (
      lessonStart: Date,
      enrollmentIdParam: string,
      teacherIdParam: string
    ): Promise<{ conflictMessage?: string }> => {
      const windowStart = new Date(lessonStart)
      windowStart.setHours(windowStart.getHours() - 4)
      const windowEnd = new Date(lessonStart)
      windowEnd.setMinutes(windowEnd.getMinutes() + duration + 240)

      const byEnrollment = await prisma.lesson.findMany({
        where: {
          enrollmentId: enrollmentIdParam,
          status: { in: [...LESSON_STATUSES_SCHEDULED] },
          startAt: { gte: windowStart, lte: windowEnd },
        },
        select: { startAt: true, durationMinutes: true },
      })
      for (const ex of byEnrollment) {
        if (
          !lessonIntervalsOverlap(lessonStart, duration, ex.startAt, ex.durationMinutes ?? 60)
        ) {
          continue
        }
        return {
          conflictMessage:
            'Este aluno já tem aula neste horário (intervalo sobreposto). Escolha outro horário que não coincida com a duração da aula existente.',
        }
      }

      const byTeacher = await prisma.lesson.findMany({
        where: {
          teacherId: teacherIdParam,
          status: { in: [...LESSON_STATUSES_SCHEDULED] },
          startAt: { gte: windowStart, lte: windowEnd },
        },
        select: { enrollmentId: true, startAt: true, durationMinutes: true },
      })
      for (const ex of byTeacher) {
        if (
          !lessonIntervalsOverlap(lessonStart, duration, ex.startAt, ex.durationMinutes ?? 60)
        ) {
          continue
        }
        if (ex.enrollmentId === enrollmentIdParam) continue
        return {
          conflictMessage: `A repetição de frequência não pode acontecer porque no dia ${formatDataHora(ex.startAt)} o professor já tem outra aula. Por favor, reagende para outro dia e horário, ou coloque uma frequência diferente. Nunca podemos sobrepor uma aula sobre a outra.`,
        }
      }

      return {}
    }

    // Se há repetição de frequência, usar lógica de frequência (não usar repeatWeeks)
    if (repeatFrequencyEnabled && repeatFrequencyWeeks > 0) {
      // Criar aulas para todas as semanas (incluindo a primeira)
      for (let w = 0; w < repeatFrequencyWeeks; w++) {
        // Aula inicial da semana
        const lessonStart = new Date(startAt)
        lessonStart.setDate(lessonStart.getDate() + w * 7)
        const overlapResult = await checkOverlap(lessonStart, enrollmentId, teacherId)
        if (overlapResult.conflictMessage) {
          return NextResponse.json(
            { ok: false, message: overlapResult.conflictMessage },
            { status: 400 }
          )
        }
        const lesson1 = await prisma.lesson.create({
          data: {
            enrollmentId,
            teacherId,
            status: validStatus,
            startAt: lessonStart,
            durationMinutes: duration,
            notes: notesTrim,
            createdById: auth.session?.sub || null,
            createdByName,
          },
          include: {
            enrollment: { select: { id: true, nome: true, email: true, frequenciaSemanal: true } },
            teacher: { select: { id: true, nome: true, email: true } },
          },
        })
        lessonsCreated.push(lesson1)
        
        // Aula da mesma semana (se configurada)
        if (repeatSameWeek && repeatSameWeekStartAt) {
          const sameWeekDate = new Date(repeatSameWeekStartAt)
          sameWeekDate.setDate(sameWeekDate.getDate() + w * 7)
          const overlapResult2 = await checkOverlap(sameWeekDate, enrollmentId, teacherId)
          if (overlapResult2.conflictMessage) {
            return NextResponse.json(
              { ok: false, message: overlapResult2.conflictMessage },
              { status: 400 }
            )
          }
          const lesson2 = await prisma.lesson.create({
            data: {
              enrollmentId,
              teacherId,
              status: validStatus,
              startAt: sameWeekDate,
              durationMinutes: duration,
              notes: notesTrim,
              createdById: auth.session?.sub || null,
              createdByName,
            },
            include: {
              enrollment: { select: { id: true, nome: true, email: true, frequenciaSemanal: true } },
              teacher: { select: { id: true, nome: true, email: true } },
            },
          })
          lessonsCreated.push(lesson2)
        }
      }
    } else {
      // Criar aulas com repetição simples (mesmo dia e hora nas próximas semanas)
      if (repeatWeeks > 1) {
        for (let w = 0; w < repeatWeeks; w++) {
          const lessonStart = new Date(startAt)
          lessonStart.setDate(lessonStart.getDate() + w * 7)
          const overlapResult = await checkOverlap(lessonStart, enrollmentId, teacherId)
          if (overlapResult.conflictMessage) {
            return NextResponse.json(
              { ok: false, message: overlapResult.conflictMessage },
              { status: 400 }
            )
          }
          const lesson = await prisma.lesson.create({
            data: {
              enrollmentId,
              teacherId,
              status: validStatus,
              startAt: lessonStart,
              durationMinutes: duration,
              notes: notesTrim,
              createdById: auth.session?.sub || null,
              createdByName,
            },
            include: {
              enrollment: { select: { id: true, nome: true, email: true, frequenciaSemanal: true } },
              teacher: { select: { id: true, nome: true, email: true } },
            },
          })
          lessonsCreated.push(lesson)
        }
      } else {
        // Criar apenas a aula inicial
        const overlapResult = await checkOverlap(firstStart, enrollmentId, teacherId)
        if (overlapResult.conflictMessage) {
          return NextResponse.json(
            { ok: false, message: overlapResult.conflictMessage },
            { status: 400 }
          )
        }
        const lesson = await prisma.lesson.create({
          data: {
            enrollmentId,
            teacherId,
            status: validStatus,
            startAt: firstStart,
            durationMinutes: duration,
            notes: notesTrim,
            createdById: auth.session?.sub || null,
            createdByName,
          },
          include: {
            enrollment: { select: { id: true, nome: true, email: true, frequenciaSemanal: true } },
            teacher: { select: { id: true, nome: true, email: true } },
          },
        })
        lessonsCreated.push(lesson)
      }
      
      // Se há repetição na mesma semana (sem frequência), criar essa aula também
      if (repeatSameWeek && repeatSameWeekStartAt) {
        const sameWeekDate = new Date(repeatSameWeekStartAt)
        const overlapResultSame = await checkOverlap(sameWeekDate, enrollmentId, teacherId)
        if (overlapResultSame.conflictMessage) {
          return NextResponse.json(
            { ok: false, message: overlapResultSame.conflictMessage },
            { status: 400 }
          )
        }
        const lessonSameWeek = await prisma.lesson.create({
          data: {
            enrollmentId,
            teacherId,
            status: validStatus,
            startAt: sameWeekDate,
            durationMinutes: duration,
            notes: notesTrim,
            createdById: auth.session?.sub || null,
            createdByName,
          },
          include: {
            enrollment: { select: { id: true, nome: true, email: true, frequenciaSemanal: true } },
            teacher: { select: { id: true, nome: true, email: true } },
          },
        })
        lessonsCreated.push(lessonSameWeek)
      }
    }

    if (lessonsCreated.length === 0) {
      return NextResponse.json(
        { ok: false, message: 'Nenhuma aula foi criada.' },
        { status: 400 }
      )
    }

    // Notificar o professor: tem um novo aluno (primeira aula com esse aluno) – aparece no Início
    if (isFirstLessonForTeacherAndEnrollment && prisma.teacherAlert && lessonsCreated.length > 0) {
      const firstLessonStartAt = lessonsCreated.reduce(
        (min, l) => (l.startAt < min ? l.startAt : min),
        lessonsCreated[0].startAt
      )
      const message = await buildNewStudentTeacherAlertMessage(prisma, {
        teacherId,
        enrollmentId,
        firstLessonStartAt,
      })

      try {
        await prisma.teacherAlert.create({
          data: {
            teacherId,
            enrollmentId,
            message,
            type: 'NEW_STUDENT',
            level: 'INFO',
            createdById: auth.session?.sub ?? null,
          },
        })
      } catch (e) {
        if (!isTeacherAlertEnrollmentIdColumnError(e)) throw e
        await prisma.teacherAlert.create({
          data: {
            teacherId,
            message,
            type: 'NEW_STUDENT',
            level: 'INFO',
            createdById: auth.session?.sub ?? null,
          },
        })
      }
    }

    // E-mail: aula(s) confirmada(s) para aluno e professor
    if (validStatus === 'CONFIRMED' && lessonsCreated.length > 0) {
      const first = lessonsCreated[0] as unknown as { enrollment: { nome: string; email: string | null }; teacher: { nome: string; email: string | null }; startAt: Date }
      const nomeAluno = first.enrollment.nome
      const nomeProfessor = first.teacher.nome
      const emailAluno = first.enrollment.email
      const emailProfessor = first.teacher.email
      const aulas = lessonsCreated.map((l) => ({ startAt: l.startAt }))
      try {
        if (emailAluno) {
          const { subject, text } = mensagemAulaConfirmada({
            nomeAluno,
            nomeProfessor,
            aulas,
            destinatario: 'aluno',
          })
          await sendEmail({ to: emailAluno, subject, text })
        }
        if (emailProfessor) {
          const { subject, text } = mensagemAulaConfirmada({
            nomeAluno,
            nomeProfessor,
            aulas,
            destinatario: 'professor',
          })
          await sendEmail({ to: emailProfessor, subject, text })
        }
      } catch (err) {
        console.error('[api/admin/lessons POST] Erro ao enviar e-mail:', err)
      }
    }

    // E-mail: reposição agendada (criar aula com status Reposição)
    if (validStatus === 'REPOSICAO' && lessonsCreated.length > 0) {
      const first = lessonsCreated[0] as unknown as { enrollment: { nome: string; email: string | null }; teacher: { nome: string; email: string | null }; startAt: Date }
      const nomeAluno = first.enrollment.nome
      const nomeProfessorReposicao = first.teacher.nome
      const emailAluno = first.enrollment.email
      const emailProfessorReposicao = first.teacher.email
      const dataReposicao = first.startAt
      
      // Se há informações sobre a aula cancelada, enviar email de cancelamento com reposição
      if (canceledLessonInfo?.startAt && canceledLessonInfo?.teacherId) {
        try {
          // Buscar informações do professor da aula cancelada
          const teacherCanceled = await prisma.teacher.findUnique({
            where: { id: canceledLessonInfo.teacherId },
            select: { nome: true },
          })
          const nomeProfessorCancelado = teacherCanceled?.nome || 'Professor'
          
          const dataCancelada = new Date(canceledLessonInfo.startAt)
          
          // Enviar para aluno
          if (emailAluno) {
            const { subject, text } = mensagemCancelamentoComReposicao({
              nomeAluno,
              nomeProfessor: nomeProfessorCancelado,
              nomeProfessorReposicao,
              dataCancelada,
              dataReposicao,
              destinatario: 'aluno',
            })
            await sendEmail({ to: emailAluno, subject, text })
          }
          
          // Enviar para professor da reposição
          if (emailProfessorReposicao) {
            const { subject, text } = mensagemCancelamentoComReposicao({
              nomeAluno,
              nomeProfessor: nomeProfessorCancelado,
              nomeProfessorReposicao,
              dataCancelada,
              dataReposicao,
              destinatario: 'professor',
            })
            await sendEmail({ to: emailProfessorReposicao, subject, text })
          }
          
          // Enviar também para o professor da aula cancelada (se for diferente)
          if (canceledLessonInfo.teacherId !== teacherId) {
            const teacherCanceledUser = await prisma.teacher.findUnique({
              where: { id: canceledLessonInfo.teacherId },
              select: { email: true },
            })
            const emailProfessorCancelado = teacherCanceledUser?.email
            if (emailProfessorCancelado) {
              const { subject, text } = mensagemCancelamentoComReposicao({
                nomeAluno,
                nomeProfessor: nomeProfessorCancelado,
                nomeProfessorReposicao,
                dataCancelada,
                dataReposicao,
                destinatario: 'professor',
              })
              await sendEmail({ to: emailProfessorCancelado, subject, text })
            }
          }
        } catch (err) {
          console.error('[api/admin/lessons POST] Erro ao enviar e-mail de cancelamento com reposição:', err)
        }
      } else {
        // Email padrão de reposição (sem informações de cancelamento)
        try {
          if (emailAluno) {
            const { subject, text } = mensagemReposicaoAgendada({
              nomeAluno,
              nomeProfessor: nomeProfessorReposicao,
              data: dataReposicao,
              destinatario: 'aluno',
            })
            await sendEmail({ to: emailAluno, subject, text })
          }
          if (emailProfessorReposicao) {
            const { subject, text } = mensagemReposicaoAgendada({
              nomeAluno,
              nomeProfessor: nomeProfessorReposicao,
              data: dataReposicao,
              destinatario: 'professor',
            })
            await sendEmail({ to: emailProfessorReposicao, subject, text })
          }
        } catch (err) {
          console.error('[api/admin/lessons POST] Erro ao enviar e-mail de reposição:', err)
        }
      }
    }

    return NextResponse.json({
      ok: true,
      data: { lesson: lessonsCreated[0], lessons: lessonsCreated, count: lessonsCreated.length },
    })
  } catch (error) {
    console.error('[api/admin/lessons POST]', error)
    return NextResponse.json(
      { ok: false, message: 'Erro ao criar aula' },
      { status: 500 }
    )
  }
}
