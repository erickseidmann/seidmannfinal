/**
 * GET /api/admin/financeiro/notificacoes
 * Lista notificações de pagamento com filtros e resumos.
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/auth'

const PAYMENT_OVERDUE_DAYS_LIMIT = Number(process.env.PAYMENT_OVERDUE_DAYS_LIMIT) || 8

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
    const type = searchParams.get('type')
    const year = searchParams.get('year')
    const month = searchParams.get('month')
    const limit = Math.min(Number(searchParams.get('limit')) || 100, 500)

    const now = new Date()
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const todayEnd = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000)

    const where: Record<string, unknown> = {}
    if (type) where.type = type
    if (year) where.year = Number(year)
    if (month) where.month = Number(month)

    const [notifications, sentToday, errorsToday, atRisk] = await Promise.all([
      prisma.paymentNotification.findMany({
        where,
        orderBy: { sentAt: 'desc' },
        take: limit,
        include: {
          enrollment: { select: { id: true, nome: true, status: true } },
        },
      }),
      prisma.paymentNotification.count({
        where: {
          ...where,
          success: true,
          sentAt: { gte: todayStart, lt: todayEnd },
        },
      }),
      prisma.paymentNotification.count({
        where: {
          ...where,
          success: false,
          sentAt: { gte: todayStart, lt: todayEnd },
        },
      }),
      prisma.enrollment.findMany({
        where: {
          status: 'ACTIVE',
          OR: [
            { diaPagamento: { not: null } },
            { paymentInfo: { dueDay: { not: null } } },
          ],
          paymentMonths: {
            none: {
              year: now.getFullYear(),
              month: now.getMonth() + 1,
              paymentStatus: 'PAGO',
            },
          },
        },
        select: {
          id: true,
          nome: true,
          diaPagamento: true,
          paymentInfo: { select: { dueDay: true } },
          paymentMonths: {
            where: {
              year: now.getFullYear(),
              month: now.getMonth() + 1,
            },
            select: { paymentStatus: true },
          },
        },
      }),
    ])

    const todayDate = new Date()
    const todayDay = todayDate.getDate()
    const yearM = todayDate.getFullYear()
    const monthM = todayDate.getMonth() + 1

    const atRiskEnrollments = atRisk.filter((e) => {
      const pm = e.paymentMonths[0]
      if (pm?.paymentStatus === 'PAGO') return false
      const dueDay = e.diaPagamento ?? e.paymentInfo?.dueDay ?? 10
      const lastDay = new Date(yearM, monthM, 0).getDate()
      const safeDay = Math.min(dueDay, lastDay)
      const dueDate = new Date(yearM, monthM - 1, safeDay)
      const msDiff = todayDate.getTime() - dueDate.getTime()
      const daysOverdue = Math.ceil(msDiff / (24 * 60 * 60 * 1000))
      return daysOverdue > 5 && daysOverdue <= PAYMENT_OVERDUE_DAYS_LIMIT
    })

    const toDeactivate = atRisk.filter((e) => {
      const pm = e.paymentMonths[0]
      if (pm?.paymentStatus === 'PAGO') return false
      const dueDay = e.diaPagamento ?? e.paymentInfo?.dueDay ?? 10
      const lastDay = new Date(yearM, monthM, 0).getDate()
      const safeDay = Math.min(dueDay, lastDay)
      const dueDate = new Date(yearM, monthM - 1, safeDay)
      const msDiff = todayDate.getTime() - dueDate.getTime()
      const daysOverdue = Math.ceil(msDiff / (24 * 60 * 60 * 1000))
      return daysOverdue > PAYMENT_OVERDUE_DAYS_LIMIT
    })

    const data = notifications.map((n) => ({
      id: n.id,
      enrollmentId: n.enrollmentId,
      alunoNome: n.enrollment.nome,
      type: n.type,
      year: n.year,
      month: n.month,
      sentAt: n.sentAt.toISOString(),
      emailTo: n.emailTo,
      success: n.success,
      errorMessage: n.errorMessage,
    }))

    return NextResponse.json({
      ok: true,
      data: {
        notifications: data,
        summary: {
          sentToday,
          errorsToday,
          atRiskCount: atRiskEnrollments.length,
          toDeactivateCount: toDeactivate.length,
        },
        atRisk: atRiskEnrollments.map((e) => ({ id: e.id, nome: e.nome })),
        toDeactivate: toDeactivate.map((e) => ({ id: e.id, nome: e.nome })),
      },
    })
  } catch (error) {
    console.error('[API admin financeiro notificacoes]', error)
    return NextResponse.json(
      { ok: false, message: 'Erro ao listar notificações' },
      { status: 500 }
    )
  }
}
