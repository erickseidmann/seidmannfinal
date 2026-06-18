/**
 * POST /api/admin/financeiro/boletos-e-lembretes
 * Gera boleto/PIX na Cora para alunos elegíveis do mês e envia e-mail de lembrete.
 * Nunca gera boleto duplicado: quem já tem cobrança no mês ou não paga por boleto é ignorado.
 */

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/auth'
import { getEnrollmentFinanceData } from '@/lib/finance'
import { sendEmail, lembretePagamentoContent } from '@/lib/email'
import { generateMonthlyBilling } from '@/lib/cora/billing'
import {
  enrollmentEligibleForBoleto,
} from '@/lib/boleto-eligibility'
import { enrollmentReceivesBillingMessages } from '@/lib/bolsista-payment'

const bodySchema = z.object({
  year: z.number().int().min(2020).max(2100),
  month: z.number().int().min(1).max(12),
})

function nextDueDateFromDay(dayOfMonth: number, year: number, month: number): Date {
  const lastDay = new Date(year, month, 0).getDate()
  const day = Math.min(dayOfMonth, lastDay)
  return new Date(year, month - 1, day)
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAdmin(request)
    if (!auth.authorized) {
      return NextResponse.json(
        { ok: false, message: auth.message || 'Não autorizado' },
        { status: auth.message?.includes('Não autenticado') ? 401 : 403 }
      )
    }

    const hasCert = !!(process.env.CORA_CERT_PATH || process.env.CORA_CERTIFICATE_PATH)
    const hasKey = !!(process.env.CORA_KEY_PATH || process.env.CORA_PRIVATE_KEY_PATH)
    if (!process.env.CORA_CLIENT_ID || !hasCert || !hasKey) {
      return NextResponse.json(
        { ok: false, message: 'Cora não configurada. Configure certificados e CORA_CLIENT_ID.' },
        { status: 503 }
      )
    }

    const body = await request.json().catch(() => ({}))
    const parsed = bodySchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { ok: false, message: 'Dados inválidos. Envie year e month.' },
        { status: 400 }
      )
    }
    const { year, month } = parsed.data
    const performedBy = auth.session?.sub ?? 'SYSTEM'

    const enrollments = await prisma.enrollment.findMany({
      where: {
        status: 'ACTIVE',
        bolsista: false,
        OR: [
          { valorMensalidade: { not: null } },
          { paymentInfo: { valorMensal: { not: null } } },
        ],
      },
      include: {
        paymentInfo: true,
        user: { select: { email: true } },
      },
    })

    const paidRecords = await prisma.enrollmentPaymentMonth.findMany({
      where: { year, month, paymentStatus: 'PAGO' },
      select: { enrollmentId: true },
    })
    const paidSet = new Set(paidRecords.map((r) => r.enrollmentId))

    const existingInvoices = await prisma.coraInvoice.findMany({
      where: { year, month },
      select: { enrollmentId: true },
    })
    const invoiceSet = new Set(existingInvoices.map((r) => r.enrollmentId))

    const boletoErrors: Array<{ name: string; error: string }> = []
    const newlyCreatedIds: string[] = []
    let skippedExisting = 0
    let skippedPaid = 0
    let skippedIneligible = 0

    for (const enrollment of enrollments) {
      if (paidSet.has(enrollment.id)) {
        skippedPaid++
        continue
      }

      if (invoiceSet.has(enrollment.id)) {
        skippedExisting++
        continue
      }

      if (!enrollmentEligibleForBoleto(enrollment)) {
        skippedIneligible++
        continue
      }

      try {
        const result = await generateMonthlyBilling({
          enrollmentId: enrollment.id,
          year,
          month,
          performedBy,
        })
        if (result.created) {
          newlyCreatedIds.push(enrollment.id)
          invoiceSet.add(enrollment.id)
        } else {
          skippedExisting++
        }
      } catch (error) {
        boletoErrors.push({
          name: enrollment.nome,
          error: error instanceof Error ? error.message : String(error),
        })
      }
    }

    if (newlyCreatedIds.length === 0 && skippedExisting > 0 && boletoErrors.length === 0) {
      return NextResponse.json({
        ok: true,
        boletosGerados: 0,
        boletosJaExistiam: skippedExisting,
        boletosIgnoradosPagos: skippedPaid,
        boletosIgnoradosInelegiveis: skippedIneligible,
        emailsEnviados: 0,
        emailsErros: 0,
        message:
          'Nenhum boleto novo gerado: todos os alunos elegíveis deste mês já possuem cobrança ou não pagam por boleto.',
      })
    }

    const coraInvoices = await prisma.coraInvoice.findMany({
      where: {
        enrollmentId: { in: newlyCreatedIds },
        year,
        month,
      },
      select: {
        enrollmentId: true,
        boletoUrl: true,
        digitableLine: true,
        pixCopyPaste: true,
        pixQrCode: true,
      },
    })
    const invoiceByEnrollment = new Map(
      coraInvoices.map((inv) => [
        inv.enrollmentId,
        {
          boletoUrl: inv.boletoUrl ?? null,
          boletoDigitableLine: inv.digitableLine ?? null,
          pixEmv: inv.pixCopyPaste ?? null,
          pixQrCodeUrl: inv.pixQrCode ?? null,
        },
      ])
    )

    let emailsEnviados = 0
    const emailErrors: Array<{ name: string; error: string }> = []

    for (const enrollmentId of newlyCreatedIds) {
      const enrollment = await prisma.enrollment.findUnique({
        where: { id: enrollmentId },
        include: { paymentInfo: true, user: { select: { email: true } } },
      })
      if (!enrollment) continue
      if (!enrollmentReceivesBillingMessages(enrollment).ok) continue
      const finance = getEnrollmentFinanceData(enrollment)
      const email = finance.email?.trim()
      if (!email) continue

      const valorMensal = Number(enrollment.valorMensalidade ?? enrollment.paymentInfo?.valorMensal ?? 0)
      const valorStr = valorMensal > 0 ? `R$ ${valorMensal.toFixed(2).replace('.', ',')}` : 'conforme combinado'
      const dia = enrollment.diaPagamento ?? enrollment.paymentInfo?.dueDay ?? 10
      const vencimento = nextDueDateFromDay(dia, year, month)
      const vencimentoStr = vencimento.toLocaleDateString('pt-BR')

      const paymentData = invoiceByEnrollment.get(enrollmentId)
      const { subject, text, html } = lembretePagamentoContent({
        nome: finance.nome,
        valorStr,
        vencimentoStr,
        boletoUrl: paymentData?.boletoUrl ?? null,
        boletoDigitableLine: paymentData?.boletoDigitableLine ?? null,
        pixEmv: paymentData?.pixEmv ?? null,
        pixQrCodeUrl: paymentData?.pixQrCodeUrl ?? null,
      })
      try {
        const sent = await sendEmail({ to: email, subject, text, html })
        if (sent) emailsEnviados++
      } catch (err) {
        emailErrors.push({
          name: enrollment.nome,
          error: err instanceof Error ? err.message : String(err),
        })
      }
    }

    return NextResponse.json({
      ok: true,
      boletosGerados: newlyCreatedIds.length,
      boletosJaExistiam: skippedExisting,
      boletosIgnoradosPagos: skippedPaid,
      boletosIgnoradosInelegiveis: skippedIneligible,
      boletosErros: boletoErrors.length,
      emailsEnviados,
      emailsErros: emailErrors.length,
      errors: boletoErrors.length > 0 ? boletoErrors : undefined,
      emailErrors: emailErrors.length > 0 ? emailErrors : undefined,
    })
  } catch (error) {
    console.error('[api/admin/financeiro/boletos-e-lembretes POST]', error)
    return NextResponse.json(
      { ok: false, message: error instanceof Error ? error.message : 'Erro ao processar' },
      { status: 500 }
    )
  }
}
