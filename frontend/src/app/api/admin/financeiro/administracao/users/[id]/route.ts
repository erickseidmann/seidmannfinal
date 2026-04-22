/**
 * PATCH /api/admin/financeiro/administracao/users/[id]
 * - Valor: alterações viram proposta (valorPendente) até o admin aprovar. Só super admin pode aprovar.
 * - Body: year, month, valor? (proposta), paymentStatus?, receiptUrl?, applyToAllMonthsInYear?, approveValorPendente? (true = aprovar proposta; só super admin)
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdmin, isSuperAdminEmail } from '@/lib/auth'
import { markLinkedTeacherPaidForAdminCompetenceMonth } from '@/lib/finance/sync-linked-teacher-paid-from-admin'

const SUPER_ADMIN_EMAIL = 'admin@seidmann.com'

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAdmin(request)
    if (!auth.authorized) {
      return NextResponse.json(
        { ok: false, message: auth.message || 'Não autorizado' },
        { status: auth.message?.includes('Não autenticado') ? 401 : 403 }
      )
    }

    const { id: userId } = await params
    const user = await prisma.user.findFirst({
      where: {
        id: userId,
        role: 'ADMIN',
        email: { not: SUPER_ADMIN_EMAIL },
      },
    })
    if (!user) {
      return NextResponse.json(
        { ok: false, message: 'Usuário não encontrado ou não é ADM' },
        { status: 404 }
      )
    }

    const body = await request.json().catch(() => ({}))
    const {
      year: bodyYear,
      month: bodyMonth,
      valor,
      paymentStatus,
      receiptUrl,
      applyToAllMonthsInYear,
      approveValorPendente,
      linkedTeacherId: bodyLinkedTeacherId,
      adminPaymentDueDay: bodyAdminDueDay,
    } = body

    const touchLink = bodyLinkedTeacherId !== undefined
    const touchDue = bodyAdminDueDay !== undefined

    if (touchLink || touchDue) {
      const data: { linkedTeacherId?: string | null; adminPaymentDueDay?: number | null } = {}
      if (touchLink) {
        if (bodyLinkedTeacherId === null || bodyLinkedTeacherId === '') {
          data.linkedTeacherId = null
        } else if (typeof bodyLinkedTeacherId === 'string') {
          const tid = bodyLinkedTeacherId.trim()
          if (!tid) {
            data.linkedTeacherId = null
          } else {
            const t = await prisma.teacher.findUnique({ where: { id: tid } })
            if (!t) {
              return NextResponse.json({ ok: false, message: 'Professor não encontrado.' }, { status: 404 })
            }
            data.linkedTeacherId = tid
          }
        }
      }
      if (touchDue) {
        if (bodyAdminDueDay === null || bodyAdminDueDay === '') {
          data.adminPaymentDueDay = null
        } else {
          const d = Number(bodyAdminDueDay)
          if (!Number.isInteger(d) || d < 1 || d > 31) {
            return NextResponse.json(
              { ok: false, message: 'Dia de pagamento deve ser um inteiro entre 1 e 31.' },
              { status: 400 }
            )
          }
          data.adminPaymentDueDay = d
        }
      }
      if (Object.keys(data).length > 0) {
        await prisma.user.update({ where: { id: userId }, data })
      }
      const needsMonthForPayment =
        bodyYear != null ||
        bodyMonth != null ||
        valor !== undefined ||
        paymentStatus !== undefined ||
        receiptUrl !== undefined ||
        applyToAllMonthsInYear === true ||
        approveValorPendente === true
      if (!needsMonthForPayment) {
        return NextResponse.json({ ok: true, message: 'Dados atualizados.' })
      }
    }

    const year = bodyYear != null ? Number(bodyYear) : null
    const month = bodyMonth != null ? Number(bodyMonth) : null
    if (year == null || month == null || month < 1 || month > 12) {
      return NextResponse.json(
        { ok: false, message: 'year e month (1-12) são obrigatórios' },
        { status: 400 }
      )
    }

    if (!prisma.adminUserPaymentMonth) {
      return NextResponse.json(
        { ok: false, message: 'Modelo não disponível. Rode: npx prisma generate' },
        { status: 503 }
      )
    }

    const isSuperAdmin = auth.session?.email ? isSuperAdminEmail(auth.session.email) : false
    const valorNum = valor !== undefined && valor !== '' && valor != null ? Number(valor) : undefined
    const paymentStatusVal = paymentStatus === 'PAGO' ? 'PAGO' : paymentStatus === 'EM_ABERTO' ? 'EM_ABERTO' : undefined
    const replicateToAllMonths = applyToAllMonthsInYear === true || applyToAllMonthsInYear === 'true'
    const doApprove = approveValorPendente === true || approveValorPendente === 'true'

    // Aprovar proposta de valor (apenas super admin)
    if (doApprove) {
      if (!isSuperAdmin) {
        return NextResponse.json(
          { ok: false, message: 'Apenas o administrador principal pode aprovar alterações de valor.' },
          { status: 403 }
        )
      }
      const existing = await prisma.adminUserPaymentMonth.findUnique({
        where: { userId_year_month: { userId, year, month } },
      })
      if (!existing || existing.valorPendente == null) {
        return NextResponse.json(
          { ok: false, message: 'Não há proposta de valor pendente para aprovar.' },
          { status: 400 }
        )
      }
      await prisma.adminUserPaymentMonth.update({
        where: { userId_year_month: { userId, year, month } },
        data: {
          valor: existing.valorPendente,
          valorPendente: null,
          valorPendenteRequestedAt: null,
        },
      })
      return NextResponse.json({ ok: true, message: 'Valor aprovado e atualizado.' })
    }

    // Propor alteração de valor (fica em valorPendente até aprovação)
    if (replicateToAllMonths && valorNum !== undefined) {
      const now = new Date()
      for (let m = 1; m <= 12; m++) {
        await prisma.adminUserPaymentMonth.upsert({
          where: { userId_year_month: { userId, year, month: m } },
          create: {
            userId,
            year,
            month: m,
            valor: null,
            valorPendente: valorNum,
            valorPendenteRequestedAt: now,
            paymentStatus: m === month && paymentStatusVal !== undefined ? paymentStatusVal : null,
          },
          update: {
            valorPendente: valorNum,
            valorPendenteRequestedAt: now,
            ...(m === month && paymentStatusVal !== undefined ? { paymentStatus: paymentStatusVal } : {}),
          },
        })
      }
      return NextResponse.json({ ok: true, message: 'Proposta de valor registrada para todos os meses. Aguardando aprovação do admin.' })
    }

    if (valorNum !== undefined) {
      const now = new Date()
      await prisma.adminUserPaymentMonth.upsert({
        where: { userId_year_month: { userId, year, month } },
        create: {
          userId,
          year,
          month,
          valor: null,
          valorPendente: valorNum,
          valorPendenteRequestedAt: now,
          paymentStatus: paymentStatusVal ?? null,
        },
        update: {
          valorPendente: valorNum,
          valorPendenteRequestedAt: now,
          ...(paymentStatusVal !== undefined ? { paymentStatus: paymentStatusVal } : {}),
        },
      })
      return NextResponse.json({ ok: true, message: 'Proposta de valor registrada. Aguardando aprovação do admin.' })
    }

    if (paymentStatusVal !== undefined) {
      const receiptUrlVal =
        typeof receiptUrl === 'string' && receiptUrl.trim().startsWith('/uploads/')
          ? receiptUrl.trim()
          : null
      const paidAtVal = paymentStatusVal === 'PAGO' ? new Date() : null
      await prisma.adminUserPaymentMonth.upsert({
        where: { userId_year_month: { userId, year, month } },
        create: {
          userId,
          year,
          month,
          valor: null,
          paymentStatus: paymentStatusVal,
          paidAt: paidAtVal,
          receiptUrl: paymentStatusVal === 'PAGO' ? receiptUrlVal : null,
        },
        update: {
          paymentStatus: paymentStatusVal,
          paidAt: paidAtVal,
          receiptUrl: paymentStatusVal === 'PAGO' ? receiptUrlVal : null,
        },
      })
      if (paymentStatusVal === 'PAGO') {
        const u = await prisma.user.findUnique({
          where: { id: userId },
          select: { linkedTeacherId: true },
        })
        if (u?.linkedTeacherId) {
          await markLinkedTeacherPaidForAdminCompetenceMonth({
            teacherId: u.linkedTeacherId,
            competenceYear: year,
            competenceMonth: month,
            performedByUserId: auth.session?.sub ?? null,
          })
        }
      }
      return NextResponse.json({ ok: true, message: 'Status de pagamento atualizado.' })
    }

    // Atualizar apenas comprovante (sem alterar status)
    if (typeof receiptUrl === 'string' && receiptUrl.trim()) {
      const receiptUrlVal = receiptUrl.trim()
      if (!receiptUrlVal.startsWith('/uploads/')) {
        return NextResponse.json(
          { ok: false, message: 'Comprovante inválido.' },
          { status: 400 }
        )
      }
      await prisma.adminUserPaymentMonth.upsert({
        where: { userId_year_month: { userId, year, month } },
        create: {
          userId,
          year,
          month,
          valor: null,
          paymentStatus: 'EM_ABERTO',
          receiptUrl: receiptUrlVal,
        },
        update: { receiptUrl: receiptUrlVal },
      })
      return NextResponse.json({ ok: true, message: 'Comprovante anexado.' })
    }

    return NextResponse.json({ ok: true, message: 'Nada a atualizar' })
  } catch (error) {
    console.error('[api/admin/financeiro/administracao/users/[id] PATCH]', error)
    return NextResponse.json(
      { ok: false, message: 'Erro ao atualizar' },
      { status: 500 }
    )
  }
}
