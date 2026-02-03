/**
 * API: GET /api/admin/lessons (listar por período)
 *      POST /api/admin/lessons (criar aula)
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/auth'
import { sendEmail, mensagemAulaConfirmada, mensagemReposicaoAgendada } from '@/lib/email'

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

    const where: { startAt: { gte: Date; lte: Date }; teacherId?: string } = {
      startAt: { gte: startAt, lte: endAt },
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
            frequenciaSemanal: true,
            tipoAula: true,
            nomeGrupo: true,
            curso: true,
            status: true,
            pausedAt: true,
            activationDate: true,
          },
        },
        teacher: { select: { id: true, nome: true } },
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
      durationMinutes = 60,
      notes,
      repeatWeeks: repeatWeeksParam,
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
      if (curso === 'INGLES_E_ESPANHOL' && (!ensina.includes('INGLES') || !ensina.includes('ESPANHOL'))) {
        return NextResponse.json(
          { ok: false, message: 'Isso não pode ser feito porque o professor não ensina esse idioma.' },
          { status: 400 }
        )
      }
    }


    const validStatus = ['CONFIRMED', 'CANCELLED', 'REPOSICAO'].includes(status)
      ? status
      : 'CONFIRMED'
    const duration = Number(durationMinutes) || 60
    const notesTrim = notes?.trim() || null

    const repeatWeeks = Math.min(52, Math.max(1, Number(repeatWeeksParam) || 1))

    function toDateKey(d: Date): string {
      const y = d.getFullYear()
      const m = String(d.getMonth() + 1).padStart(2, '0')
      const day = String(d.getDate()).padStart(2, '0')
      return `${y}-${m}-${day}`
    }

    const firstStart = new Date(startAt)
    const lastStart = new Date(startAt)
    lastStart.setDate(lastStart.getDate() + (repeatWeeks - 1) * 7)
    const startKey = toDateKey(firstStart)
    const endKey = toDateKey(lastStart)

    const holidayRows = await prisma.holiday.findMany({
      where: { dateKey: { gte: startKey, lte: endKey } },
      select: { dateKey: true },
    })
    const holidaySet = new Set(holidayRows.map((h) => h.dateKey))

    const existingLessonCount = await prisma.lesson.count({
      where: { teacherId, enrollmentId },
    })
    const isFirstLessonForTeacherAndEnrollment = existingLessonCount === 0

    const lessonsCreated: Awaited<ReturnType<typeof prisma.lesson.create>>[] = []
    for (let w = 0; w < repeatWeeks; w++) {
      const lessonStart = new Date(startAt)
      lessonStart.setDate(lessonStart.getDate() + w * 7)
      const dateKey = toDateKey(lessonStart)
      if (holidaySet.has(dateKey)) continue
      const lesson = await prisma.lesson.create({
        data: {
          enrollmentId,
          teacherId,
          status: validStatus,
          startAt: lessonStart,
          durationMinutes: duration,
          notes: notesTrim,
        },
        include: {
          enrollment: { select: { id: true, nome: true, email: true, frequenciaSemanal: true } },
          teacher: { select: { id: true, nome: true, email: true } },
        },
      })
      lessonsCreated.push(lesson)
    }

    if (lessonsCreated.length === 0) {
      return NextResponse.json(
        { ok: false, message: 'Não é possível adicionar aula em dia de feriado. Remova o feriado ou escolha outra data.' },
        { status: 400 }
      )
    }

    // Notificar o professor: tem um novo aluno (primeira aula com esse aluno) – aparece no Início
    if (isFirstLessonForTeacherAndEnrollment && prisma.teacherAlert && lessonsCreated.length > 0) {
      const first = lessonsCreated[0]
      const nomeAluno = (first.enrollment as { nome?: string })?.nome ?? 'Aluno'
      await prisma.teacherAlert.create({
        data: {
          teacherId,
          message: `Tem um novo aluno: ${nomeAluno}.`,
          type: 'NEW_STUDENT',
          level: 'INFO',
          createdById: auth.session?.sub ?? null,
        },
      })
    }

    // E-mail: aula(s) confirmada(s) para aluno e professor
    if (validStatus === 'CONFIRMED' && lessonsCreated.length > 0) {
      const first = lessonsCreated[0]
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
      const first = lessonsCreated[0]
      const nomeAluno = first.enrollment.nome
      const nomeProfessor = first.teacher.nome
      const emailAluno = first.enrollment.email
      const emailProfessor = first.teacher.email
      const dataAula = first.startAt
      try {
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
      } catch (err) {
        console.error('[api/admin/lessons POST] Erro ao enviar e-mail de reposição:', err)
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
