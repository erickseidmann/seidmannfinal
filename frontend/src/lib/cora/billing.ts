/**
 * Service de orquestração para cobranças Cora.
 * Gera faturas na Cora e atualiza EnrollmentPaymentMonth.
 */

import { createInvoice, getInvoice, cancelInvoice, createPixForInvoice, type CoraInvoice } from './client'
import { logFinanceAction, getEnrollmentFinanceData } from '@/lib/finance'
import { isValidCPF, validateEmail } from '@/lib/finance/validators'
import { prisma } from '@/lib/prisma'
import { Decimal } from '@prisma/client/runtime/library'
import {
  BOLETO_ALREADY_EXISTS_MESSAGE,
  BOLETO_NOT_ELIGIBLE_MESSAGE,
  boletoIneligibilityReason,
  enrollmentEligibleForBoleto,
} from '@/lib/boleto-eligibility'

const MESES = [
  'Janeiro',
  'Fevereiro',
  'Março',
  'Abril',
  'Maio',
  'Junho',
  'Julho',
  'Agosto',
  'Setembro',
  'Outubro',
  'Novembro',
  'Dezembro',
]

function getLastDayOfMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate()
}

function calculateDueDate(year: number, month: number, dueDay: number): string {
  const lastDay = getLastDayOfMonth(year, month)
  const day = Math.min(dueDay, lastDay)
  
  const dueDate = new Date(year, month - 1, day)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  
  // Se a data de vencimento já passou, usar hoje + 3 dias como mínimo
  if (dueDate < today) {
    const minDate = new Date(today)
    minDate.setDate(minDate.getDate() + 3)
    const minYear = minDate.getFullYear()
    const minMonth = minDate.getMonth() + 1
    const minDay = minDate.getDate()
    return `${minYear}-${String(minMonth).padStart(2, '0')}-${String(minDay).padStart(2, '0')}`
  }
  
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

function decimalToNumber(value: Decimal | null | undefined): number {
  if (!value) return 0
  return Number(value)
}

/**
 * Gera cobrança na Cora para um aluno em um mês específico.
 */
export async function generateMonthlyBilling(params: {
  enrollmentId: string
  year: number
  month: number
  performedBy: string
}): Promise<{ invoice: CoraInvoice; enrollmentPaymentMonth: any }> {
  const { enrollmentId, year, month, performedBy } = params

  if (month < 1 || month > 12) {
    throw new Error('Mês inválido (deve ser 1-12)')
  }

  const enrollment = await prisma.enrollment.findUnique({
    where: { id: enrollmentId },
    include: {
      user: { select: { email: true } },
      paymentInfo: true,
    },
  })

  if (!enrollment) {
    throw new Error('Matrícula não encontrada')
  }

  if (enrollment.status !== 'ACTIVE') {
    throw new Error(`Matrícula não está ativa (status: ${enrollment.status})`)
  }
  if ((enrollment as { bolsista?: boolean | null }).bolsista) {
    throw new Error(`Aluno bolsista (${enrollment.nome}) não deve gerar boleto.`)
  }

  if (!enrollmentEligibleForBoleto(enrollment as Parameters<typeof enrollmentEligibleForBoleto>[0])) {
    const reason = boletoIneligibilityReason(enrollment as Parameters<typeof boletoIneligibilityReason>[0])
    throw new Error(reason ? `${BOLETO_NOT_ELIGIBLE_MESSAGE} (${reason})` : BOLETO_NOT_ELIGIBLE_MESSAGE)
  }

  const existing = await prisma.coraInvoice.findUnique({
    where: { enrollmentId_year_month: { enrollmentId, year, month } },
  })
  if (existing) {
    const coraInvoice = await getInvoice(existing.coraInvoiceId)
    const epm = await prisma.enrollmentPaymentMonth.upsert({
      where: { enrollmentId_year_month: { enrollmentId, year, month } },
      create: { enrollmentId, year, month, paymentStatus: 'PENDING' },
      update: {},
    })
    return {
      invoice: coraInvoice,
      enrollmentPaymentMonth: epm,
      created: false as const,
    }
  }

  const finance = getEnrollmentFinanceData(enrollment)
  const cpf = finance.cpf
  if (!cpf || !cpf.trim()) {
    throw new Error(`CPF inválido para ${enrollment.nome}. Corrija antes de gerar a cobrança.`)
  }
  const cpfDigits = cpf.replace(/\D/g, '')
  if (!isValidCPF(cpfDigits)) {
    throw new Error(`CPF inválido para ${enrollment.nome}. Corrija antes de gerar a cobrança.`)
  }

  const valorMensalidade =
    decimalToNumber(enrollment.valorMensalidade) ||
    decimalToNumber(enrollment.paymentInfo?.valorMensal) ||
    0

  if (valorMensalidade <= 0 || valorMensalidade == null) {
    throw new Error(`Valor de mensalidade não definido para ${enrollment.nome}.`)
  }

  const email = finance.email
  if (!email || !email.trim()) {
    throw new Error(`Email inválido para ${enrollment.nome}. Corrija antes de gerar a cobrança.`)
  }
  const emailValidation = validateEmail(email)
  if (!emailValidation.valid) {
    throw new Error(`Email inválido para ${enrollment.nome}. Corrija antes de gerar a cobrança.`)
  }

  const dueDay = enrollment.diaPagamento ?? enrollment.paymentInfo?.dueDay ?? 10
  const dueDate = calculateDueDate(year, month, dueDay)

  const serviceName = `Mensalidade ${MESES[month - 1]} ${year} - Seidmann Institute`

  const amountCents = Math.round(valorMensalidade * 100)
  const code = `${enrollmentId}-${year}-${month}`

  const address =
    enrollment.cep && enrollment.rua && enrollment.cidade && enrollment.estado
      ? {
          street: (enrollment.rua ?? '').trim(),
          number: (enrollment.numero ?? 'S/N').trim() || 'S/N',
          district: '',
          city: (enrollment.cidade ?? '').trim(),
          state: (enrollment.estado ?? '').replace(/\s/g, '').slice(0, 2).toUpperCase(),
          zipCode: (enrollment.cep ?? '').replace(/\D/g, ''),
          complement: enrollment.complemento?.trim(),
        }
      : undefined

  const invoice = await createInvoice({
    code,
    customerName: finance.nome,
    customerDocument: cpf.replace(/\D/g, ''),
    customerEmail: email,
    serviceName,
    amountCents,
    dueDate,
    address,
    finePercent: 2,
    interestPercent: 1,
    notifications: {
      beforeDays: [3, 1],
      afterDays: [1, 3, 7],
    },
  })

  const bankSlip = invoice.payment_options?.bank_slip
  const pix = invoice.payment_options?.pix

  try {
    await prisma.coraInvoice.create({
      data: {
        enrollmentId,
        coraInvoiceId: invoice.id,
        code,
        year,
        month,
        amount: amountCents,
        dueDate: new Date(dueDate),
        status: invoice.status ?? 'OPEN',
        digitableLine: bankSlip?.digitable_line ?? null,
        barCode: bankSlip?.barcode ?? null,
        pixQrCode: pix?.qr_code ?? pix?.qr_code_url ?? null,
        pixCopyPaste: pix?.emv ?? null,
        boletoUrl: bankSlip?.url ?? null,
      },
    })
  } catch (dbErr: unknown) {
    const code = (dbErr as { code?: string })?.code
    if (code === 'P2002') {
      throw new Error(BOLETO_ALREADY_EXISTS_MESSAGE)
    }
    throw dbErr
  }

  const enrollmentPaymentMonth = await prisma.enrollmentPaymentMonth.upsert({
    where: {
      enrollmentId_year_month: { enrollmentId, year, month },
    },
    create: {
      enrollmentId,
      year,
      month,
      paymentStatus: 'PENDING',
    },
    update: {
      paymentStatus: 'PENDING',
    },
  })

  await logFinanceAction({
    entityType: 'ENROLLMENT',
    entityId: enrollmentId,
    action: 'INVOICE_CREATED',
    oldValue: null,
    newValue: {
      coraInvoiceId: invoice.id,
      amountCents,
      dueDate,
      year,
      month,
    },
    performedBy,
    metadata: {
      coraInvoiceId: invoice.id,
      coraStatus: invoice.status,
      serviceName,
      customerName: finance.nome,
    },
  }).catch(() => {})

  return { invoice, enrollmentPaymentMonth, created: true as const }
}

/**
 * Gera cobranças em lote para todos os alunos ativos de um mês.
 */
export async function generateBulkBilling(params: {
  year: number
  month: number
  performedBy: string
}): Promise<{ success: number; skippedPaid: number; skippedExisting: number; skippedIneligible: number; errors: Array<{ enrollmentId: string; name: string; error: string }> }> {
  const { year, month, performedBy } = params

  const enrollments = await prisma.enrollment.findMany({
    where: {
      status: 'ACTIVE',
      OR: [
        { valorMensalidade: { not: null } },
        { paymentInfo: { valorMensal: { not: null } } },
      ],
      bolsista: false,
    },
    select: {
      id: true,
      nome: true,
      valorMensalidade: true,
      bolsista: true,
      faturamentoTipo: true,
      metodoPagamento: true,
      paymentInfo: { select: { valorMensal: true, metodo: true } },
    },
  })

  // Buscar todos os pagamentos já confirmados para este mês de uma vez
  const paidRecords = await prisma.enrollmentPaymentMonth.findMany({
    where: { year, month, paymentStatus: { in: ['PAGO', 'REMOVIDO'] } },
    select: { enrollmentId: true },
  })
  const blockedMonthSet = new Set(paidRecords.map((r) => r.enrollmentId))

  // Buscar boletos já existentes para este mês de uma vez
  const existingInvoices = await prisma.coraInvoice.findMany({
    where: { year, month },
    select: { enrollmentId: true },
  })
  const invoiceSet = new Set(existingInvoices.map((r) => r.enrollmentId))

  const errors: Array<{ enrollmentId: string; name: string; error: string }> = []
  let success = 0
  let skippedPaid = 0
  let skippedExisting = 0
  let skippedIneligible = 0

  for (const enrollment of enrollments) {
    if (blockedMonthSet.has(enrollment.id)) {
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
        success++
        invoiceSet.add(enrollment.id)
      } else {
        skippedExisting++
      }
    } catch (error) {
      errors.push({
        enrollmentId: enrollment.id,
        name: enrollment.nome,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  return { success, skippedPaid, skippedExisting, skippedIneligible, errors }
}
