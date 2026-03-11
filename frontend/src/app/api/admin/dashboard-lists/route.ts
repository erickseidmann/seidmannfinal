/**
 * GET /api/admin/dashboard-lists?type=activeStudents|studentsWithoutLesson|inactiveStudents|totalUsers|activeTeachers|inactiveTeachers|absencesStudentsWeek|...
 * Retorna lista de nomes (e dados extras quando aplicável) para os cubos do dashboard admin.
 */

import { NextRequest, NextResponse } from 'next/server'
import type { EnrollmentStatus } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/auth'

const NOW = new Date()

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
    const type = searchParams.get('type') || ''

    if (type === 'activeStudents') {
      const users = await prisma.user.findMany({
        where: { role: 'STUDENT', status: 'ACTIVE' },
        select: { id: true, nome: true },
        orderBy: { nome: 'asc' },
      })
      return NextResponse.json({ ok: true, data: users.map((u) => ({ id: u.id, nome: u.nome })) })
    }

    if (type === 'novosMatriculados') {
      const hoje = new Date()

      const enrollments = await prisma.enrollment.findMany({
        where: {
          pendenteAdicionarAulas: true,
        },
        select: {
          id: true,
          nome: true,
          criadoEm: true,
          linkPagamentoEnviadoAt: true,
          diaPagamento: true,
          frequenciaSemanal: true,
          tempoAulaMinutos: true,
          idioma: true,
          melhoresDiasSemana: true,
          melhoresHorarios: true,
          escolaMatricula: true,
          escolaMatriculaOutro: true,
          coraInvoices: {
            select: { dueDate: true, boletoUrl: true, pixCopyPaste: true, status: true },
            orderBy: { dueDate: 'asc' },
            take: 1,
          },
          paymentMonths: {
            select: { year: true, month: true, paymentStatus: true },
            orderBy: [{ year: 'asc' }, { month: 'asc' }],
            take: 1,
          },
          lessons: {
            where: { startAt: { gte: hoje } },
            orderBy: { startAt: 'asc' },
            take: 1,
            select: {
              startAt: true,
              teacher: { select: { nome: true } },
            },
          },
        },
        orderBy: { criadoEm: 'desc' },
      })
      const anoAtual = hoje.getFullYear()
      const mesAtual = hoje.getMonth() + 1

      return NextResponse.json({
        ok: true,
        data: enrollments.map((e) => {
          const diaPag = e.diaPagamento ?? 10
          let mesVenc = mesAtual
          let anoVenc = anoAtual
          if (hoje.getDate() > diaPag) {
            mesVenc = mesAtual === 12 ? 1 : mesAtual + 1
            anoVenc = mesAtual === 12 ? anoAtual + 1 : anoAtual
          }
          const dataPagamentoAgendada = new Date(anoVenc, mesVenc - 1, Math.min(diaPag, 28))
          const cora = e.coraInvoices[0]
          const pm = e.paymentMonths[0]
          const recebeuBoleto = !!cora?.boletoUrl || !!cora
          const jaPagou = cora?.status === 'PAID' || pm?.paymentStatus === 'PAGO'
          const primeiraAula = (e as any).lessons?.[0] as
            | { startAt: Date; teacher?: { nome?: string | null } | null }
            | undefined

          return {
            id: e.id,
            nome: e.nome,
            dataMatricula: e.criadoEm.toISOString(),
            linkPagamentoEnviadoAt: e.linkPagamentoEnviadoAt?.toISOString() ?? null,
            dataPagamentoAgendada: dataPagamentoAgendada.toISOString(),
            recebeuBoleto,
            jaPagou,
            boletoUrl: cora?.boletoUrl ?? null,
            pixCopyPaste: cora?.pixCopyPaste ?? null,
            primeiraAulaStartAt: primeiraAula?.startAt?.toISOString() ?? null,
            primeiraAulaTeacherName: primeiraAula?.teacher?.nome ?? null,
            frequenciaSemanal: e.frequenciaSemanal ?? null,
            tempoAulaMinutos: e.tempoAulaMinutos ?? null,
            idioma: e.idioma,
            melhoresDiasSemana: e.melhoresDiasSemana ?? null,
            melhoresHorarios: e.melhoresHorarios ?? null,
            escolaMatricula: e.escolaMatricula ?? null,
            escolaMatriculaLabel:
              e.escolaMatricula === 'OUTRO' && e.escolaMatriculaOutro
                ? e.escolaMatriculaOutro
                : e.escolaMatricula === 'SEIDMANN'
                  ? 'Seidmann'
                  : e.escolaMatricula === 'YOUBECOME'
                    ? 'Youbecome'
                    : e.escolaMatricula === 'HIGHWAY'
                      ? 'Highway'
                      : e.escolaMatricula ?? '—',
          }
        }),
      })
    }

    // Alunos para redirecionar: (1) aulas futuras fora da disponibilidade do professor; (2) aulas futuras sem professor (professor desistiu)
    if (type === 'alunosParaRedirecionar') {
      const hoje = new Date()
      hoje.setHours(0, 0, 0, 0)
      type RedirectItem = { nome: string; professores: string[]; frequenciaSemanal: number | null; tempoAulaMinutos: number | null }
      const byEnrollment = new Map<string, RedirectItem>()

      // (2) Alunos com aulas futuras sem professor (professor desistiu)
      const lessonsSemProfessor = await prisma.lesson.findMany({
        where: {
          teacherId: null,
          status: { not: 'CANCELLED' },
          startAt: { gte: hoje },
        },
        select: {
          enrollmentId: true,
          enrollment: { select: { nome: true, frequenciaSemanal: true, tempoAulaMinutos: true } },
        },
      })
      for (const l of lessonsSemProfessor) {
        const enr = l.enrollment as { nome?: string; frequenciaSemanal?: number | null; tempoAulaMinutos?: number | null }
        const nome = enr?.nome ?? 'Aluno desconhecido'
        if (!byEnrollment.has(l.enrollmentId)) {
          byEnrollment.set(l.enrollmentId, {
            nome,
            professores: ['Professor desistiu'],
            frequenciaSemanal: enr?.frequenciaSemanal ?? null,
            tempoAulaMinutos: enr?.tempoAulaMinutos ?? null,
          })
        }
      }

      // (1) Aulas fora da disponibilidade do professor
      const teachers = await prisma.teacher.findMany({
        where: { status: 'ACTIVE' },
        select: {
          id: true,
          nome: true,
          availabilitySlots: {
            select: { dayOfWeek: true, startMinutes: true, endMinutes: true },
          },
        },
      })
      for (const teacher of teachers) {
        const slots = teacher.availabilitySlots as { dayOfWeek: number; startMinutes: number; endMinutes: number }[]
        if (!slots || slots.length === 0) continue
        const lessons = await prisma.lesson.findMany({
          where: {
            teacherId: teacher.id,
            status: { not: 'CANCELLED' },
            startAt: { gte: hoje },
          },
          select: {
            enrollmentId: true,
            startAt: true,
            durationMinutes: true,
            enrollment: { select: { nome: true, frequenciaSemanal: true, tempoAulaMinutos: true } },
          },
        })
        for (const lesson of lessons) {
          const lessonStart = new Date(lesson.startAt)
          const dayOfWeek = lessonStart.getDay()
          const startMinutes = lessonStart.getHours() * 60 + lessonStart.getMinutes()
          const endMinutes = startMinutes + (lesson.durationMinutes ?? 60)
          const isWithinSlot = slots.some(
            (slot) =>
              slot.dayOfWeek === dayOfWeek &&
              startMinutes >= slot.startMinutes &&
              endMinutes <= slot.endMinutes
          )
          if (!isWithinSlot) {
            const enr = lesson.enrollment as { nome?: string; frequenciaSemanal?: number | null; tempoAulaMinutos?: number | null }
            const nome = enr?.nome ?? 'Aluno desconhecido'
            const existing = byEnrollment.get(lesson.enrollmentId)
            if (!existing) {
              byEnrollment.set(lesson.enrollmentId, {
                nome,
                professores: [teacher.nome],
                frequenciaSemanal: enr?.frequenciaSemanal ?? null,
                tempoAulaMinutos: enr?.tempoAulaMinutos ?? null,
              })
            } else {
              if (!existing.professores.includes(teacher.nome)) existing.professores.push(teacher.nome)
            }
          }
        }
      }
      const handled = await prisma.adminRedirectHandled.findMany({
        where: {
          enrollmentId: {
            in: Array.from(byEnrollment.keys()),
          },
        },
        select: { enrollmentId: true },
      })
      const handledIds = new Set(handled.map((h) => h.enrollmentId))

      const list = Array.from(byEnrollment.entries())
        .filter(([id]) => !handledIds.has(id))
        .map(([id, data]) => ({
          id,
          nome: data.nome,
          professorNome: data.professores.join(', '),
          frequenciaSemanal: data.frequenciaSemanal,
          tempoAulaMinutos: data.tempoAulaMinutos,
        }))
      list.sort((a, b) => a.nome.localeCompare(b.nome))
      return NextResponse.json({ ok: true, data: list })
    }

    if (type === 'studentsWithoutLesson') {
      const activeStatuses: EnrollmentStatus[] = ['REGISTERED', 'CONTRACT_ACCEPTED', 'ACTIVE', 'PAYMENT_PENDING']
      const enrollments = await prisma.enrollment.findMany({
        where: { status: { in: activeStatuses } },
        select: {
          id: true,
          nome: true,
          lessons: {
            where: { startAt: { lte: NOW } },
            orderBy: { startAt: 'desc' },
            take: 1,
            select: {
              startAt: true,
              record: { select: { book: true, lastPage: true } },
            },
          },
        },
        orderBy: { nome: 'asc' },
      })
      const withFuture = await prisma.lesson.findMany({
        where: { startAt: { gt: NOW } },
        select: { enrollmentId: true },
        distinct: ['enrollmentId'],
      })
      const idsWithFuture = new Set(withFuture.map((l) => l.enrollmentId))
      const list = enrollments
        .filter((e) => !idsWithFuture.has(e.id))
        .map((e) => {
          const lastLesson = e.lessons[0]
          return {
            id: e.id,
            nome: e.nome,
            ultimaAulaData: lastLesson ? lastLesson.startAt.toISOString() : null,
            ultimoLivro: lastLesson?.record?.book ?? null,
            ultimaPagina: lastLesson?.record?.lastPage ?? null,
          }
        })
      return NextResponse.json({ ok: true, data: list })
    }

    if (type === 'inactiveStudents') {
      const users = await prisma.user.findMany({
        where: { role: 'STUDENT', status: 'INACTIVE' },
        select: { id: true, nome: true },
        orderBy: { nome: 'asc' },
      })
      return NextResponse.json({ ok: true, data: users.map((u) => ({ id: u.id, nome: u.nome })) })
    }

    if (type === 'totalUsers') {
      const users = await prisma.user.findMany({
        select: { id: true, nome: true, role: true },
        orderBy: { nome: 'asc' },
      })
      return NextResponse.json({
        ok: true,
        data: users.map((u) => ({ id: u.id, nome: u.nome, role: u.role })),
      })
    }

    if (type === 'activeTeachers') {
      const teachers = await prisma.teacher.findMany({
        where: { status: 'ACTIVE' },
        select: { id: true, nome: true },
        orderBy: { nome: 'asc' },
      })
      return NextResponse.json({ ok: true, data: teachers })
    }

    if (type === 'inactiveTeachers') {
      const teachers = await prisma.teacher.findMany({
        where: { status: 'INACTIVE' },
        select: { id: true, nome: true },
        orderBy: { nome: 'asc' },
      })
      return NextResponse.json({ ok: true, data: teachers })
    }

    // Professores com problemas: avaliação 1 estrela
    if (type === 'teachersWithProblems') {
      const teachers = await prisma.teacher.findMany({
        where: { nota: 1 },
        select: { id: true, nome: true, nota: true },
        orderBy: { nome: 'asc' },
      })
      return NextResponse.json({
        ok: true,
        data: teachers.map((t) => ({ id: t.id, nome: t.nome, nota: t.nota })),
      })
    }

    // Alunos com 3 ausências consecutivas (em dias corridos)
    if (type === 'studentsWith3ConsecutiveAbsences') {
      const absences = await prisma.attendance.findMany({
        where: { type: 'STUDENT', status: 'ABSENT' },
        select: { userId: true, date: true },
      })
      const byUser = new Map<string, Set<string>>()
      for (const a of absences) {
        if (!a.userId) continue
        const key = new Date(a.date).toISOString().slice(0, 10)
        if (!byUser.has(a.userId)) byUser.set(a.userId, new Set())
        byUser.get(a.userId)!.add(key)
      }
      const oneDayMs = 24 * 60 * 60 * 1000
      const userIdsWith3: string[] = []
      for (const [userId, dateSet] of byUser) {
        const sorted = Array.from(dateSet).sort()
        let found = false
        for (let i = 0; i <= sorted.length - 3 && !found; i++) {
          const d1 = new Date(sorted[i]).getTime()
          const d2 = new Date(sorted[i + 1]).getTime()
          const d3 = new Date(sorted[i + 2]).getTime()
          if (d2 - d1 === oneDayMs && d3 - d2 === oneDayMs) {
            found = true
          }
        }
        if (found) userIdsWith3.push(userId)
      }
      const users = userIdsWith3.length
        ? await prisma.user.findMany({
            where: { id: { in: userIdsWith3 } },
            select: { id: true, nome: true },
            orderBy: { nome: 'asc' },
          })
        : []
      return NextResponse.json({
        ok: true,
        data: users.map((u) => ({ id: u.id, nome: u.nome })),
      })
    }

    const weekAgo = new Date(NOW.getTime() - 7 * 24 * 60 * 60 * 1000)
    const monthAgo = new Date(NOW.getTime() - 30 * 24 * 60 * 60 * 1000)

    if (type === 'absencesStudentsWeek') {
      const attendances = await prisma.attendance.findMany({
        where: { type: 'STUDENT', status: 'ABSENT', date: { gte: weekAgo } },
        select: { id: true, userId: true, date: true },
      })
      const userIds = [...new Set(attendances.map((a) => a.userId).filter(Boolean))] as string[]
      const users = userIds.length
        ? await prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, nome: true } })
        : []
      const byUser = Object.fromEntries(users.map((u) => [u.id, u.nome]))
      const list = attendances.map((a) => ({
        id: a.id,
        nome: a.userId ? byUser[a.userId] ?? '—' : '—',
        data: a.date.toISOString(),
      }))
      return NextResponse.json({ ok: true, data: list })
    }

    if (type === 'absencesTeachersWeek') {
      const attendances = await prisma.attendance.findMany({
        where: { type: 'TEACHER', status: 'ABSENT', date: { gte: weekAgo } },
        select: { id: true, teacherId: true, date: true },
      })
      const teacherIds = [...new Set(attendances.map((a) => a.teacherId).filter(Boolean))] as string[]
      const teachers = teacherIds.length
        ? await prisma.teacher.findMany({ where: { id: { in: teacherIds } }, select: { id: true, nome: true } })
        : []
      const byTeacher = Object.fromEntries(teachers.map((t) => [t.id, t.nome]))
      const list = attendances.map((a) => ({
        id: a.id,
        nome: a.teacherId ? byTeacher[a.teacherId] ?? '—' : '—',
        data: a.date.toISOString(),
      }))
      return NextResponse.json({ ok: true, data: list })
    }

    if (type === 'absencesStudentsMonth') {
      const attendances = await prisma.attendance.findMany({
        where: { type: 'STUDENT', status: 'ABSENT', date: { gte: monthAgo } },
        select: { id: true, userId: true, date: true },
      })
      const userIds = [...new Set(attendances.map((a) => a.userId).filter(Boolean))] as string[]
      const users = userIds.length
        ? await prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, nome: true } })
        : []
      const byUser = Object.fromEntries(users.map((u) => [u.id, u.nome]))
      const list = attendances.map((a) => ({
        id: a.id,
        nome: a.userId ? byUser[a.userId] ?? '—' : '—',
        data: a.date.toISOString(),
      }))
      return NextResponse.json({ ok: true, data: list })
    }

    if (type === 'absencesTeachersMonth') {
      const attendances = await prisma.attendance.findMany({
        where: { type: 'TEACHER', status: 'ABSENT', date: { gte: monthAgo } },
        select: { id: true, teacherId: true, date: true },
      })
      const teacherIds = [...new Set(attendances.map((a) => a.teacherId).filter(Boolean))] as string[]
      const teachers = teacherIds.length
        ? await prisma.teacher.findMany({ where: { id: { in: teacherIds } }, select: { id: true, nome: true } })
        : []
      const byTeacher = Object.fromEntries(teachers.map((t) => [t.id, t.nome]))
      const list = attendances.map((a) => ({
        id: a.id,
        nome: a.teacherId ? byTeacher[a.teacherId] ?? '—' : '—',
        data: a.date.toISOString(),
      }))
      return NextResponse.json({ ok: true, data: list })
    }

    // Alunos por escola de matrícula
    if (type === 'studentsSeidmann') {
      const enrollments = await prisma.enrollment.findMany({
        where: { escolaMatricula: 'SEIDMANN' },
        select: { id: true, nome: true },
        orderBy: { nome: 'asc' },
      })
      return NextResponse.json({ ok: true, data: enrollments })
    }

    if (type === 'studentsYoubecome') {
      const enrollments = await prisma.enrollment.findMany({
        where: { escolaMatricula: 'YOUBECOME' },
        select: { id: true, nome: true },
        orderBy: { nome: 'asc' },
      })
      return NextResponse.json({ ok: true, data: enrollments })
    }

    if (type === 'studentsHighway') {
      const enrollments = await prisma.enrollment.findMany({
        where: { escolaMatricula: 'HIGHWAY' },
        select: { id: true, nome: true },
        orderBy: { nome: 'asc' },
      })
      return NextResponse.json({ ok: true, data: enrollments })
    }

    if (type === 'studentsOutros') {
      const enrollments = await prisma.enrollment.findMany({
        where: {
          OR: [{ escolaMatricula: 'OUTRO' }, { escolaMatricula: null }],
        },
        select: { id: true, nome: true, escolaMatriculaOutro: true },
        orderBy: { nome: 'asc' },
      })
      return NextResponse.json({
        ok: true,
        data: enrollments.map((e) => ({
          id: e.id,
          nome: e.nome,
          escola: e.escolaMatriculaOutro || 'Não especificado',
        })),
      })
    }

    // Alunos por status (enrollment status, não user status)
    if (type === 'enrollmentsActive') {
      const enrollments = await prisma.enrollment.findMany({
        where: { status: 'ACTIVE' },
        select: { id: true, nome: true },
        orderBy: { nome: 'asc' },
      })
      return NextResponse.json({ ok: true, data: enrollments })
    }

    if (type === 'enrollmentsInactive') {
      const enrollments = await prisma.enrollment.findMany({
        where: { status: 'INACTIVE' },
        select: { id: true, nome: true },
        orderBy: { nome: 'asc' },
      })
      return NextResponse.json({ ok: true, data: enrollments })
    }

    if (type === 'enrollmentsPaused') {
      const enrollments = await prisma.enrollment.findMany({
        where: { status: 'PAUSED' },
        select: { id: true, nome: true },
        orderBy: { nome: 'asc' },
      })
      return NextResponse.json({ ok: true, data: enrollments })
    }

    // Alunos sem professor selecionado nesta semana ou na próxima
    if (type === 'studentsWithoutTeacherWeek' || type === 'studentsWithoutTeacherNextWeek') {
      const weekStartParam = searchParams.get('weekStart')
      let monday: Date
      if (weekStartParam) {
        monday = new Date(weekStartParam)
      } else if (type === 'studentsWithoutTeacherNextWeek') {
        const thisMonday = getMonday(new Date())
        monday = new Date(thisMonday)
        monday.setDate(monday.getDate() + 7)
      } else {
        monday = getMonday(new Date())
      }
      const saturdayEnd = getSaturdayEnd(monday)

      // Buscar aulas da semana para calcular frequência incorreta
      const lessons = await prisma.lesson.findMany({
        where: {
          startAt: { gte: monday, lte: saturdayEnd },
        },
        include: {
          enrollment: {
            select: {
              id: true,
              nome: true,
              status: true,
              frequenciaSemanal: true,
              tempoAulaMinutos: true,
              tipoAula: true,
              nomeGrupo: true,
            },
          },
        },
        orderBy: { startAt: 'asc' },
      })

      // Calcular frequência incorreta (mesma lógica da API stats)
      const countByEnrollment: Record<string, number> = {}
      const minutesByEnrollment: Record<string, number> = {}
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

      const groupCount: Record<string, number> = {}
      const groupMinutes: Record<string, number> = {}
      for (const [key, data] of Object.entries(groupSlotsByKey)) {
        groupCount[key] = data.byStartAt.size
        groupMinutes[key] = [...data.byStartAt.values()].reduce((a, b) => a + b, 0)
      }

      const TOLERANCE_MINUTES = 5
      const wrongFrequencyData: {
        enrollmentId: string
        studentName: string
        expected: number
        actual: number
        expectedMinutes?: number
        actualMinutes?: number
      }[] = []

      const activeEnrollments = await prisma.enrollment.findMany({
        where: {
          status: { in: ['ACTIVE', 'REGISTERED', 'CONTRACT_ACCEPTED', 'PAYMENT_PENDING'] },
          frequenciaSemanal: { gt: 0 }, // Fix: use gt:0 instead of not:null for Int fields
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
          const tempoAula = e.tempoAulaMinutos ?? null
          if (tempoAula != null && tempoAula > 0) {
            const expectedMinutes = freq * tempoAula
            if (Math.abs(actualMinutes - expectedMinutes) > TOLERANCE_MINUTES) {
              wrongFrequencyData.push({
                enrollmentId: e.id,
                studentName: e.nome,
                expected: freq,
                actual: actualCount,
                expectedMinutes,
                actualMinutes,
              })
            }
          } else if (actualCount !== freq) {
            wrongFrequencyData.push({
              enrollmentId: e.id,
              studentName: e.nome,
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
            wrongFrequencyData.push({
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
            wrongFrequencyData.push({
              enrollmentId: e.id,
              studentName: e.nome,
              expected: freq,
              actual: actualCount,
            })
          }
        }
      }

      // Aulas sem professor nesta semana (para sugestões)
      const lessonsWithoutTeacher = lessons
        .filter((l) => !l.teacherId && (l.enrollment.status as string) === 'ACTIVE')
        .map((l) => ({
          id: l.id,
          enrollmentId: l.enrollmentId,
          startAt: l.startAt,
        }))

      // Mesmo critério da tabela "Professor (semana)": ativos/pausados que NÃO têm nenhuma aula esta semana COM professor
      // Inclui lógica de grupo: se alguém do grupo tem professor, todos do grupo ficam de fora da lista
      const enrollmentIdsWithTeacherThisWeek = new Set(
        lessons.filter((l) => l.teacherId != null).map((l) => l.enrollmentId)
      )
      const allActiveEnrollments = await prisma.enrollment.findMany({
        where: { status: 'ACTIVE' },
        select: { id: true, nome: true, tipoAula: true, nomeGrupo: true, frequenciaSemanal: true, tempoAulaMinutos: true },
        orderBy: { nome: 'asc' },
      })
      // Replicar "com professor" para todos do mesmo grupo (igual à tabela)
      const groupByNomeGrupo: Record<string, string[]> = {}
      for (const e of allActiveEnrollments) {
        const nomeGrupo = (e as { nomeGrupo?: string | null }).nomeGrupo?.trim()
        if ((e as { tipoAula?: string | null }).tipoAula === 'GRUPO' && nomeGrupo) {
          if (!groupByNomeGrupo[nomeGrupo]) groupByNomeGrupo[nomeGrupo] = []
          groupByNomeGrupo[nomeGrupo].push(e.id)
        }
      }
      for (const ids of Object.values(groupByNomeGrupo)) {
        const hasTeacher = ids.some((id) => enrollmentIdsWithTeacherThisWeek.has(id))
        if (hasTeacher) {
          ids.forEach((id) => enrollmentIdsWithTeacherThisWeek.add(id))
        }
      }
      const enrollments = allActiveEnrollments.filter((e) => !enrollmentIdsWithTeacherThisWeek.has(e.id))

      const futureLessons = lessonsWithoutTeacher

      // Buscar todos os professores ativos e seus slots de disponibilidade
      const activeTeachers = await prisma.teacher.findMany({
        where: { status: 'ACTIVE' },
        select: {
          id: true,
          nome: true,
          nomePreferido: true,
          availabilitySlots: {
            select: {
              dayOfWeek: true,
              startMinutes: true,
              endMinutes: true,
            },
          },
        },
      })

      // Buscar aulas já atribuídas nesta semana para verificar conflitos
      const allLessonsThisWeek = await prisma.lesson.findMany({
        where: {
          startAt: { gte: monday, lte: saturdayEnd },
        },
        select: {
          teacherId: true,
          startAt: true,
          durationMinutes: true,
        },
      })
      // Filtrar apenas as que têm professor atribuído
      const assignedLessons = allLessonsThisWeek.filter((l) => l.teacherId !== null)

      // Criar um mapa de professores ocupados: teacherId -> array de { start, end }
      const teacherBusyMap = new Map<string, { start: Date; end: Date }[]>()
      assignedLessons.forEach((lesson) => {
        if (!lesson.teacherId) return
        const start = new Date(lesson.startAt)
        const end = new Date(start.getTime() + (lesson.durationMinutes || 60) * 60 * 1000)
        if (!teacherBusyMap.has(lesson.teacherId)) {
          teacherBusyMap.set(lesson.teacherId, [])
        }
        teacherBusyMap.get(lesson.teacherId)!.push({ start, end })
      })

      // Função para verificar se um professor está disponível em um horário
      const isTeacherAvailable = (teacher: typeof activeTeachers[0], datetime: Date, durationMinutes: number = 60): boolean => {
        const dayOfWeek = datetime.getDay()
        const minutesOfDay = datetime.getHours() * 60 + datetime.getMinutes()
        const slots = teacher.availabilitySlots
        const lessonEnd = new Date(datetime.getTime() + durationMinutes * 60 * 1000)

        // Verificar se o professor já tem aula neste horário (conflito de horário)
        const busySlots = teacherBusyMap.get(teacher.id)
        if (busySlots) {
          for (const busy of busySlots) {
            // Verificar sobreposição: se a nova aula começa antes da aula existente terminar
            // e termina depois da aula existente começar
            if (datetime < busy.end && lessonEnd > busy.start) {
              return false // Conflito de horário
            }
          }
        }

        // Se não tem slots cadastrados, está disponível em qualquer horário
        if (!slots || slots.length === 0) return true

        // Verificar se o horário está dentro de algum slot
        return slots.some(
          (slot) =>
            slot.dayOfWeek === dayOfWeek &&
            minutesOfDay >= slot.startMinutes &&
            minutesOfDay < slot.endMinutes
        )
      }

      // Para cada aluno: sugestões de professores e dias/horários das aulas (sem professor)
      const result = enrollments.map((enrollment) => {
        const alunoLessons = futureLessons.filter((l) => l.enrollmentId === enrollment.id)
        const suggestions: { lessonId: string; startAt: string; teachers: { id: string; nome: string }[] }[] = []
        const lessonTimes: { startAt: string }[] = alunoLessons.map((l) => ({ startAt: l.startAt.toISOString() }))

        alunoLessons.forEach((lesson) => {
          const lessonDate = new Date(lesson.startAt)
          const lessonDuration = 60
          const availableTeachers = activeTeachers
            .filter((t) => isTeacherAvailable(t, lessonDate, lessonDuration))
            .slice(0, 2)
            .map((t) => ({
              id: t.id,
              nome: t.nomePreferido || t.nome,
            }))

          if (availableTeachers.length > 0) {
            suggestions.push({
              lessonId: lesson.id,
              startAt: lesson.startAt.toISOString(),
              teachers: availableTeachers,
            })
          }
        })

        return {
          id: enrollment.id,
          nome: enrollment.nome,
          frequenciaSemanal: enrollment.frequenciaSemanal ?? null,
          tempoAulaMinutos: enrollment.tempoAulaMinutos ?? null,
          suggestions,
          lessonTimes,
        }
      })

      return NextResponse.json({ ok: true, data: result })
    }

    return NextResponse.json({ ok: false, message: 'Tipo de lista inválido' }, { status: 400 })
  } catch (error) {
    console.error('[api/admin/dashboard-lists GET]', error)
    return NextResponse.json(
      { ok: false, message: 'Erro ao buscar lista' },
      { status: 500 }
    )
  }
}
