/**
 * GET /api/admin/enrollments/stats
 * Retorna estatísticas de alunos: por escola, por status, sem professor na semana.
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/auth'
import { LESSON_STATUSES_SCHEDULED } from '@/lib/lesson-status'

function getMonday(d: Date): Date {
  const date = new Date(d)
  const day = date.getDay()
  const diff = day === 0 ? -6 : 1 - day
  date.setDate(date.getDate() + diff)
  date.setHours(0, 0, 0, 0)
  return date
}

function getSaturdayEnd(monday: Date): Date {
  const sat = new Date(monday)
  sat.setDate(sat.getDate() + 5)
  sat.setHours(23, 59, 59, 999)
  return sat
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

    const { searchParams } = new URL(request.url)
    const weekStartParam = searchParams.get('weekStart') // Opcional: segunda-feira ISO para professor da semana

    const monday = weekStartParam ? new Date(weekStartParam) : getMonday(new Date())
    const saturdayEnd = getSaturdayEnd(monday)

    // Verificar e atualizar automaticamente alunos pausados cuja data de ativação chegou
    const hoje = new Date()
    hoje.setHours(0, 0, 0, 0)
    await prisma.enrollment.updateMany({
      where: {
        status: 'PAUSED',
        activationDate: { lte: hoje },
      },
      data: {
        status: 'ACTIVE',
        pausedAt: null,
        activationDate: null,
      },
    })

    // Contagens por escola de matrícula
    const [seidmannCount, youbecomeCount, highwayCount, outrosCount] = await Promise.all([
      prisma.enrollment.count({ where: { escolaMatricula: 'SEIDMANN' } }),
      prisma.enrollment.count({ where: { escolaMatricula: 'YOUBECOME' } }),
      prisma.enrollment.count({ where: { escolaMatricula: 'HIGHWAY' } }),
      prisma.enrollment.count({
        where: {
          OR: [{ escolaMatricula: 'OUTRO' }, { escolaMatricula: null }],
        },
      }),
    ])

    // Contagens por status
    const [ativosCount, inativosCount, pausadosCount, bolsistasCount] = await Promise.all([
      prisma.enrollment.count({ where: { status: 'ACTIVE' } }),
      prisma.enrollment.count({ where: { status: 'INACTIVE' } }),
      prisma.enrollment.count({ where: { status: 'PAUSED' } }),
      prisma.enrollment.count({ where: { bolsista: true } }),
    ])

    // Alunos "sem professor (semana)" = apenas ATIVOS que NÃO têm nenhuma aula esta semana COM professor
    // Inclui lógica de grupo: se alguém do grupo tem professor, todos do grupo contam como "com professor"
    const allLessonsThisWeek = await prisma.lesson.findMany({
      where: {
        startAt: { gte: monday, lte: saturdayEnd },
        enrollment: { status: 'ACTIVE' },
      },
      select: { enrollmentId: true, teacherId: true },
    })
    const enrollmentIdsWithTeacher = new Set(
      allLessonsThisWeek.filter((l) => l.teacherId !== null).map((l) => l.enrollmentId)
    )
    const activeEnrollments = await prisma.enrollment.findMany({
      where: { status: 'ACTIVE' },
      select: { id: true, tipoAula: true, nomeGrupo: true },
    })
    // Replicar "com professor" para todos do mesmo grupo (igual à tabela)
    const groupByNomeGrupo: Record<string, string[]> = {}
    for (const e of activeEnrollments) {
      const nomeGrupo = (e as { nomeGrupo?: string | null }).nomeGrupo?.trim()
      if ((e as { tipoAula?: string | null }).tipoAula === 'GRUPO' && nomeGrupo) {
        if (!groupByNomeGrupo[nomeGrupo]) groupByNomeGrupo[nomeGrupo] = []
        groupByNomeGrupo[nomeGrupo].push(e.id)
      }
    }
    for (const ids of Object.values(groupByNomeGrupo)) {
      const hasTeacher = ids.some((id) => enrollmentIdsWithTeacher.has(id))
      if (hasTeacher) {
        ids.forEach((id) => enrollmentIdsWithTeacher.add(id))
      }
    }
    const semProfessorCount = activeEnrollments.filter((e) => !enrollmentIdsWithTeacher.has(e.id)).length

    // Alunos sem professor NA PRÓXIMA SEMANA (apenas ativos)
    const nextMonday = new Date(monday)
    nextMonday.setDate(nextMonday.getDate() + 7)
    const nextSaturdayEnd = getSaturdayEnd(nextMonday)
    const allLessonsNextWeek = await prisma.lesson.findMany({
      where: {
        startAt: { gte: nextMonday, lte: nextSaturdayEnd },
        enrollment: { status: 'ACTIVE' },
      },
      select: { enrollmentId: true, teacherId: true },
    })
    const enrollmentIdsWithTeacherNextWeek = new Set(
      allLessonsNextWeek.filter((l) => l.teacherId !== null).map((l) => l.enrollmentId)
    )
    for (const ids of Object.values(groupByNomeGrupo)) {
      const hasTeacher = ids.some((id) => enrollmentIdsWithTeacherNextWeek.has(id))
      if (hasTeacher) {
        ids.forEach((id) => enrollmentIdsWithTeacherNextWeek.add(id))
      }
    }
    const semProfessorProximaSemanaCount = activeEnrollments.filter(
      (e) => !enrollmentIdsWithTeacherNextWeek.has(e.id)
    ).length

    // Alunos com repetição no fim: última aula (max startAt) entre agora e agora+7 dias
    const agora = new Date()
    const limiteRepeticao = new Date(agora)
    limiteRepeticao.setDate(limiteRepeticao.getDate() + 7)
    limiteRepeticao.setHours(23, 59, 59, 999)
    const lessonsEndingSoon = await prisma.lesson.findMany({
      where: {
        status: { in: [...LESSON_STATUSES_SCHEDULED] },
        startAt: { gte: agora, lte: limiteRepeticao },
        enrollment: { status: 'ACTIVE' },
      },
      select: { enrollmentId: true },
    })
    const enrollmentIdsWithLessonsEndingSoon = [...new Set(lessonsEndingSoon.map((l) => l.enrollmentId))]
    let repetitionEndingSoonCount = 0
    for (const eid of enrollmentIdsWithLessonsEndingSoon) {
      const last = await prisma.lesson.findFirst({
        where: { enrollmentId: eid, status: { in: [...LESSON_STATUSES_SCHEDULED] } },
        orderBy: { startAt: 'desc' },
        select: { startAt: true },
      })
      if (last) {
        const d = new Date(last.startAt)
        if (d >= agora && d <= limiteRepeticao) repetitionEndingSoonCount++
      }
    }

    return NextResponse.json({
      ok: true,
      data: {
        porEscola: {
          seidmann: seidmannCount,
          youbecome: youbecomeCount,
          highway: highwayCount,
          outros: outrosCount,
        },
        porStatus: {
          ativos: ativosCount,
          inativos: inativosCount,
          pausados: pausadosCount,
        },
        semProfessor: semProfessorCount,
        semProfessorProximaSemana: semProfessorProximaSemanaCount,
        repetitionEndingSoon: repetitionEndingSoonCount,
        bolsistas: bolsistasCount,
      },
    })
  } catch (error) {
    console.error('[api/admin/enrollments/stats GET]', error)
    return NextResponse.json(
      { ok: false, message: 'Erro ao carregar estatísticas' },
      { status: 500 }
    )
  }
}
