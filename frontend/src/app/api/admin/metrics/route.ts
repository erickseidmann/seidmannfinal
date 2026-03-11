/**
 * API Route: GET /api/admin/metrics
 * 
 * Retorna métricas do sistema para o dashboard admin.
 * Protegido por middleware (requer sessão admin).
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/auth'

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAdmin(request)
    if (!auth.authorized) {
      return NextResponse.json(
        { ok: false, message: auth.message || 'Não autorizado' },
        { status: auth.message?.includes('Não autenticado') ? 401 : 403 }
      )
    }
    // Contagens de usuários por status
    const usersByStatus = await prisma.user.groupBy({
      by: ['status'],
      _count: {
        id: true,
      },
    })

    // Total de usuários
    const totalUsers = await prisma.user.count()

    // Contagens de professores por status (model Teacher)
    // Verificar se o model existe antes de usar
    let teachersByStatus: any[] = []
    let totalTeachers = 0
    
    if (prisma.teacher) {
      try {
        teachersByStatus = await (prisma.teacher as any).groupBy({
          by: ['status'],
          _count: {
            id: true,
          },
        })
        totalTeachers = await prisma.teacher.count()
      } catch (err) {
        console.warn('[api/admin/metrics] Erro ao buscar professores (tabela pode não existir ainda):', err)
      }
    }

    // Mapear resultados para objeto
    const users: Record<string, number> = {
      ACTIVE: 0,
      PENDING: 0,
      INACTIVE: 0,
      total: totalUsers,
    }

    usersByStatus.forEach((item) => {
      if (item.status === 'ACTIVE') {
        users.ACTIVE = item._count.id
      } else if (item.status === 'PENDING') {
        users.PENDING = item._count.id
      } else if (item.status === 'INACTIVE') {
        users.INACTIVE = item._count.id
      }
    })

    const teachers: Record<string, number> = {
      ACTIVE: 0,
      INACTIVE: 0,
      total: totalTeachers,
    }

    teachersByStatus.forEach((item) => {
      if (item.status === 'ACTIVE') {
        teachers.ACTIVE = item._count.id
      } else if (item.status === 'INACTIVE') {
        teachers.INACTIVE = item._count.id
      }
    })

    // Alunos sem aula designada: matrículas ativas sem aula futura agendada
    let studentsWithoutLesson = 0
    try {
      const now = new Date()
      const activeStatuses: import('@prisma/client').EnrollmentStatus[] = ['REGISTERED', 'CONTRACT_ACCEPTED', 'ACTIVE', 'PAYMENT_PENDING']
      const enrollmentsWithFuture = await prisma.lesson.findMany({
        where: { startAt: { gt: now } },
        select: { enrollmentId: true },
        distinct: ['enrollmentId'],
      })
      const idsWithFuture = new Set(enrollmentsWithFuture.map((l) => l.enrollmentId))
      const where: import('@prisma/client').Prisma.EnrollmentWhereInput = {
        status: { in: activeStatuses },
      }
      if (idsWithFuture.size > 0) {
        where.id = { notIn: [...idsWithFuture] }
      }
      studentsWithoutLesson = await prisma.enrollment.count({ where })
    } catch (err) {
      console.warn('[api/admin/metrics] Erro ao contar alunos sem aula:', err)
    }

    // Novos alunos matriculados (pelo formulário, pendentes de "já adicionei aulas" – podem ou não ter aulas já marcadas)
    let novosMatriculadosCount = 0
    try {
      novosMatriculadosCount = await prisma.enrollment.count({
        where: {
          pendenteAdicionarAulas: true,
        },
      })
    } catch (err) {
      console.warn('[api/admin/metrics] Erro ao contar novos matriculados:', err)
    }

    // Alunos para redirecionar: (1) aulas fora da disponibilidade do professor; (2) aulas sem professor (professor desistiu)
    let alunosParaRedirecionarCount = 0
    try {
      const hoje = new Date()
      hoje.setHours(0, 0, 0, 0)
      const enrollmentIdsToRedirect = new Set<string>()

      // (2) Alunos com aulas futuras sem professor
      const lessonsSemProfessor = await prisma.lesson.findMany({
        where: {
          teacherId: null,
          status: { not: 'CANCELLED' },
          startAt: { gte: hoje },
        },
        select: { enrollmentId: true },
      })
      for (const l of lessonsSemProfessor) {
        enrollmentIdsToRedirect.add(l.enrollmentId)
      }

      // (1) Aulas fora da disponibilidade do professor
      const teachers = await prisma.teacher.findMany({
        where: { status: 'ACTIVE' },
        select: {
          id: true,
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
            enrollmentIdsToRedirect.add(lesson.enrollmentId)
          }
        }
      }

      if (enrollmentIdsToRedirect.size > 0) {
        const handled = await prisma.adminRedirectHandled.findMany({
          where: {
            enrollmentId: {
              in: Array.from(enrollmentIdsToRedirect),
            },
          },
          select: { enrollmentId: true },
        })
        for (const h of handled) {
          enrollmentIdsToRedirect.delete(h.enrollmentId)
        }
      }

      alunosParaRedirecionarCount = enrollmentIdsToRedirect.size
    } catch (err) {
      console.warn('[api/admin/metrics] Erro ao contar alunos para redirecionar:', err)
    }

    // Professores com problemas: avaliação 1 estrela (nota === 1)
    let teachersWithProblems = 0
    try {
      teachersWithProblems = await prisma.teacher.count({
        where: { nota: 1 },
      })
    } catch (err) {
      console.warn('[api/admin/metrics] Erro ao contar professores com problemas:', err)
    }

    // Alunos com 3 ausências consecutivas (em dias corridos)
    let studentsWith3ConsecutiveAbsences = 0
    if (prisma.attendance) {
      try {
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
        for (const [, dateSet] of byUser) {
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
          if (found) studentsWith3ConsecutiveAbsences++
        }
      } catch (err) {
        console.warn('[api/admin/metrics] Erro ao contar alunos com 3 ausências consecutivas:', err)
      }
    }

    // Calcular faltas (últimos 7 dias e 30 dias)
    // Verificar se o model existe antes de usar
    let studentsAbsencesWeek = 0
    let studentsAbsencesMonth = 0
    let teachersAbsencesWeek = 0
    let teachersAbsencesMonth = 0

    if (prisma.attendance) {
      try {
        const now = new Date()
        const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
        const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)

        // Faltas de alunos (últimos 7 dias)
        studentsAbsencesWeek = await prisma.attendance.count({
          where: {
            type: 'STUDENT',
            status: 'ABSENT',
            date: { gte: weekAgo },
          },
        })

        // Faltas de alunos (últimos 30 dias)
        studentsAbsencesMonth = await prisma.attendance.count({
          where: {
            type: 'STUDENT',
            status: 'ABSENT',
            date: { gte: monthAgo },
          },
        })

        // Faltas de professores (últimos 7 dias)
        teachersAbsencesWeek = await prisma.attendance.count({
          where: {
            type: 'TEACHER',
            status: 'ABSENT',
            date: { gte: weekAgo },
          },
        })

        // Faltas de professores (últimos 30 dias)
        teachersAbsencesMonth = await prisma.attendance.count({
          where: {
            type: 'TEACHER',
            status: 'ABSENT',
            date: { gte: monthAgo },
          },
        })
      } catch (err) {
        console.warn('[api/admin/metrics] Erro ao buscar faltas (tabela pode não existir ainda):', err)
      }
    }

    return NextResponse.json({
      ok: true,
      data: {
        users: {
          ACTIVE: users.ACTIVE,
          PENDING: users.PENDING,
          INACTIVE: users.INACTIVE,
          total: users.total,
        },
        teachers: {
          ACTIVE: teachers.ACTIVE,
          INACTIVE: teachers.INACTIVE,
          total: teachers.total,
        },
        studentsWithoutLesson,
        novosMatriculadosCount,
        alunosParaRedirecionarCount,
        teachersWithProblems,
        studentsWith3ConsecutiveAbsences,
        absences: {
          studentsWeek: studentsAbsencesWeek,
          studentsMonth: studentsAbsencesMonth,
          teachersWeek: teachersAbsencesWeek,
          teachersMonth: teachersAbsencesMonth,
        },
      },
    })
  } catch (error) {
    console.error('[api/admin/metrics] Erro ao buscar métricas:', error)
    return NextResponse.json(
      { ok: false, message: 'Erro ao buscar métricas' },
      { status: 500 }
    )
  }
}
