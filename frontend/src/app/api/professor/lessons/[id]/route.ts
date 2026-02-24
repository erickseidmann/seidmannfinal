/**
 * GET /api/professor/lessons/[id]
 * Detalhes de uma aula do professor logado + validação de horário para sala de vídeo
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireTeacher } from '@/lib/auth'

const TOLERANCE_MINUTES = 15

function deterministicRoomPin(lessonId: string, lessonStart: Date): string {
  const str = `seidmann-${lessonId}-${lessonStart.toISOString()}`
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i)
    hash = (hash << 5) - hash + char
    hash |= 0
  }
  return String((Math.abs(hash) % 900000) + 100000)
}

export async function GET(
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

    const lessonId = params.id

    const lesson = await prisma.lesson.findUnique({
      where: { id: lessonId },
      include: {
        enrollment: {
          select: {
            id: true,
            nome: true,
            idioma: true,
            nivel: true,
            tipoAula: true,
            nomeGrupo: true,
            tempoAulaMinutos: true,
          },
        },
        teacher: { select: { id: true, nome: true, linkSala: true } },
        record: {
          select: {
            id: true,
            book: true,
            lastPage: true,
            assignedHomework: true,
            homeworkDone: true,
            notes: true,
            notesForStudent: true,
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
        { ok: false, message: 'Você não tem permissão para acessar esta aula' },
        { status: 403 }
      )
    }

    const now = new Date()
    const lessonStart = new Date(lesson.startAt)
    const durationMin = lesson.durationMinutes ?? 60
    const lessonEnd = new Date(lessonStart.getTime() + durationMin * 60 * 1000)
    const windowStart = new Date(lessonStart.getTime() - TOLERANCE_MINUTES * 60 * 1000)
    const windowEnd = new Date(lessonEnd.getTime() + TOLERANCE_MINUTES * 60 * 1000)

    const canJoin =
      now >= windowStart &&
      now <= windowEnd &&
      lesson.status === 'CONFIRMED'

    let reason: string | null = null
    if (!canJoin) {
      if (lesson.status !== 'CONFIRMED') {
        reason = 'Aula não está confirmada'
      } else if (now < windowStart) {
        reason = 'A sala abre 15 minutos antes do início da aula'
      } else if (now > windowEnd) {
        reason = 'O tempo de acesso à sala expirou'
      }
    }

    const roomName = canJoin ? `seidmann-${lessonId}` : null
    const roomPin = canJoin ? deterministicRoomPin(lessonId, lessonStart) : null

    const lastRecord = await prisma.lessonRecord.findFirst({
      where: {
        lesson: {
          enrollmentId: lesson.enrollmentId,
          startAt: { lt: lesson.startAt },
        },
      },
      orderBy: { criadoEm: 'desc' },
      select: { book: true, lastPage: true, assignedHomework: true, homeworkDone: true },
    })

    // Para aula em grupo, buscar nomes dos integrantes
    let groupMemberNames: string[] | undefined
    const enr = lesson.enrollment
    if (enr?.tipoAula === 'GRUPO' && enr?.nomeGrupo?.trim()) {
      const enrollmentsInGroup = await prisma.enrollment.findMany({
        where: {
          tipoAula: 'GRUPO',
          nomeGrupo: enr.nomeGrupo.trim(),
        },
        select: { nome: true },
      })
      groupMemberNames = enrollmentsInGroup.map((e) => e.nome)
    }

    const enrollmentResponse = {
      ...enr,
      ...(groupMemberNames !== undefined && { groupMemberNames }),
    }

    return NextResponse.json({
      ok: true,
      data: {
        lesson: {
          id: lesson.id,
          status: lesson.status,
          startAt: lesson.startAt.toISOString(),
          durationMinutes: lesson.durationMinutes,
          notes: lesson.notes,
          enrollment: enrollmentResponse,
          teacher: lesson.teacher,
          record: lesson.record,
          lastRecord,
        },
        classroom: {
          canJoin,
          roomName,
          roomPin,
          windowStart: windowStart.toISOString(),
          windowEnd: windowEnd.toISOString(),
          reason,
        },
      },
    })
  } catch (error) {
    console.error('[api/professor/lessons/[id] GET]', error)
    return NextResponse.json(
      { ok: false, message: 'Erro ao buscar detalhes da aula' },
      { status: 500 }
    )
  }
}
