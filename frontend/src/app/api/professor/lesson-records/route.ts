/**
 * POST /api/professor/lesson-records
 * Cria registro de aula apenas para aula do professor logado.
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireTeacher } from '@/lib/auth'
import { sendEmail, mensagemAulaRegistrada } from '@/lib/email'

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
      select: { id: true },
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
    } = body

    if (!lessonId) {
      return NextResponse.json(
        { ok: false, message: 'lessonId é obrigatório' },
        { status: 400 }
      )
    }

    const lesson = await prisma.lesson.findUnique({
      where: { id: lessonId },
      include: { enrollment: { select: { id: true, nome: true, tipoAula: true, nomeGrupo: true, status: true, pausedAt: true, activationDate: true } } },
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

    // Só permitir registro no dia atual (São Paulo) e a partir do horário de início da aula
    const BRAZIL_TZ = 'America/Sao_Paulo'
    const getPartsInTZ = (date: Date) => {
      const formatter = new Intl.DateTimeFormat('en-CA', {
        timeZone: BRAZIL_TZ,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
      })
      const parts = formatter.formatToParts(date)
      const get = (type: string) => parseInt(parts.find((p) => p.type === type)?.value ?? '0', 10)
      return {
        year: get('year'),
        month: get('month'),
        day: get('day'),
        hour: get('hour'),
        minute: get('minute'),
        second: get('second'),
      }
    }
    const now = new Date()
    const nowParts = getPartsInTZ(now)
    const lessonStart = new Date(lesson.startAt)
    const lessonParts = getPartsInTZ(lessonStart)
    const lessonDateKey = `${lessonParts.year}-${String(lessonParts.month).padStart(2, '0')}-${String(lessonParts.day).padStart(2, '0')}`
    const nowDateKey = `${nowParts.year}-${String(nowParts.month).padStart(2, '0')}-${String(nowParts.day).padStart(2, '0')}`
    const lessonMinutes = lessonParts.hour * 60 + lessonParts.minute
    const nowMinutes = nowParts.hour * 60 + nowParts.minute
    if (lessonDateKey > nowDateKey) {
      return NextResponse.json(
        { ok: false, message: 'Não é possível realizar o registro de aulas futuras.' },
        { status: 400 }
      )
    }
    // No mesmo dia: só permitir a partir de 1 minuto após o horário de início (ex.: aula 17:00 → registrar a partir de 17:01)
    if (lessonDateKey === nowDateKey && nowMinutes <= lessonMinutes) {
      return NextResponse.json(
        { ok: false, message: 'Não é possível realizar o registro de aulas futuras.' },
        { status: 400 }
      )
    }

    // Verificar se a aula está em feriado nacional — não permitir registro
    const lessonDate = new Date(lesson.startAt)
    const dateKey = `${lessonDate.getFullYear()}-${String(lessonDate.getMonth() + 1).padStart(2, '0')}-${String(lessonDate.getDate()).padStart(2, '0')}`
    const holiday = await prisma.holiday.findUnique({
      where: { dateKey },
    })
    if (holiday) {
      return NextResponse.json(
        { ok: false, message: 'Não trabalhamos nos feriados nacionais' },
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
        await sendRecordEmails(updated as RecordWithLessonAndPresences)
        return NextResponse.json({ ok: true, data: { record: updated } })
      }
    } else {
      const lessonWithEmail = await prisma.lesson.findUnique({
        where: { id: record.lessonId },
        include: {
          enrollment: { select: { id: true, nome: true, email: true } },
          teacher: { select: { id: true, nome: true } },
        },
      })
      if (lessonWithEmail?.enrollment?.email) {
        await sendRecordEmails({
          ...record,
          lesson: lessonWithEmail,
          studentPresences: [],
        } as RecordWithLessonAndPresences)
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
