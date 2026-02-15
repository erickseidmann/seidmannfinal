/**
 * API: GET /api/admin/lesson-records (listar registros de aulas)
 *      POST /api/admin/lesson-records (criar registro - exige lessonId)
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/auth'
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
          console.error('[api/admin/lesson-records POST] Erro ao enviar e-mail para aluno:', err)
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
        console.error('[api/admin/lesson-records POST] Erro ao enviar e-mail para aluno:', err)
      }
    }
  }
}

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAdmin(request)
    if (!auth.authorized) {
      return NextResponse.json(
        { ok: false, message: auth.message || 'Não autorizado' },
        { status: auth.message?.includes('Não autenticado') ? 401 : 403 }
      )
    }

    const lessonRecord = (prisma as { lessonRecord?: { findMany: (args: unknown) => Promise<unknown[]> } }).lessonRecord
    if (!lessonRecord || typeof lessonRecord.findMany !== 'function') {
      return NextResponse.json(
        { ok: false, message: 'Modelo LessonRecord não disponível. Rode: npx prisma generate && npx prisma migrate dev' },
        { status: 503 }
      )
    }

    const records = await (prisma as any).lessonRecord.findMany({
      include: {
        studentPresences: {
          include: { enrollment: { select: { id: true, nome: true } } },
        },
        lesson: {
          include: {
            enrollment: { select: { id: true, nome: true, tipoAula: true, nomeGrupo: true } },
            teacher: { select: { id: true, nome: true } },
          },
        },
      },
      orderBy: { criadoEm: 'desc' },
    })

    return NextResponse.json({ ok: true, data: { records } })
  } catch (error) {
    console.error('[api/admin/lesson-records GET]', error)
    return NextResponse.json(
      { ok: false, message: 'Erro ao listar registros de aulas' },
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

    const lessonRecord = (prisma as { lessonRecord?: { findMany: (args: unknown) => Promise<unknown[]>; create: (args: unknown) => Promise<unknown>; findUnique: (args: unknown) => Promise<unknown> } }).lessonRecord
    if (!lessonRecord || typeof lessonRecord.create !== 'function') {
      return NextResponse.json(
        { ok: false, message: 'Modelo LessonRecord não disponível. Rode: npx prisma generate && npx prisma migrate dev' },
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
    const tempo = tempoAulaMinutos != null ? Number(tempoAulaMinutos) : (lesson as { durationMinutes?: number }).durationMinutes ?? null

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
    console.error('[api/admin/lesson-records POST]', error)
    return NextResponse.json(
      { ok: false, message: 'Erro ao criar registro de aula' },
      { status: 500 }
    )
  }
}
