/**
 * GET /api/student/alerts – notificações/alertas do aluno logado (matrículas vinculadas ao user)
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireStudent } from '@/lib/auth'

export async function GET(request: NextRequest) {
  try {
    const auth = await requireStudent(request)
    if (!auth.authorized || !auth.session) {
      return NextResponse.json(
        { ok: false, message: auth.message || 'Não autorizado' },
        { status: auth.session ? 403 : 401 }
      )
    }

    const enrollments = await prisma.enrollment.findMany({
      where: { userId: auth.session.userId },
      select: { id: true },
    })
    const enrollmentIds = enrollments.map((e) => e.id)
    if (enrollmentIds.length === 0) {
      return NextResponse.json({ ok: true, data: { alerts: [] } })
    }

    const cutoff = new Date()
    cutoff.setDate(cutoff.getDate() - 15)
    const twoDaysAgo = new Date()
    twoDaysAgo.setDate(twoDaysAgo.getDate() - 2)

    const alerts = await prisma.studentAlert.findMany({
      where: {
        enrollmentId: { in: enrollmentIds },
        isActive: true,
        criadoEm: { gte: cutoff },
        OR: [
          { readAt: null },
          { readAt: { gte: twoDaysAgo } },
        ],
      },
      orderBy: { criadoEm: 'desc' },
      take: 30,
    })

    return NextResponse.json({
      ok: true,
      data: {
        alerts: alerts.map((a) => ({
          id: a.id,
          message: a.message,
          level: a.level,
          readAt: a.readAt?.toISOString() ?? null,
          criadoEm: a.criadoEm.toISOString(),
        })),
      },
    })
  } catch (error) {
    console.error('[api/student/alerts GET]', error)
    return NextResponse.json(
      { ok: false, message: 'Erro ao listar notificações' },
      { status: 500 }
    )
  }
}
