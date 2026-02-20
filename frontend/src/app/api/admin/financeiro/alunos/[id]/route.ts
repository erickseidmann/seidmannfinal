/**
 * PATCH /api/admin/financeiro/alunos/[id]
 * Atualiza dados financeiros da matrícula (cria PaymentInfo se não existir).
 */

import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/auth'
import { logFinanceAction, updateStudentPaymentSchema } from '@/lib/finance'

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const auth = await requireAdmin(request)
    if (!auth.authorized) {
      return NextResponse.json(
        { ok: false, message: auth.message || 'Não autorizado' },
        { status: auth.message?.includes('Não autenticado') ? 401 : 403 }
      )
    }

    const enrollmentId = params.id
    const enrollment = await prisma.enrollment.findUnique({
      where: { id: enrollmentId },
      include: { paymentInfo: true },
    })
    if (!enrollment) {
      return NextResponse.json(
        { ok: false, message: 'Matrícula não encontrada' },
        { status: 404 }
      )
    }

    const body = await request.json().catch(() => ({}))
    const parsed = updateStudentPaymentSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { ok: false, message: 'Dados inválidos', details: parsed.error.flatten() },
        { status: 400 }
      )
    }
    const data = parsed.data
    const {
      quemPaga,
      paymentStatus,
      metodoPagamento,
      banco,
      periodoPagamento,
      valorMensal,
      valorHora,
      dataUltimoPagamento,
      dataProximoPagamento,
      dueDay,
      // notaFiscalEmitida removido: agora é calculado automaticamente da tabela nfse_invoices (read-only)
      year: bodyYear,
      month: bodyMonth,
    } = data

    const year = bodyYear != null ? bodyYear : null
    const month = bodyMonth != null ? bodyMonth : null
    const hasMonthContext = year != null && month != null && month >= 1 && month <= 12

    const updateEnrollment: Prisma.EnrollmentUpdateInput = {}
    if (metodoPagamento !== undefined) updateEnrollment.metodoPagamento = typeof metodoPagamento === 'string' ? metodoPagamento.trim() || null : null
    if (valorMensal !== undefined) updateEnrollment.valorMensalidade = valorMensal ?? null

    if (Object.keys(updateEnrollment).length > 0) {
      await prisma.enrollment.update({
        where: { id: enrollmentId },
        data: updateEnrollment,
      })
    }

    const paymentData: Record<string, unknown> = {}
    if (quemPaga !== undefined) paymentData.quemPaga = typeof quemPaga === 'string' ? quemPaga.trim() || null : null
    const newPaymentStatus = paymentStatus !== undefined && ['PAGO', 'ATRASADO', 'PENDING'].includes(paymentStatus) ? paymentStatus : null
    if (!hasMonthContext && paymentStatus !== undefined) paymentData.paymentStatus = newPaymentStatus
    if (banco !== undefined) paymentData.banco = typeof banco === 'string' ? banco.trim() || null : null
    if (periodoPagamento !== undefined) paymentData.periodoPagamento = ['MENSAL', 'ANUAL', 'SEMESTRAL', 'TRIMESTRAL'].includes(periodoPagamento) ? periodoPagamento : null
    if (valorHora !== undefined) paymentData.valorHora = valorHora ?? null
    if (dataUltimoPagamento !== undefined) paymentData.paidAt = dataUltimoPagamento ? new Date(dataUltimoPagamento) : null
    if (dataProximoPagamento !== undefined) paymentData.dueDate = dataProximoPagamento ? new Date(dataProximoPagamento) : null
    if (dueDay !== undefined && dueDay !== null && dueDay >= 1 && dueDay <= 31) paymentData.dueDay = dueDay
    // notaFiscalEmitida removido: agora é calculado automaticamente da tabela nfse_invoices (read-only)

    if (Object.keys(paymentData).length > 0) {
      const oldPaymentStatus = enrollment.paymentInfo?.paymentStatus ?? null
      await prisma.paymentInfo.upsert({
        where: { enrollmentId },
        create: { enrollmentId, ...paymentData },
        update: paymentData,
      })
      if (paymentStatus !== undefined && (oldPaymentStatus !== newPaymentStatus || (oldPaymentStatus == null && newPaymentStatus != null))) {
        logFinanceAction({
          entityType: 'ENROLLMENT',
          entityId: enrollmentId,
          action: 'PAYMENT_STATUS_CHANGED',
          oldValue: { paymentStatus: oldPaymentStatus },
          newValue: { paymentStatus: newPaymentStatus },
          performedBy: auth.session?.sub ?? null,
        })
      }
    }

    if (hasMonthContext && paymentStatus !== undefined) {
      const existingMonth = await prisma.enrollmentPaymentMonth.findUnique({
        where: { enrollmentId_year_month: { enrollmentId, year, month } },
        select: { paymentStatus: true },
      })
      const newMonthStatus = paymentStatus !== undefined && ['PAGO', 'ATRASADO', 'PENDING'].includes(paymentStatus) ? paymentStatus : null
      await prisma.enrollmentPaymentMonth.upsert({
        where: {
          enrollmentId_year_month: { enrollmentId, year, month },
        },
        create: {
          enrollmentId,
          year,
          month,
          paymentStatus: newMonthStatus,
          // notaFiscalEmitida removido: agora é calculado automaticamente da tabela nfse_invoices (read-only)
        },
        update: {
          ...(paymentStatus !== undefined && { paymentStatus: newMonthStatus }),
          // notaFiscalEmitida removido: agora é calculado automaticamente da tabela nfse_invoices (read-only)
        },
      })
      if (paymentStatus !== undefined && (existingMonth?.paymentStatus !== newMonthStatus || (existingMonth?.paymentStatus == null && newMonthStatus != null))) {
        logFinanceAction({
          entityType: 'ENROLLMENT',
          entityId: enrollmentId,
          action: 'PAYMENT_STATUS_CHANGED',
          oldValue: { paymentStatus: existingMonth?.paymentStatus ?? null, year, month },
          newValue: { paymentStatus: newMonthStatus, year, month },
          performedBy: auth.session?.sub ?? null,
        })
      }
    }

    return NextResponse.json({ ok: true, message: 'Dados atualizados' })
  } catch (error) {
    console.error('[api/admin/financeiro/alunos/[id] PATCH]', error)
    return NextResponse.json(
      { ok: false, message: 'Erro ao atualizar dados financeiros' },
      { status: 500 }
    )
  }
}
