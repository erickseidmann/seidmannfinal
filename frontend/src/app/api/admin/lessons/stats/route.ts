/**
 * API: GET /api/admin/lessons/stats?weekStart=ISO
 * Estatísticas da semana (segunda a sábado): confirmadas, canceladas, reposições, alunos com frequência incorreta.
 * weekStart = data da segunda-feira (00:00:00).
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/auth'

function getMonday(d: Date): Date {
  const date = new Date(d)
  const day = date.getDay() // 0=dom, 1=seg, ...
  const diff = day === 0 ? -6 : 1 - day // segunda = 1
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

    if (!prisma.lesson) {
      return NextResponse.json(
        { ok: false, message: 'Modelo Lesson não disponível. Rode: npx prisma generate && npx prisma migrate dev' },
        { status: 503 }
      )
    }

    const { searchParams } = new URL(request.url)
    const weekStartParam = searchParams.get('weekStart')
    const monday = weekStartParam
      ? getMonday(new Date(weekStartParam))
      : getMonday(new Date())
    const saturdayEnd = getSaturdayEnd(monday)

    const lessons = await prisma.lesson.findMany({
      where: {
        startAt: { gte: monday, lte: saturdayEnd },
      },
      include: {
        enrollment: {
          select: {
            id: true,
            nome: true,
            frequenciaSemanal: true,
            tempoAulaMinutos: true,
            tipoAula: true,
            nomeGrupo: true,
          },
        },
        teacher: { select: { id: true, nome: true, status: true } },
      },
      orderBy: { startAt: 'asc' },
    })

    const confirmedList: { id: string; studentName: string; teacherName: string; startAt: string }[] = []
    const cancelledList: { id: string; studentName: string; teacherName: string; startAt: string }[] = []
    const reposicaoList: { id: string; studentName: string; teacherName: string; startAt: string }[] = []

    for (const l of lessons) {
      const item = {
        id: l.id,
        studentName: l.enrollment.nome,
        teacherName: l.teacher.nome,
        startAt: l.startAt.toISOString(),
      }
      if (l.status === 'CONFIRMED') confirmedList.push(item)
      else if (l.status === 'CANCELLED') cancelledList.push(item)
      else if (l.status === 'REPOSICAO') reposicaoList.push(item)
    }

    // Frequência: sempre relativo à semana exibida (seg–sáb).
    // Grupos: cada slot de aula conta como UMA pessoa (não soma tempo dos integrantes). Um grupo com 2 alunos de 30min = 1 slot de 30min.
    // Particular: como antes (conta aulas e minutos por enrollment).
    const countByEnrollment: Record<string, number> = {}
    const minutesByEnrollment: Record<string, number> = {}

    // Agrupar enrollments por nomeGrupo (só GRUPO) para contar cada slot uma vez por grupo
    const groupSlotsByKey: Record<string, { byStartAt: Map<string, number> }> = {}
    const enrollmentToGroupKey: Record<string, string> = {}

    for (const l of lessons) {
      if (l.status === 'CANCELLED') continue
      const eid = l.enrollmentId
      const enr = l.enrollment as { tipoAula?: string | null; nomeGrupo?: string | null }
      const isGroup = enr?.tipoAula === 'GRUPO' && enr?.nomeGrupo?.trim()
      const groupKey = isGroup ? String(enr.nomeGrupo).trim() : null

      if (groupKey) {
        if (!groupSlotsByKey[groupKey]) groupSlotsByKey[groupKey] = { byStartAt: new Map() }
        const slotKey = new Date(l.startAt).getTime().toString()
        if (!groupSlotsByKey[groupKey].byStartAt.has(slotKey)) {
          groupSlotsByKey[groupKey].byStartAt.set(slotKey, l.durationMinutes ?? 60)
        }
        enrollmentToGroupKey[eid] = groupKey
      } else {
        countByEnrollment[eid] = (countByEnrollment[eid] || 0) + 1
        const mins = l.durationMinutes ?? 60
        minutesByEnrollment[eid] = (minutesByEnrollment[eid] || 0) + mins
      }
    }

    // Para cada grupo: total de slots e minutos (cada slot contado uma vez)
    const groupCount: Record<string, number> = {}
    const groupMinutes: Record<string, number> = {}
    for (const [key, data] of Object.entries(groupSlotsByKey)) {
      groupCount[key] = data.byStartAt.size
      groupMinutes[key] = [...data.byStartAt.values()].reduce((a, b) => a + b, 0)
    }

    const TOLERANCE_MINUTES = 5

    const wrongFrequencyList: {
      enrollmentId: string
      studentName: string
      expected: number
      actual: number
      expectedMinutes?: number
      actualMinutes?: number
    }[] = []

    // Buscar todos os alunos em situação ativa com frequência semanal definida (e tempoAulaMinutos quando houver).
    const activeEnrollments = await prisma.enrollment.findMany({
      where: {
        status: { in: ['ACTIVE', 'REGISTERED', 'CONTRACT_ACCEPTED', 'PAYMENT_PENDING'] },
        frequenciaSemanal: { not: null },
      },
      select: {
        id: true,
        nome: true,
        frequenciaSemanal: true,
        tempoAulaMinutos: true,
        tipoAula: true,
        nomeGrupo: true,
      },
    })

    // Para grupos: uma entrada por grupo (evitar duplicata). Usar primeiro enrollment do grupo como representante.
    const groupKeysAdded = new Set<string>()

    for (const e of activeEnrollments) {
      const freq = e.frequenciaSemanal ?? 0
      if (freq <= 0) continue

      const isGroup = (e as { tipoAula?: string | null; nomeGrupo?: string | null }).tipoAula === 'GRUPO'
      const nomeGrupo = (e as { nomeGrupo?: string | null }).nomeGrupo?.trim()
      const groupKey = isGroup && nomeGrupo ? nomeGrupo : null

      let actualCount: number
      let actualMinutes: number

      if (groupKey) {
        actualCount = groupCount[groupKey] ?? 0
        actualMinutes = groupMinutes[groupKey] ?? 0
        if (groupKeysAdded.has(groupKey)) continue
        groupKeysAdded.add(groupKey)
        const members = activeEnrollments
          .filter((x) => (x as { tipoAula?: string; nomeGrupo?: string }).tipoAula === 'GRUPO' && (x as { nomeGrupo?: string }).nomeGrupo?.trim() === groupKey)
          .map((x) => x.nome)
        const studentName = `${groupKey} (${members.join(', ')})`
        const tempoAula = e.tempoAulaMinutos ?? null
        if (tempoAula != null && tempoAula > 0) {
          const expectedMinutes = freq * tempoAula
          if (Math.abs(actualMinutes - expectedMinutes) > TOLERANCE_MINUTES) {
            wrongFrequencyList.push({
              enrollmentId: e.id,
              studentName,
              expected: freq,
              actual: actualCount,
              expectedMinutes,
              actualMinutes,
            })
          }
        } else if (actualCount !== freq) {
          wrongFrequencyList.push({
            enrollmentId: e.id,
            studentName,
            expected: freq,
            actual: actualCount,
          })
        }
        continue
      }

      actualCount = countByEnrollment[e.id] ?? 0
      actualMinutes = minutesByEnrollment[e.id] ?? 0
      const tempoAula = e.tempoAulaMinutos ?? null

      if (tempoAula != null && tempoAula > 0) {
        const expectedMinutes = freq * tempoAula
        if (Math.abs(actualMinutes - expectedMinutes) > TOLERANCE_MINUTES) {
          wrongFrequencyList.push({
            enrollmentId: e.id,
            studentName: e.nome,
            expected: freq,
            actual: actualCount,
            expectedMinutes,
            actualMinutes,
          })
        }
      } else {
        if (actualCount !== freq) {
          wrongFrequencyList.push({
            enrollmentId: e.id,
            studentName: e.nome,
            expected: freq,
            actual: actualCount,
          })
        }
      }
    }

    // Para wrongFrequencyList: adicionar horários de aula da semana e último livro (para exibir no dashboard)
    const wrongFrequencyEnrollmentIds = wrongFrequencyList.map((x) => x.enrollmentId)
    const lastBookByEnrollment: Record<string, string | null> = {}
    if (wrongFrequencyEnrollmentIds.length > 0) {
      const records = await prisma.lessonRecord.findMany({
        where: { lesson: { enrollmentId: { in: wrongFrequencyEnrollmentIds } } },
        select: { book: true, lesson: { select: { enrollmentId: true, startAt: true } } },
      })
      const sorted = records
        .filter((r) => r.lesson?.enrollmentId)
        .sort((a, b) => new Date(b.lesson!.startAt).getTime() - new Date(a.lesson!.startAt).getTime())
      for (const r of sorted) {
        const eid = r.lesson!.enrollmentId
        if (lastBookByEnrollment[eid] === undefined) {
          lastBookByEnrollment[eid] = r.book ?? null
        }
      }
    }
    const wrongFrequencyListWithDetails = wrongFrequencyList.map((item) => {
      const lessonTimesThisWeek = lessons
        .filter((l) => l.enrollmentId === item.enrollmentId)
        .map((l) => l.startAt.toISOString())
      return {
        ...item,
        lessonTimesThisWeek,
        lastBook: lastBookByEnrollment[item.enrollmentId] ?? null,
      }
    })

    // Erros professores: (1) professor com mais de um aluno no mesmo horário/dia; (2) professor inativo com aula.
    type LessonWithMeta = (typeof lessons)[0]
    const getEndAt = (l: LessonWithMeta) => {
      const end = new Date(l.startAt)
      end.setMinutes(end.getMinutes() + (l.durationMinutes ?? 60))
      return end.getTime()
    }
    const overlap = (a: LessonWithMeta, b: LessonWithMeta) => {
      const startA = new Date(a.startAt).getTime()
      const startB = new Date(b.startAt).getTime()
      const endA = getEndAt(a)
      const endB = getEndAt(b)
      return startA < endB && startB < endA
    }

    const doubleBookingList: {
      teacherId: string
      teacherName: string
      lessons: { studentName: string; startAt: string }[]
    }[] = []
    const byTeacher = new Map<string, LessonWithMeta[]>()
    for (const l of lessons) {
      if (!byTeacher.has(l.teacherId)) byTeacher.set(l.teacherId, [])
      byTeacher.get(l.teacherId)!.push(l)
    }
    for (const [, teacherLessons] of byTeacher) {
      const sorted = [...teacherLessons].sort(
        (a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime()
      )
      let groups: LessonWithMeta[][] = []
      for (const l of sorted) {
        const matching = groups.filter((g) => g.some((x) => overlap(l, x)))
        if (matching.length === 0) {
          groups.push([l])
        } else if (matching.length === 1) {
          matching[0].push(l)
        } else {
          const merged = matching.flat()
          merged.push(l)
          groups = groups.filter((g) => !matching.includes(g))
          groups.push(merged)
        }
      }
      for (const group of groups) {
        if (group.length > 1) {
          const first = group[0]
          doubleBookingList.push({
            teacherId: first.teacherId,
            teacherName: first.teacher.nome,
            lessons: group.map((l) => ({
              studentName: l.enrollment.nome,
              startAt: l.startAt.toISOString(),
            })),
          })
        }
      }
    }

    const inactiveTeacherList: {
      teacherId: string
      teacherName: string
      lessons: { studentName: string; startAt: string }[]
    }[] = []
    const inactiveTeachers = new Map<string, { teacherName: string; lessons: { studentName: string; startAt: string }[] }>()
    for (const l of lessons) {
      if (l.teacher.status !== 'ACTIVE') {
        if (!inactiveTeachers.has(l.teacherId)) {
          inactiveTeachers.set(l.teacherId, { teacherName: l.teacher.nome, lessons: [] })
        }
        inactiveTeachers.get(l.teacherId)!.lessons.push({
          studentName: l.enrollment.nome,
          startAt: l.startAt.toISOString(),
        })
      }
    }
    for (const [teacherId, data] of inactiveTeachers) {
      inactiveTeacherList.push({ teacherId, teacherName: data.teacherName, lessons: data.lessons })
    }

    const teacherErrorsCount = doubleBookingList.length + inactiveTeacherList.length

    return NextResponse.json({
      ok: true,
      data: {
        weekStart: monday.toISOString(),
        weekEnd: saturdayEnd.toISOString(),
        confirmed: confirmedList.length,
        cancelled: cancelledList.length,
        reposicao: reposicaoList.length,
        wrongFrequencyCount: wrongFrequencyListWithDetails.length,
        teacherErrorsCount,
        confirmedList,
        cancelledList,
        reposicaoList,
        wrongFrequencyList: wrongFrequencyListWithDetails,
        doubleBookingList,
        inactiveTeacherList,
      },
    })
  } catch (error) {
    console.error('[api/admin/lessons/stats GET]', error)
    return NextResponse.json(
      { ok: false, message: 'Erro ao buscar estatísticas' },
      { status: 500 }
    )
  }
}
