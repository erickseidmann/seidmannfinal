/**
 * GET /api/admin/teachers/[id]/alunos
 * Lista alunos (enrollments) do professor com dias e horários das aulas.
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/auth'

const DIAS_SEMANA = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']

function formatTime(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAdmin(_request)
    if (!auth.authorized) {
      return NextResponse.json(
        { ok: false, message: auth.message || 'Não autorizado' },
        { status: auth.message?.includes('Não autenticado') ? 401 : 403 }
      )
    }
    const { id: teacherId } = await params
    const teacher = await prisma.teacher.findUnique({
      where: { id: teacherId },
      select: { id: true, nome: true },
    })
    if (!teacher) {
      return NextResponse.json(
        { ok: false, message: 'Professor não encontrado' },
        { status: 404 }
      )
    }

    // Data de hoje (início do dia) para filtrar apenas aulas futuras
    const hoje = new Date()
    hoje.setHours(0, 0, 0, 0)

    const lessons = await prisma.lesson.findMany({
      where: {
        teacherId,
        startAt: { gte: hoje }, // Apenas aulas do dia atual em diante
      },
      select: {
        id: true,
        startAt: true,
        durationMinutes: true,
        status: true,
        enrollmentId: true,
        enrollment: {
          select: {
            id: true,
            nome: true,
            tipoAula: true,
            nomeGrupo: true,
          },
        },
      },
      orderBy: { startAt: 'asc' },
    })

    const byEnrollment = new Map<
      string,
      {
        enrollmentId: string
        nome: string
        tipoAula: string | null
        nomeGrupo: string | null
        lessons: { dayOfWeek: number; dayName: string; startAt: string; time: string; durationMinutes: number; status: string }[]
      }
    >()

    for (const l of lessons) {
      const enr = l.enrollment
      const key = enr.id
      if (!byEnrollment.has(key)) {
        const label =
          enr.tipoAula === 'GRUPO' && enr.nomeGrupo?.trim()
            ? enr.nomeGrupo.trim()
            : enr.nome
        byEnrollment.set(key, {
          enrollmentId: enr.id,
          nome: label,
          tipoAula: enr.tipoAula,
          nomeGrupo: enr.nomeGrupo,
          lessons: [],
        })
      }
      const start = new Date(l.startAt)
      const dayOfWeek = start.getDay()
      const startMinutes = start.getHours() * 60 + start.getMinutes()
      const time = formatTime(startMinutes)
      byEnrollment.get(key)!.lessons.push({
        dayOfWeek,
        dayName: DIAS_SEMANA[dayOfWeek],
        startAt: start.toISOString(),
        time,
        durationMinutes: l.durationMinutes,
        status: l.status,
      })
    }

    // Filtrar apenas alunos que têm pelo menos uma aula futura
    const alunos = Array.from(byEnrollment.values())
      .filter((a) => a.lessons.length > 0) // Apenas alunos com aulas futuras
      .map((a) => ({
        ...a,
        diasHorarios: a.lessons
          .map((x) => `${x.dayName} ${x.time}`)
          .filter((v, i, arr) => arr.indexOf(v) === i)
          .join(', '),
      }))

    return NextResponse.json({
      ok: true,
      data: {
        teacher: { id: teacher.id, nome: teacher.nome },
        alunos,
      },
    })
  } catch (error) {
    console.error('[api/admin/teachers/[id]/alunos GET]', error)
    return NextResponse.json(
      { ok: false, message: 'Erro ao listar alunos do professor' },
      { status: 500 }
    )
  }
}
