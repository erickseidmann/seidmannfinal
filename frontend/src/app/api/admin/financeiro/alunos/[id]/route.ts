/**
 * PATCH /api/admin/financeiro/alunos/[id]
 * Atualiza dados financeiros da matrícula (cria PaymentInfo se não existir).
 */

import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/auth'
import { logFinanceAction, updateStudentPaymentSchema } from '@/lib/finance'
import { confirmEnrollmentPayment } from '@/lib/payments'

async function saveEnrollmentMonthReceiptUrl(
  enrollmentId: string,
  year: number,
  month: number,
  receiptUrl: string
): Promise<void> {
  try {
    await prisma.enrollmentPaymentMonth.update({
      where: { enrollmentId_year_month: { enrollmentId, year, month } },
      data: { receiptUrl },
    })
  } catch {
    await prisma.$executeRaw(
      Prisma.sql`
        UPDATE enrollment_payment_months
        SET receipt_url = ${receiptUrl}, updated_at = NOW()
        WHERE enrollment_id = ${enrollmentId} AND year = ${year} AND month = ${month}
      `
    )
  }
}

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
      dataUltimaCobranca,
      dueDay,
      faturamentoTipo,
      faturamentoRazaoSocial,
      faturamentoCnpj,
      faturamentoEmail,
      faturamentoEndereco,
      faturamentoDescricaoNfse,
      year: bodyYear,
      month: bodyMonth,
      receiptUrl,
    } = data

    const receiptUrlVal =
      typeof receiptUrl === 'string' && receiptUrl.trim().startsWith('/uploads/')
        ? receiptUrl.trim()
        : null

    const year = bodyYear != null ? bodyYear : null
    const month = bodyMonth != null ? bodyMonth : null
    const hasMonthContext = year != null && month != null && month >= 1 && month <= 12

    const updateEnrollment: Prisma.EnrollmentUpdateInput = {}
    if (metodoPagamento !== undefined) updateEnrollment.metodoPagamento = typeof metodoPagamento === 'string' ? metodoPagamento.trim() || null : null
    if (valorMensal !== undefined) updateEnrollment.valorMensalidade = valorMensal ?? null
    // Dia de vencimento: a tela do Financeiro prioriza Enrollment.diaPagamento.
    // Então quando o financeiro altera o vencimento, salvamos também na matrícula para refletir imediatamente na UI.
    if (dueDay !== undefined) updateEnrollment.diaPagamento = dueDay ?? null
    if (faturamentoTipo !== undefined) updateEnrollment.faturamentoTipo = faturamentoTipo === 'ALUNO' || faturamentoTipo === 'EMPRESA' ? faturamentoTipo : 'ALUNO'
    if (faturamentoRazaoSocial !== undefined) updateEnrollment.faturamentoRazaoSocial = typeof faturamentoRazaoSocial === 'string' ? faturamentoRazaoSocial.trim() || null : null
    if (faturamentoCnpj !== undefined) updateEnrollment.faturamentoCnpj = typeof faturamentoCnpj === 'string' ? faturamentoCnpj.replace(/\D/g, '').slice(0, 14) || null : null
    if (faturamentoEmail !== undefined) updateEnrollment.faturamentoEmail = typeof faturamentoEmail === 'string' ? faturamentoEmail.trim().toLowerCase().slice(0, 255) || null : null
    if (faturamentoEndereco !== undefined) updateEnrollment.faturamentoEndereco = typeof faturamentoEndereco === 'string' ? faturamentoEndereco.trim().slice(0, 2000) || null : null
    if (faturamentoDescricaoNfse !== undefined) updateEnrollment.faturamentoDescricaoNfse = typeof faturamentoDescricaoNfse === 'string' ? faturamentoDescricaoNfse.trim().slice(0, 2000) || null : null

    if (Object.keys(updateEnrollment).length > 0) {
      await prisma.enrollment.update({
        where: { id: enrollmentId },
        data: updateEnrollment,
      })
    }

    const paymentData: Record<string, unknown> = {}
    if (quemPaga !== undefined) paymentData.quemPaga = typeof quemPaga === 'string' ? quemPaga.trim() || null : null
    const newPaymentStatus = paymentStatus != null && ['PAGO', 'ATRASADO', 'PENDING', 'REMOVIDO'].includes(paymentStatus) ? paymentStatus : null
    if (paymentStatus === 'PAGO' && !receiptUrlVal) {
      return NextResponse.json(
        {
          ok: false,
          message:
            'Não é possível marcar como pago manualmente. Vincule o recebimento em Recebimentos a conciliar ou anexe o comprovante de pagamento.',
        },
        { status: 400 }
      )
    }
    if (!hasMonthContext && paymentStatus !== undefined) paymentData.paymentStatus = newPaymentStatus
    if (banco !== undefined) paymentData.banco = typeof banco === 'string' ? banco.trim() || null : null
    if (periodoPagamento !== undefined) paymentData.periodoPagamento = periodoPagamento != null && ['MENSAL', 'ANUAL', 'SEMESTRAL', 'TRIMESTRAL'].includes(periodoPagamento) ? periodoPagamento : null
    if (valorHora !== undefined) paymentData.valorHora = valorHora ?? null
    if (dataUltimoPagamento !== undefined) paymentData.paidAt = dataUltimoPagamento ? new Date(dataUltimoPagamento) : null
    // Ao desmarcar como pago (PENDING), limpar sempre a data de pagamento se não foi enviada explicitamente
    if (paymentStatus === 'PENDING' && dataUltimoPagamento === undefined) paymentData.paidAt = null
    // Não alterar dueDate quando a edição é só do status do mês (cada mês independente; vencimento é fixo pelo dia)
    if (dataProximoPagamento !== undefined && !hasMonthContext) paymentData.dueDate = dataProximoPagamento ? new Date(dataProximoPagamento) : null
    if (dataUltimaCobranca !== undefined) paymentData.ultimaCobrancaManualAt = dataUltimaCobranca ? new Date(dataUltimaCobranca) : null
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
      const newMonthStatus = paymentStatus != null && ['PAGO', 'ATRASADO', 'PENDING', 'REMOVIDO'].includes(paymentStatus) ? paymentStatus : null
      if (newMonthStatus === 'PAGO') {
        if (!receiptUrlVal) {
          return NextResponse.json(
            {
              ok: false,
              message:
                'Não é possível marcar como pago manualmente. Vincule o recebimento em Recebimentos a conciliar ou anexe o comprovante de pagamento.',
            },
            { status: 400 }
          )
        }
        const paymentDate = dataUltimoPagamento ? new Date(dataUltimoPagamento) : new Date()
        await confirmEnrollmentPayment({
          enrollmentId,
          year,
          month,
          paidAt: paymentDate,
          metodo: typeof metodoPagamento === 'string' ? metodoPagamento : undefined,
          source: 'FINANCEIRO_ADMIN',
          performedBy: auth.session?.sub ?? null,
          cancelCoraIfOpen: true,
        })
        await saveEnrollmentMonthReceiptUrl(enrollmentId, year, month, receiptUrlVal)
      } else {
        await prisma.enrollmentPaymentMonth.upsert({
          where: {
            enrollmentId_year_month: { enrollmentId, year, month },
          },
          create: {
            enrollmentId,
            year,
            month,
            paymentStatus: newMonthStatus,
            paidAt: null,
            receiptUrl: null,
          },
          update: {
            ...(paymentStatus !== undefined && { paymentStatus: newMonthStatus }),
            paidAt: null,
            receiptUrl: null,
          },
        })
      }
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
