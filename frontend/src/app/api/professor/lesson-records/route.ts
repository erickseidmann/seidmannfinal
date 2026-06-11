/**
 * POST /api/professor/lesson-records
 * Cria registro de aula apenas para aula do professor logado.
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireTeacher } from '@/lib/auth'
import { isLessonStartInTeacherPaidPeriod } from '@/lib/teacher-paid-period'
import { sendEmail, mensagemAulaRegistrada } from '@/lib/email'
import { toDateKeyInTZ } from '@/lib/datetime'
import { canRegisterLesson, LESSON_RECORD_BLOCKED_MESSAGE } from '@/lib/lesson-status'
import { assertTeacherCanCreateLessonRecord } from '@/lib/teacher-lesson-record-deadline'
import { assertLessonRecordBookProgression } from '@/lib/lesson-record-book-progression'
import { assertTeacherTeachesEnrollmentLevel } from '@/lib/enrollment-nivel-livro'
import { assertTeacherAttendedLessonForRecord } from '@/lib/lesson-attendance-summary'
import {
  assertLessonRecordDiffersFromPrevious,
  lessonRecordCompareFromApiBody,
} from '@/lib/lesson-record-diff-from-previous'
import { getPreviousLessonRecordCompareInput } from '@/lib/lesson-record-previous'

type RecordWithLessonAndPresences = {
  lesson: { startAt: Date; enrollment: { nome: string; email?: string | null }; teacher: { nome: string } }
  studentPresences: { enrollment: { nome: string; email?: string | null }; presence: string }[]
  status: string
  presence: string
  lessonType: string
  curso?: string | null
  tempoAulaMinutos?: number | null
  book: string | null
  lastPage: string | null
  assignedHomework: string | null
  homeworkDone: string | null
  notesForStudent: string | null
}

/** Envia e-mails de notificação (SMTP). Não deve ser aguardado na rota HTTP — usar em background. */
async function sendRecordEmails(record: RecordWithLessonAndPresences) {
  const nomeProfessor = record.lesson.teacher.nome
  const dataAula = record.lesson.startAt
  const common = {
    dataAula,
    nomeProfessor,
    status: record.status,
    lessonType: record.lessonType,
    curso: record.curso ?? null,
    tempoAulaMinutos: record.tempoAulaMinutos ?? null,
    book: record.book,
    lastPage: record.lastPage,
    assignedHomework: record.assignedHomework,
    homeworkDone: record.homeworkDone,
    notesForStudent: record.notesForStudent,
  }
  if (record.studentPresences?.length > 0) {
    for (const sp of record.studentPresences) {
      const email = (sp.enrollment as { email?: string | null }).email
      if (email) {
        try {
          const { subject, text } = mensagemAulaRegistrada({
            nomeAluno: sp.enrollment.nome,
            presence: sp.presence,
            ...common,
          })
          await sendEmail({ to: email, subject, text })
        } catch (err) {
          console.error('[api/professor/lesson-records POST] Erro ao enviar e-mail para aluno:', err)
        }
      }
    }
  } else {
    const enrollment = record.lesson.enrollment as { nome: string; email?: string | null }
    if (enrollment?.email) {
      try {
        const { subject, text } = mensagemAulaRegistrada({
          nomeAluno: enrollment.nome,
          presence: record.presence,
          ...common,
        })
        await sendEmail({ to: enrollment.email, subject, text })
      } catch (err) {
        console.error('[api/professor/lesson-records POST] Erro ao enviar e-mail para aluno:', err)
      }
    }
  }
}

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
      select: { id: true, nome: true, niveisEnsina: true },
    })
    if (!teacher) {
      return NextResponse.json(
        { ok: false, message: 'Professor não encontrado' },
        { status: 404 }
      )
    }

    type LessonRecordDelegate = { create: (args: unknown) => Promise<unknown> }
    const lessonRecord = (prisma as { lessonRecord?: LessonRecordDelegate }).lessonRecord
    if (!lessonRecord || typeof lessonRecord.create !== 'function') {
      return NextResponse.json(
        { ok: false, message: 'Modelo LessonRecord não disponível' },
        { status: 503 }
      )
    }

    const body = await request.json()
    const {
      lessonId,
      status,
      presence,
      studentsPresence,
      lessonType,
      curso,
      tempoAulaMinutos,
      book,
      lastPage,
      assignedHomework,
      homeworkDone,
      conversationDescription,
      notes,
      notesForStudent,
      notesForParents,
      gradeGrammar,
      gradeSpeaking,
      gradeListening,
      gradeUnderstanding,
      confirmBookAdvance,
    } = body

    if (!lessonId) {
      return NextResponse.json(
        { ok: false, message: 'lessonId é obrigatório' },
        { status: 400 }
      )
    }

    const lesson = await prisma.lesson.findUnique({
      where: { id: lessonId },
      include: {
        enrollment: {
          select: {
            id: true,
            nome: true,
            email: true,
            curso: true,
            tipoAula: true,
            nomeGrupo: true,
            status: true,
            pausedAt: true,
            activationDate: true,
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

    if (lesson.teacherId !== teacher.id) {
      return NextResponse.json(
        { ok: false, message: 'Esta aula não é sua. Só é possível registrar suas próprias aulas.' },
        { status: 403 }
      )
    }

    if (!canRegisterLesson(lesson.status)) {
      return NextResponse.json(
        { ok: false, message: LESSON_RECORD_BLOCKED_MESSAGE },
        { status: 400 }
      )
    }

    const attendanceCheck = await assertTeacherAttendedLessonForRecord(
      lesson.id,
      lesson.startAt,
      lesson.durationMinutes ?? 60,
      teacher.id
    )
    if (!attendanceCheck.ok) {
      return NextResponse.json({ ok: false, message: attendanceCheck.message }, { status: 400 })
    }

    // Período já pago: bloquear só se a aula cair DENTRO de um período marcado como pago,
    // e o período for definido explicitamente por datas (periodoInicio/periodoTermino).
    // Não usamos mais o fallback de "mês inteiro" — o fechamento é sempre por dias.
    const lessonStart = new Date(lesson.startAt)
    const paymentMonths = await prisma.teacherPaymentMonth.findMany({
      where: {
        teacherId: teacher.id,
        paymentStatus: 'PAGO',
        periodoInicio: { not: null },
        periodoTermino: { not: null },
      },
      select: { periodoInicio: true, periodoTermino: true },
    })
    const isInPaidPeriod = isLessonStartInTeacherPaidPeriod(lessonStart, paymentMonths)
    if (isInPaidPeriod) {
      return NextResponse.json(
        { ok: false, message: 'Período já pago. Não é possível adicionar registros de aulas deste período.' },
        { status: 403 }
      )
    }

    const approvedUnlock = await prisma.lessonRecordUnlockRequest.findFirst({
      where: { lessonId: lesson.id, teacherId: teacher.id, status: 'APPROVED' },
      orderBy: { criadoEm: 'desc' },
      select: { id: true },
    })

    const timingCheck = assertTeacherCanCreateLessonRecord(lessonStart, new Date(), {
      unlockApproved: Boolean(approvedUnlock),
    })
    if (!timingCheck.ok) {
      return NextResponse.json({ ok: false, message: timingCheck.message }, { status: 400 })
    }

    // Verificar se a aula está em feriado definido no calendário — não permitir registro
    // Usa timezone São Paulo para casar com a chave usada no calendário (YYYY-MM-DD).
    const dateKey = toDateKeyInTZ(lesson.startAt)
    const holiday = await prisma.holiday.findUnique({
      where: { dateKey },
    })
    if (holiday) {
      return NextResponse.json(
        {
          ok: false,
          message:
            'Não é possível registrar aula em dia marcado como feriado no calendário.',
        },
        { status: 400 }
      )
    }

    // Verificar se aluno está pausado - não permite registrar aulas durante o período pausado (entre pausedAt e activationDate)
    const enrollment = lesson.enrollment as { status: string; pausedAt: Date | null; activationDate: Date | null }
    if (enrollment.status === 'PAUSED' && enrollment.pausedAt) {
      const pausedAt = new Date(enrollment.pausedAt)
      pausedAt.setHours(0, 0, 0, 0)
      const lessonDate = new Date(lesson.startAt)
      lessonDate.setHours(0, 0, 0, 0)
      const activationDate = enrollment.activationDate ? new Date(enrollment.activationDate) : null
      if (activationDate) {
        activationDate.setHours(0, 0, 0, 0)
      }
      // Bloquear apenas se a aula está no período pausado (entre pausedAt e activationDate)
      if (lessonDate >= pausedAt && (!activationDate || lessonDate < activationDate)) {
        return NextResponse.json(
          { ok: false, message: 'Não é possível registrar aulas de alunos pausados durante o período de pausa.' },
          { status: 400 }
        )
      }
    }

    const existing = await (prisma as any).lessonRecord.findUnique({
      where: { lessonId },
    })
    if (existing) {
      return NextResponse.json(
        { ok: false, message: 'Já existe um registro para esta aula' },
        { status: 400 }
      )
    }

    const isGroup = lesson.enrollment?.tipoAula === 'GRUPO' && lesson.enrollment?.nomeGrupo?.trim()
    const validStatus = ['CONFIRMED', 'CANCELLED', 'REPOSICAO'].includes(status) ? status : 'CONFIRMED'
    const validPresence = ['PRESENTE', 'NAO_COMPARECEU', 'ATRASADO'].includes(presence) ? presence : 'PRESENTE'
    const validLessonType = ['NORMAL', 'CONVERSAÇÃO', 'REVISAO', 'AVALIACAO'].includes(lessonType) ? lessonType : 'NORMAL'
    const validHomeworkDone = ['SIM', 'NAO', 'PARCIAL', 'NAO_APLICA'].includes(homeworkDone) ? homeworkDone : null
    const validCurso = curso != null && ['INGLES', 'ESPANHOL', 'INGLES_E_ESPANHOL'].includes(curso) ? curso : (lesson.enrollment as { curso?: string })?.curso ?? null
    // Professor não pode alterar tempo de aula: sempre usar o cadastrado na aula
    const tempo = (lesson as { durationMinutes?: number }).durationMinutes ?? null

    const nivelCheck = await assertTeacherTeachesEnrollmentLevel(prisma, lesson.enrollmentId, teacher)
    if (!nivelCheck.ok) {
      return NextResponse.json({ ok: false, message: nivelCheck.message }, { status: 400 })
    }

    if (book?.trim()) {
      const bookCheck = await assertLessonRecordBookProgression(prisma, lesson.enrollmentId, book, {
        confirmBookAdvance: confirmBookAdvance === true,
      })
      if (!bookCheck.ok) {
        return NextResponse.json(
          { ok: false, message: bookCheck.message, code: bookCheck.code },
          { status: bookCheck.code === 'ADVANCE_NEEDS_CONFIRM' ? 409 : 400 }
        )
      }
    }

    const previousCompare = await getPreviousLessonRecordCompareInput(lesson.enrollmentId, lessonId)
    const incomingCompare = lessonRecordCompareFromApiBody({
      presence,
      lessonType,
      book,
      lastPage,
      assignedHomework,
      homeworkDone,
      conversationDescription,
      notes,
      notesForStudent,
      notesForParents,
      gradeGrammar,
      gradeSpeaking,
      gradeListening,
      gradeUnderstanding,
      studentsPresence: Array.isArray(studentsPresence) ? studentsPresence : null,
    })
    const diffCheck = assertLessonRecordDiffersFromPrevious(incomingCompare, previousCompare)
    if (!diffCheck.ok) {
      return NextResponse.json({ ok: false, message: diffCheck.message }, { status: 400 })
    }

    const record = await (prisma as any).lessonRecord.create({
      data: {
        lessonId,
        status: validStatus,
        presence: validPresence,
        lessonType: validLessonType,
        curso: validCurso,
        tempoAulaMinutos: tempo,
        book: book?.trim() || null,
        lastPage: lastPage?.trim() || null,
        assignedHomework: assignedHomework?.trim() || null,
        homeworkDone: validHomeworkDone,
        conversationDescription: conversationDescription?.trim() || null,
        notes: notes?.trim() || null,
        notesForStudent: notesForStudent?.trim() || null,
        notesForParents: notesForParents?.trim() || null,
        gradeGrammar: gradeGrammar != null ? Number(gradeGrammar) : null,
        gradeSpeaking: gradeSpeaking != null ? Number(gradeSpeaking) : null,
        gradeListening: gradeListening != null ? Number(gradeListening) : null,
        gradeUnderstanding: gradeUnderstanding != null ? Number(gradeUnderstanding) : null,
      },
      include: {
        studentPresences: { include: { enrollment: { select: { id: true, nome: true } } } },
        lesson: {
          include: {
            enrollment: { select: { id: true, nome: true, tipoAula: true, nomeGrupo: true } },
            teacher: { select: { id: true, nome: true } },
          },
        },
      },
    })

    if (isGroup) {
      const LessonRecordStudent = (prisma as any).lessonRecordStudent
      const nomeGrupo = (lesson.enrollment as { nomeGrupo?: string })?.nomeGrupo?.trim()
      if (LessonRecordStudent?.createMany && nomeGrupo) {
        let toCreate: { lessonRecordId: string; enrollmentId: string; presence: string }[] = []
        if (Array.isArray(studentsPresence) && studentsPresence.length > 0) {
          toCreate = studentsPresence
            .filter((s: { enrollmentId: string; presence: string }) => s.enrollmentId && ['PRESENTE', 'NAO_COMPARECEU', 'ATRASADO'].includes(s.presence))
            .map((s: { enrollmentId: string; presence: string }) => ({
              lessonRecordId: record.id,
              enrollmentId: s.enrollmentId,
              presence: s.presence,
            }))
        }
        if (toCreate.length === 0) {
          const groupMembers = await prisma.enrollment.findMany({
            where: { tipoAula: 'GRUPO', nomeGrupo },
            select: { id: true },
          })
          toCreate = groupMembers.map((e: { id: string }) => ({
            lessonRecordId: record.id,
            enrollmentId: e.id,
            presence: 'PRESENTE',
          }))
        }
        if (toCreate.length > 0) {
          await LessonRecordStudent.createMany({ data: toCreate })
        }
      }
      const updated = await (prisma as any).lessonRecord.findUnique({
        where: { id: record.id },
        include: {
          studentPresences: { include: { enrollment: { select: { id: true, nome: true, email: true } } } },
          lesson: {
            include: {
              enrollment: { select: { id: true, nome: true, tipoAula: true, nomeGrupo: true, email: true } },
              teacher: { select: { id: true, nome: true } },
            },
          },
        },
      })
      if (updated) {
        // E-mails em background: não bloquear a resposta (SMTP costuma ser o maior gargalo).
        void sendRecordEmails(updated as RecordWithLessonAndPresences).catch((err) =>
          console.error('[api/professor/lesson-records POST] Erro ao enviar e-mails (background):', err)
        )
        return NextResponse.json({ ok: true, data: { record: updated } })
      }
    } else {
      const teacherNome = (record as { lesson?: { teacher?: { nome: string } } }).lesson?.teacher?.nome ?? ''
      const enrollment = lesson.enrollment as { nome: string; email?: string | null }
      if (enrollment?.email) {
        const lessonForEmail = {
          startAt: lesson.startAt,
          enrollment,
          teacher: { nome: teacherNome },
        }
        void sendRecordEmails({
          ...(record as Record<string, unknown>),
          lesson: lessonForEmail,
          studentPresences: [],
        } as RecordWithLessonAndPresences).catch((err) =>
          console.error('[api/professor/lesson-records POST] Erro ao enviar e-mail (background):', err)
        )
      }
    }

    return NextResponse.json({ ok: true, data: { record } })
  } catch (error) {
    console.error('[api/professor/lesson-records POST]', error)
    return NextResponse.json(
      { ok: false, message: 'Erro ao criar registro de aula' },
      { status: 500 }
    )
  }
}
