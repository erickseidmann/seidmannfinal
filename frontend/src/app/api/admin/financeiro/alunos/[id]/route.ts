/**
 * PATCH /api/admin/financeiro/alunos/[id]
 * Atualiza dados financeiros da matrícula (cria PaymentInfo se não existir).
 */

import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/auth'

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
      notaFiscalEmitida,
      year: bodyYear,
      month: bodyMonth,
    } = body

    const year = bodyYear != null ? Number(bodyYear) : null
    const month = bodyMonth != null ? Number(bodyMonth) : null
    const hasMonthContext = year != null && month != null && month >= 1 && month <= 12

    const updateEnrollment: Prisma.EnrollmentUpdateInput = {}
    if (metodoPagamento !== undefined) updateEnrollment.metodoPagamento = typeof metodoPagamento === 'string' ? metodoPagamento.trim() || null : null
    if (valorMensal !== undefined) updateEnrollment.valorMensalidade = valorMensal != null && valorMensal !== '' ? Number(valorMensal) : null

    if (Object.keys(updateEnrollment).length > 0) {
      await prisma.enrollment.update({
        where: { id: enrollmentId },
        data: updateEnrollment,
      })
    }

    const paymentData: Record<string, unknown> = {}
    if (quemPaga !== undefined) paymentData.quemPaga = typeof quemPaga === 'string' ? quemPaga.trim() || null : null
    if (!hasMonthContext && paymentStatus !== undefined) paymentData.paymentStatus = ['PAGO', 'ATRASADO', 'PENDING'].includes(paymentStatus) ? paymentStatus : null
    if (banco !== undefined) paymentData.banco = typeof banco === 'string' ? banco.trim() || null : null
    if (periodoPagamento !== undefined) paymentData.periodoPagamento = ['MENSAL', 'ANUAL', 'SEMESTRAL', 'TRIMESTRAL'].includes(periodoPagamento) ? periodoPagamento : null
    if (valorHora !== undefined) paymentData.valorHora = valorHora != null && valorHora !== '' ? Number(valorHora) : null
    if (dataUltimoPagamento !== undefined) paymentData.paidAt = dataUltimoPagamento ? new Date(dataUltimoPagamento) : null
    if (dataProximoPagamento !== undefined) paymentData.dueDate = dataProximoPagamento ? new Date(dataProximoPagamento) : null
    if (!hasMonthContext && notaFiscalEmitida !== undefined) paymentData.notaFiscalEmitida = Boolean(notaFiscalEmitida)

    if (Object.keys(paymentData).length > 0) {
      await prisma.paymentInfo.upsert({
        where: { enrollmentId },
        create: { enrollmentId, ...paymentData },
        update: paymentData,
      })
    }

    if (hasMonthContext && (paymentStatus !== undefined || notaFiscalEmitida !== undefined)) {
      await prisma.enrollmentPaymentMonth.upsert({
        where: {
          enrollmentId_year_month: { enrollmentId, year, month },
        },
        create: {
          enrollmentId,
          year,
          month,
          paymentStatus: paymentStatus !== undefined && ['PAGO', 'ATRASADO', 'PENDING'].includes(paymentStatus) ? paymentStatus : null,
          notaFiscalEmitida: notaFiscalEmitida !== undefined ? Boolean(notaFiscalEmitida) : null,
        },
        update: {
          ...(paymentStatus !== undefined && { paymentStatus: ['PAGO', 'ATRASADO', 'PENDING'].includes(paymentStatus) ? paymentStatus : null }),
          ...(notaFiscalEmitida !== undefined && { notaFiscalEmitida: Boolean(notaFiscalEmitida) }),
        },
      })
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
