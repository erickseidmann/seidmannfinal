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

    const lessons = await prisma.lesson.findMany({
      where: {
        startAt: { gte: startAt, lte: endAt },
      },
      include: {
        enrollment: { select: { id: true, nome: true, frequenciaSemanal: true } },
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

    const startAt = new Date(startAtStr)
    if (Number.isNaN(startAt.getTime())) {
      return NextResponse.json(
        { ok: false, message: 'Data/hora inválida' },
        { status: 400 }
      )
    }

    const validStatus = ['CONFIRMED', 'CANCELLED', 'REPOSICAO'].includes(status)
      ? status
      : 'CONFIRMED'
    const duration = Number(durationMinutes) || 60
    const notesTrim = notes?.trim() || null

    const repeatWeeks = Math.min(52, Math.max(1, Number(repeatWeeksParam) || 1))

    const lessonsCreated: Awaited<ReturnType<typeof prisma.lesson.create>>[] = []
    for (let w = 0; w < repeatWeeks; w++) {
      const lessonStart = new Date(startAt)
      lessonStart.setDate(lessonStart.getDate() + w * 7)
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
