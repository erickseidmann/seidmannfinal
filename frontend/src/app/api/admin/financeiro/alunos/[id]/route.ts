/**
 * PATCH /api/admin/financeiro/alunos/[id]
 * Atualiza dados financeiros da matrícula (cria PaymentInfo se não existir).
 */

import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/auth'
import { logFinanceAction, updateStudentPaymentSchema, getEnrollmentFinanceData } from '@/lib/finance'
import { cancelInvoice } from '@/lib/cora/client'
import { emitirNfseParaAluno } from '@/lib/nfse/service'
import { sendPaymentConfirmation } from '@/lib/email/payment-notifications'

const NFSE_ENABLED = process.env.NFSE_ENABLED === 'true'

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
    } = data

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
      const monthPaidAt =
        newMonthStatus === 'PAGO'
          ? dataUltimoPagamento
            ? new Date(dataUltimoPagamento)
            : new Date()
          : null
      await prisma.enrollmentPaymentMonth.upsert({
        where: {
          enrollmentId_year_month: { enrollmentId, year, month },
        },
        create: {
          enrollmentId,
          year,
          month,
          paymentStatus: newMonthStatus,
          paidAt: monthPaidAt,
        },
        update: {
          ...(paymentStatus !== undefined && { paymentStatus: newMonthStatus }),
          paidAt: monthPaidAt,
        },
      })
      // Se marcou como PAGO: cancelar boleto Cora, emitir NF (se habilitado) e enviar confirmação + NF ao aluno
      if (newMonthStatus === 'PAGO') {
        try {
          const coraInvoice = await prisma.coraInvoice.findUnique({
            where: { enrollmentId_year_month: { enrollmentId, year, month } },
          })
          if (coraInvoice && coraInvoice.status !== 'PAID' && coraInvoice.status !== 'CANCELLED') {
            await cancelInvoice(coraInvoice.coraInvoiceId)
            await prisma.coraInvoice.update({
              where: { id: coraInvoice.id },
              data: { status: 'CANCELLED' },
            })
            console.log(
              `[financeiro/alunos/${enrollmentId}] Boleto Cora cancelado automaticamente ao marcar como PAGO`,
              {
                coraInvoiceId: coraInvoice.coraInvoiceId,
                year,
                month,
              }
            )
          }
        } catch (cancelError) {
          console.error(
            `[financeiro/alunos/${enrollmentId}] Erro ao cancelar boleto Cora:`,
            cancelError
          )
        }

        // Emitir NFSe (se habilitado) e enviar e-mail de confirmação de pagamento + NF ao aluno
        let nfInfo: { numero?: string; pdfUrl?: string; disponivel: boolean } | undefined
        try {
          const enrollmentFull = await prisma.enrollment.findUnique({
            where: { id: enrollmentId },
            include: {
              user: { select: { email: true } },
              paymentInfo: true,
            },
          })
          if (!enrollmentFull) throw new Error('Enrollment não encontrado')

          const finance = getEnrollmentFinanceData(enrollmentFull)
          const valorMensal =
            enrollmentFull.valorMensalidade != null
              ? Number(enrollmentFull.valorMensalidade)
              : enrollmentFull.paymentInfo?.valorMensal != null
                ? Number(enrollmentFull.paymentInfo.valorMensal)
                : null
          const amount = valorMensal ?? 0
          const paymentDate = dataUltimoPagamento ? new Date(dataUltimoPagamento) : new Date()

          if (NFSE_ENABLED && (finance.cpf || finance.cnpj) && amount > 0) {
            try {
              const nota = await emitirNfseParaAluno({
                enrollmentId,
                studentName: finance.nome,
                cpf: finance.cpf || undefined,
                cnpj: finance.cnpj || undefined,
                email: finance.email || undefined,
                amount,
                year,
                month,
                alunoNome: enrollmentFull.nome,
                frequenciaSemanal: enrollmentFull.frequenciaSemanal ?? undefined,
                curso: enrollmentFull.curso ?? undefined,
                customDescricaoEmpresa: enrollmentFull.faturamentoDescricaoNfse ?? undefined,
              })
              if (nota.status === 'autorizado' && nota.numero) {
                nfInfo = {
                  numero: nota.numero,
                  pdfUrl: nota.pdfUrl,
                  disponivel: true,
                }
              }
            } catch (nfErr) {
              console.error(
                `[financeiro/alunos/${enrollmentId}] Erro ao emitir NFSe ao marcar como PAGO:`,
                nfErr
              )
            }
          }

          const nfseSerahEnviada = NFSE_ENABLED && !nfInfo?.disponivel
          await sendPaymentConfirmation(
            enrollmentFull,
            amount,
            paymentDate,
            year,
            month,
            nfseSerahEnviada,
            nfInfo
          )
        } catch (emailErr) {
          console.error(
            `[financeiro/alunos/${enrollmentId}] Erro ao enviar confirmação de pagamento:`,
            emailErr
          )
        }
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
