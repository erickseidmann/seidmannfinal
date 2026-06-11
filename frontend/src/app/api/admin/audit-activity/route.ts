/**
 * API Route: GET /api/admin/audit-activity
 *
 * Lista ações dos usuários do ADM nas últimas X horas.
 * Query: hours (default 48). Admin pode passar 72, 168 (7 dias), 336 (14 dias), etc.
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/auth'
import { LESSON_STATUSES_CANCELLED_FAMILY } from '@/lib/lesson-status'

interface ActivityItem {
  id: string
  type: string
  actorName: string
  action: string
  detail: string
  createdAt: string
}

function parseHours(hoursStr: string | null): number {
  if (!hoursStr) return 48
  const h = parseInt(hoursStr, 10)
  if (isNaN(h) || h < 1) return 48
  if (h > 720) return 720
  return h
}

function parseDays(daysStr: string | null): number {
  if (!daysStr) return 20
  const d = parseInt(daysStr, 10)
  if (isNaN(d) || d < 1) return 20
  if (d > 90) return 90
  return d
}

function resolveSince(searchParams: URLSearchParams): Date {
  const daysStr = searchParams.get('days')
  if (daysStr != null && daysStr !== '') {
    const days = parseDays(daysStr)
    const since = new Date()
    since.setDate(since.getDate() - days)
    return since
  }
  const hours = parseHours(searchParams.get('hours'))
  const since = new Date()
  since.setHours(since.getHours() - hours)
  return since
}

function wasJustCreated(criadoEm: Date, atualizadoEm: Date): boolean {
  return Math.abs(atualizadoEm.getTime() - criadoEm.getTime()) < 120_000
}

function actorFromLessonNotes(notes: string | null, createdByName: string | null): string {
  if (notes) {
    const lines = notes.split('\n').filter((l) => l.trim())
    for (let i = lines.length - 1; i >= 0; i--) {
      const line = lines[i]
      const cancelMatch = line.match(/cancelada pelo (.+?)\s+às/i)
      if (cancelMatch?.[1]) return cancelMatch[1].trim()
      const reagMatch = line.match(/reagendada pelo (.+?)\s+às/i)
      if (reagMatch?.[1]) return reagMatch[1].trim()
    }
  }
  return createdByName || 'Admin'
}

function formatLessonDateTime(startAt: Date): string {
  return startAt.toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
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
    const countOnly = searchParams.get('countOnly') === 'true'
    const since = resolveSince(searchParams)
    const daysParam = searchParams.get('days')

    if (countOnly) {
      const [lessons, teacherAlerts, studentAlerts, lrCreated, lrProcessed, announcements] = await Promise.all([
        prisma.lesson.count({ where: { criadoEm: { gte: since } } }),
        prisma.teacherAlert.count({ where: { criadoEm: { gte: since } } }),
        prisma.studentAlert.count({ where: { criadoEm: { gte: since } } }),
        prisma.lessonRequest.count({ where: { criadoEm: { gte: since } } }),
        prisma.lessonRequest.count({
          where: {
            processedById: { not: null },
            atualizadoEm: { gte: since },
            status: { in: ['ADMIN_APPROVED', 'ADMIN_REJECTED', 'COMPLETED'] },
          },
        }),
        prisma.announcement.count({ where: { criadoEm: { gte: since } } }),
      ])
      const total = lessons + teacherAlerts + studentAlerts + lrCreated + lrProcessed + announcements
      return NextResponse.json({
        ok: true,
        data: { count: total, hours: daysParam ? undefined : parseHours(searchParams.get('hours')), days: daysParam ? parseDays(daysParam) : undefined },
      })
    }

    const activities: ActivityItem[] = []

    // Lessons criadas
    const lessons = await prisma.lesson.findMany({
      where: { criadoEm: { gte: since } },
      include: {
        enrollment: { select: { nome: true } },
        teacher: { select: { nome: true } },
        createdBy: { select: { nome: true } },
      },
      orderBy: { criadoEm: 'desc' },
    })
    for (const l of lessons) {
      const actor = l.createdByName || l.createdBy?.nome || 'Admin'
      const teacherName = l.teacher?.nome ?? 'Professor indefinido'
      const dateStr = formatLessonDateTime(new Date(l.startAt))
      activities.push({
        id: `lesson-create-${l.id}`,
        type: 'lesson',
        actorName: actor,
        action: 'Agendou aula',
        detail: `${l.enrollment.nome} com ${teacherName} em ${dateStr}`,
        createdAt: l.criadoEm.toISOString(),
      })
    }

    // Aulas canceladas (atualização recente)
    const cancelledLessons = await prisma.lesson.findMany({
      where: {
        atualizadoEm: { gte: since },
        status: { in: [...LESSON_STATUSES_CANCELLED_FAMILY] },
      },
      include: {
        enrollment: { select: { nome: true } },
        teacher: { select: { nome: true } },
      },
      orderBy: { atualizadoEm: 'desc' },
    })
    for (const l of cancelledLessons) {
      if (l.criadoEm >= since && wasJustCreated(l.criadoEm, l.atualizadoEm)) continue
      const actor = actorFromLessonNotes(l.notes, l.createdByName)
      const teacherName = l.teacher?.nome ?? 'Professor indefinido'
      const dateStr = formatLessonDateTime(new Date(l.startAt))
      activities.push({
        id: `lesson-cancel-${l.id}-${l.atualizadoEm.toISOString()}`,
        type: 'lesson',
        actorName: actor,
        action: 'Cancelou aula',
        detail: `${l.enrollment.nome} com ${teacherName} (aula de ${dateStr})`,
        createdAt: l.atualizadoEm.toISOString(),
      })
    }

    // Aulas alteradas (horário, professor, etc.)
    const updatedLessons = await prisma.lesson.findMany({
      where: {
        atualizadoEm: { gte: since },
        status: { in: ['CONFIRMED', 'REPOSICAO'] },
      },
      include: {
        enrollment: { select: { nome: true } },
        teacher: { select: { nome: true } },
      },
      orderBy: { atualizadoEm: 'desc' },
    })
    for (const l of updatedLessons) {
      if (wasJustCreated(l.criadoEm, l.atualizadoEm) && l.criadoEm >= since) continue
      const actor = actorFromLessonNotes(l.notes, l.createdByName)
      const teacherName = l.teacher?.nome ?? 'Professor indefinido'
      const dateStr = formatLessonDateTime(new Date(l.startAt))
      const action = l.status === 'REPOSICAO' ? 'Alterou aula (reposição)' : 'Alterou aula'
      activities.push({
        id: `lesson-update-${l.id}-${l.atualizadoEm.toISOString()}`,
        type: 'lesson',
        actorName: actor,
        action,
        detail: `${l.enrollment.nome} com ${teacherName} em ${dateStr}`,
        createdAt: l.atualizadoEm.toISOString(),
      })
    }

    // Registros de aula
    const lessonRecord = (prisma as { lessonRecord?: { findMany: (args: unknown) => Promise<unknown[]> } }).lessonRecord
    if (lessonRecord?.findMany) {
      const records = (await lessonRecord.findMany({
        where: {
          OR: [{ criadoEm: { gte: since } }, { atualizadoEm: { gte: since } }],
        },
        include: {
          lesson: {
            include: {
              enrollment: { select: { nome: true } },
              teacher: { select: { nome: true } },
            },
          },
        },
        orderBy: { atualizadoEm: 'desc' },
      })) as Array<{
        id: string
        criadoEm: Date
        atualizadoEm: Date
        presence: string
        lesson: {
          startAt: Date
          enrollment: { nome: string }
          teacher: { nome: string } | null
        }
      }>

      for (const r of records) {
        const aluno = r.lesson.enrollment.nome
        const prof = r.lesson.teacher?.nome ?? 'Professor indefinido'
        const dateStr = formatLessonDateTime(new Date(r.lesson.startAt))
        const presenceLabel =
          r.presence === 'NAO_COMPARECEU'
            ? 'Não compareceu'
            : r.presence === 'ATRASADO'
              ? 'Atrasado'
              : 'Presente'

        if (r.criadoEm >= since) {
          activities.push({
            id: `record-create-${r.id}`,
            type: 'lesson_record',
            actorName: 'Admin',
            action: 'Registrou aula',
            detail: `${aluno} / ${prof} — ${dateStr} (${presenceLabel})`,
            createdAt: r.criadoEm.toISOString(),
          })
        } else if (r.atualizadoEm >= since && !wasJustCreated(r.criadoEm, r.atualizadoEm)) {
          activities.push({
            id: `record-update-${r.id}-${r.atualizadoEm.toISOString()}`,
            type: 'lesson_record',
            actorName: 'Admin',
            action: 'Alterou registro de aula',
            detail: `${aluno} / ${prof} — ${dateStr} (${presenceLabel})`,
            createdAt: r.atualizadoEm.toISOString(),
          })
        }
      }
    }

    // TeacherAlerts
    const teacherAlerts = await prisma.teacherAlert.findMany({
      where: { criadoEm: { gte: since } },
      include: {
        teacher: { select: { nome: true } },
        createdBy: { select: { nome: true } },
      },
      orderBy: { criadoEm: 'desc' },
    })
    for (const a of teacherAlerts) {
      const actor = a.createdBy?.nome || 'Admin'
      const msg = a.message.length > 60 ? a.message.slice(0, 57) + '...' : a.message
      activities.push({
        id: `ta-${a.id}`,
        type: 'teacher_alert',
        actorName: actor,
        action: 'Alerta para professor',
        detail: `${a.teacher.nome}: ${msg}`,
        createdAt: a.criadoEm.toISOString(),
      })
    }

    // StudentAlerts
    const studentAlerts = await prisma.studentAlert.findMany({
      where: { criadoEm: { gte: since } },
      include: {
        enrollment: { select: { nome: true } },
        createdBy: { select: { nome: true } },
      },
      orderBy: { criadoEm: 'desc' },
    })
    for (const a of studentAlerts) {
      const actor = a.createdBy?.nome || 'Admin'
      const msg = a.message.length > 60 ? a.message.slice(0, 57) + '...' : a.message
      activities.push({
        id: `sa-${a.id}`,
        type: 'student_alert',
        actorName: actor,
        action: 'Alerta para aluno',
        detail: `${a.enrollment.nome}: ${msg}`,
        createdAt: a.criadoEm.toISOString(),
      })
    }

    // LessonRequests (criadas e processadas)
    const lessonRequests = await prisma.lessonRequest.findMany({
      where: {
        OR: [
          { criadoEm: { gte: since } },
          { atualizadoEm: { gte: since } },
        ],
      },
      include: {
        lesson: { include: { enrollment: { select: { nome: true } }, teacher: { select: { nome: true } } } },
        createdBy: { select: { nome: true } },
        processedBy: { select: { nome: true } },
      },
      orderBy: { criadoEm: 'desc' },
    })
    for (const r of lessonRequests) {
      const typeLabel =
        r.type === 'CANCELAMENTO'
          ? 'cancelamento'
          : r.type === 'TROCA_PROFESSOR'
            ? 'troca de professor'
            : 'troca de aula'
      const aluno = r.lesson?.enrollment?.nome || 'aluno'
      const prof = r.lesson?.teacher?.nome || 'professor'

      if (r.criadoEm >= since) {
        const actor = r.createdBy?.nome || 'Admin'
        activities.push({
          id: `lr-create-${r.id}`,
          type: 'lesson_request',
          actorName: actor,
          action: `Criou solicitação de ${typeLabel}`,
          detail: `${aluno} / ${prof}`,
          createdAt: r.criadoEm.toISOString(),
        })
      }
      if (
        r.processedById &&
        r.atualizadoEm >= since &&
        ['ADMIN_APPROVED', 'ADMIN_REJECTED', 'COMPLETED'].includes(r.status)
      ) {
        const actor = r.processedBy?.nome || 'Admin'
        const action =
          r.status === 'ADMIN_APPROVED' || r.status === 'COMPLETED'
            ? `Aprovou solicitação de ${typeLabel}`
            : `Rejeitou solicitação de ${typeLabel}`
        activities.push({
          id: `lr-process-${r.id}`,
          type: 'lesson_request',
          actorName: actor,
          action,
          detail: `${aluno} / ${prof}`,
          createdAt: r.atualizadoEm.toISOString(),
        })
      }
    }

    // Announcements
    const announcements = await prisma.announcement.findMany({
      where: { criadoEm: { gte: since } },
      orderBy: { criadoEm: 'desc' },
    })
    for (const a of announcements) {
      const user = await prisma.user.findFirst({
        where: { email: a.createdByAdminEmail },
        select: { nome: true },
      })
      const actor = user?.nome || a.createdByAdminEmail || 'Admin'
      activities.push({
        id: `ann-${a.id}`,
        type: 'announcement',
        actorName: actor,
        action: 'Enviou anúncio',
        detail: `${a.title} (${a.channel}) para ${a.audience}`,
        createdAt: a.criadoEm.toISOString(),
      })
    }

    activities.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())

    return NextResponse.json({
      ok: true,
      data: {
        activities,
        count: activities.length,
        hours: daysParam ? undefined : parseHours(searchParams.get('hours')),
        days: daysParam ? parseDays(daysParam) : undefined,
      },
    })
  } catch (error) {
    console.error('[api/admin/audit-activity] Erro:', error)
    return NextResponse.json(
      { ok: false, message: 'Erro ao buscar atividades' },
      { status: 500 }
    )
  }
}
