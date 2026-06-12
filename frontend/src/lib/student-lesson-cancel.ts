import { prisma } from '@/lib/prisma'
import { isLessonCancelledFamily } from '@/lib/lesson-status'
import {
  createNoShowLessonRecordIfMissing,
  getCancelamentoAntecedenciaHoras,
  resolveLessonCancelamentoTardio,
} from '@/lib/lesson-no-show-record'
import { sendEmail, mensagemAulaCancelada, mensagemAulaCanceladaSemReposicao } from '@/lib/email'

function formatarDataHora(d: Date): string {
  return d.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function adicionarObservacaoCancelamento(
  notesAtuais: string | null,
  dataHora: Date
): string {
  const novaObs = `Aula foi cancelada pelo aluno às ${formatarDataHora(dataHora)}`
  if (notesAtuais?.trim()) return `${notesAtuais}\n${novaObs}`
  return novaObs
}

type CancelOk = {
  ok: true
  cancelamentoTardio: boolean
  message: string
  horasAntecedencia: number
}

type CancelFail = {
  ok: false
  message: string
  status: 400 | 403 | 404
}

export async function cancelStudentLessonByStudent(
  lessonId: string,
  sessionUserId: string
): Promise<CancelOk | CancelFail> {
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
          escolaMatricula: true,
          cancelamentoAntecedenciaHoras: true,
        },
      },
      teacher: { select: { id: true, nome: true, email: true } },
    },
  })

  if (!lesson) {
    return { ok: false, message: 'Aula não encontrada', status: 404 }
  }

  const enrollmentUserId = lesson.enrollment.userId
  if (!enrollmentUserId) {
    const studentEnrollments = await prisma.enrollment.findMany({
      where: { userId: sessionUserId },
      select: { id: true },
    })
    if (!studentEnrollments.some((e) => e.id === lesson.enrollmentId)) {
      return { ok: false, message: 'Você não tem permissão para cancelar esta aula', status: 403 }
    }
  } else if (enrollmentUserId !== sessionUserId) {
    return { ok: false, message: 'Você não tem permissão para cancelar esta aula', status: 403 }
  }

  if (isLessonCancelledFamily(lesson.status)) {
    return { ok: false, message: 'Esta aula já está cancelada', status: 400 }
  }

  if (lesson.enrollment.tipoAula === 'GRUPO') {
    return {
      ok: false,
      message:
        'Aulas em grupo não podem ser canceladas pelo portal do aluno. Entre em contato com a gestão.',
      status: 403,
    }
  }

  const agora = new Date()
  const cancelamentoTardio = await resolveLessonCancelamentoTardio(
    { startAt: lesson.startAt, enrollmentId: lesson.enrollmentId },
    agora
  )
  const horasAntecedencia = getCancelamentoAntecedenciaHoras(
    lesson.enrollment.escolaMatricula,
    lesson.enrollment.cancelamentoAntecedenciaHoras
  )
  const novoStatus = cancelamentoTardio ? 'CANCELLED_NO_REPLACEMENT' : 'CANCELLED'

  await prisma.lesson.update({
    where: { id: lessonId },
    data: {
      status: novoStatus,
      notes: adicionarObservacaoCancelamento(lesson.notes, agora),
    },
  })

  if (cancelamentoTardio) {
    try {
      await createNoShowLessonRecordIfMissing(lessonId)
    } catch (recordErr) {
      console.error('[student-lesson-cancel] Erro ao criar registro de falta:', recordErr)
    }
  }

  const nomeAluno = lesson.enrollment.nome
  const nomeProfessor = lesson.teacher?.nome ?? 'Professor'
  const emailAluno = lesson.enrollment.email
  const emailProfessor = lesson.teacher?.email

  try {
    if (emailAluno) {
      const { subject, text } = cancelamentoTardio
        ? mensagemAulaCanceladaSemReposicao({
            nomeAluno,
            data: lesson.startAt,
            horasAntecedencia,
          })
        : mensagemAulaCancelada({
            nomeAluno,
            nomeProfessor,
            data: lesson.startAt,
            destinatario: 'aluno',
          })
      await sendEmail({ to: emailAluno, subject, text })
    }
    if (emailProfessor) {
      const { subject, text } = mensagemAulaCancelada({
        nomeAluno,
        nomeProfessor,
        data: lesson.startAt,
        destinatario: 'professor',
      })
      await sendEmail({ to: emailProfessor, subject, text })
    }
  } catch (emailErr) {
    console.error('[student-lesson-cancel] Erro ao enviar e-mail:', emailErr)
  }

  return {
    ok: true,
    cancelamentoTardio,
    horasAntecedencia,
    message: cancelamentoTardio
      ? 'Aula cancelada sem reposição (cancelamento com pouca antecedência). O professor receberá por esta aula.'
      : 'Aula cancelada com sucesso.',
  }
}
