/**
 * Funções de cron jobs - chamadas pelo scheduler ou por endpoints manuais.
 */

import { prisma } from '@/lib/prisma'
import { logFinanceAction, getEnrollmentFinanceData } from '@/lib/finance'
import {
  sendPaymentReminder,
  sendPaymentOverdueReminder,
  sendEnrollmentDeactivated,
} from '@/lib/email/payment-notifications'
import { generateMonthlyBilling } from '@/lib/cora/billing'
import { atualizarStatusNfse } from '@/lib/nfse/service'
import { emitirNfse, generateNfseRef } from '@/lib/nfse/client'
import { buildNfsePayload } from '@/lib/nfse/builder'

const TOLERANCE_DAYS = 3
const BATCH_SIZE = 50
const DELAY_MS = 1000
const BILLING_BATCH = 20
const BILLING_DELAY = 2000
const DAYS_BEFORE_DUE = 15

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

export async function runMarkOverdue(): Promise<{
  ok: boolean
  totalEnrollments: number
  markedOverdue: number
  skipped: number
  year: number
  month: number
}> {
  const now = new Date()
  const year = now.getFullYear()
  const month = now.getMonth() + 1
  const dayOfMonth = now.getDate()

  const enrollments = await prisma.enrollment.findMany({
    where: { status: 'ACTIVE' },
    select: {
      id: true,
      nome: true,
      diaPagamento: true,
      paymentInfo: { select: { dueDay: true } },
    },
  })

  let markedOverdue = 0
  let skipped = 0

  for (const enrollment of enrollments) {
    const dueDay = enrollment.diaPagamento ?? enrollment.paymentInfo?.dueDay ?? null
    if (dueDay == null || dueDay < 1 || dueDay > 31) {
      skipped++
      continue
    }
    if (dayOfMonth <= dueDay + TOLERANCE_DAYS) {
      skipped++
      continue
    }
    const existing = await prisma.enrollmentPaymentMonth.findUnique({
      where: { enrollmentId_year_month: { enrollmentId: enrollment.id, year, month } },
      select: { paymentStatus: true },
    })
    if (existing?.paymentStatus === 'PAGO' || existing?.paymentStatus === 'ATRASADO') {
      skipped++
      continue
    }
    const oldStatus = existing?.paymentStatus ?? null
    await prisma.enrollmentPaymentMonth.upsert({
      where: { enrollmentId_year_month: { enrollmentId: enrollment.id, year, month } },
      create: { enrollmentId: enrollment.id, year, month, paymentStatus: 'ATRASADO' },
      update: { paymentStatus: 'ATRASADO' },
    })
    logFinanceAction({
      entityType: 'ENROLLMENT',
      entityId: enrollment.id,
      action: 'OVERDUE_MARKED',
      oldValue: { paymentStatus: oldStatus },
      newValue: { paymentStatus: 'ATRASADO', year, month, dueDay },
      performedBy: 'CRON_JOB',
    }).catch(() => {})
    markedOverdue++
  }

  return {
    ok: true,
    totalEnrollments: enrollments.length,
    markedOverdue,
    skipped,
    year,
    month,
  }
}

export async function runNfseStatus(): Promise<{
  ok: boolean
  processadas: number
  autorizadas: number
  erros: number
  pendentes: number
  message?: string
}> {
  if (process.env.NFSE_ENABLED !== 'true') {
    return { ok: true, processadas: 0, autorizadas: 0, erros: 0, pendentes: 0, message: 'NFSe desabilitada' }
  }

  const doisMinutosAtras = new Date()
  doisMinutosAtras.setMinutes(doisMinutosAtras.getMinutes() - 2)

  const notasPendentes = await prisma.nfseInvoice.findMany({
    where: {
      status: 'processando_autorizacao',
      criadoEm: { lt: doisMinutosAtras },
    },
    select: { id: true, focusRef: true, studentName: true },
  })

  let processadas = 0
  let autorizadas = 0
  let erros = 0

  for (const nota of notasPendentes) {
    try {
      const notaAtualizada = await atualizarStatusNfse(nota.focusRef)
      processadas++
      if (notaAtualizada.status === 'autorizado') autorizadas++
      else if (notaAtualizada.status === 'erro_autorizacao') erros++
    } catch {
      // ignore
    }
  }

  return {
    ok: true,
    processadas,
    autorizadas,
    erros,
    pendentes: notasPendentes.length,
  }
}

export async function runNfseRetry(): Promise<{
  ok: boolean
  tentativas: number
  sucesso: number
  falha: number
  totalComErro: number
  message?: string
}> {
  if (process.env.NFSE_ENABLED !== 'true') {
    return { ok: true, tentativas: 0, sucesso: 0, falha: 0, totalComErro: 0, message: 'NFSe desabilitada' }
  }

  const vinteQuatroHorasAtras = new Date()
  vinteQuatroHorasAtras.setHours(vinteQuatroHorasAtras.getHours() - 24)

  const notasComErro = await prisma.nfseInvoice.findMany({
    where: {
      status: 'erro_autorizacao',
      criadoEm: { gte: vinteQuatroHorasAtras },
    },
    include: {
      enrollment: {
        include: {
          user: { select: { email: true } },
          paymentInfo: true,
        },
      },
    },
  })

  let tentativas = 0
  let sucesso = 0
  let falha = 0
  const cincoMinutosAtras = new Date()
  cincoMinutosAtras.setMinutes(cincoMinutosAtras.getMinutes() - 5)

  for (const nota of notasComErro) {
    if (nota.atualizadoEm > cincoMinutosAtras) continue
    const enrollment = nota.enrollment
    if (!enrollment) {
      falha++
      continue
    }
    const finance = getEnrollmentFinanceData(enrollment)
    const valorMensalidade =
      enrollment.valorMensalidade != null
        ? Number(enrollment.valorMensalidade)
        : enrollment.paymentInfo?.valorMensal != null
          ? Number(enrollment.paymentInfo.valorMensal)
          : null
    if (!finance.cpf || !valorMensalidade || valorMensalidade <= 0) {
      falha++
      continue
    }
    tentativas++
    try {
      const novaRef = generateNfseRef(nota.enrollmentId, nota.year, nota.month)
      const payload = buildNfsePayload({
        studentName: finance.nome,
        cpf: finance.cpf,
        email: finance.email || undefined,
        amount: valorMensalidade,
        year: nota.year,
        month: nota.month,
      })
      const response = await emitirNfse(novaRef, payload)
      await prisma.nfseInvoice.update({
        where: { id: nota.id },
        data: {
          focusRef: novaRef,
          status: response.status,
          numero: response.numero || null,
          codigoVerificacao: response.codigo_verificacao || null,
          pdfUrl: response.url || null,
          xmlUrl: response.caminho_xml_nota_fiscal || null,
          errorMessage: response.mensagem || null,
        },
      })
      if (response.status === 'autorizado' || response.status === 'processando_autorizacao') sucesso++
      else falha++
    } catch (err) {
      falha++
      await prisma.nfseInvoice.update({
        where: { id: nota.id },
        data: { errorMessage: `Tentativa de reemissão falhou: ${err instanceof Error ? err.message : String(err)}` },
      })
    }
  }

  return { ok: true, tentativas, sucesso, falha, totalComErro: notasComErro.length }
}

function nextDueDateForMonth(year: number, month: number, dueDay: number): Date {
  const lastDay = new Date(year, month, 0).getDate()
  const safeDay = Math.min(dueDay, lastDay)
  return new Date(year, month - 1, safeDay)
}

function daysDiff(from: Date, to: Date): number {
  return Math.ceil((to.getTime() - from.getTime()) / (24 * 60 * 60 * 1000))
}

export async function runPaymentNotifications(): Promise<{
  ok: boolean
  year: number
  month: number
  totalEnrollments: number
  sentReminders: number
  sentOverdue: number
  deactivated: number
  errors: number
  skippedNoEmail: number
  skippedPaid: number
}> {
  const now = new Date()
  const year = now.getFullYear()
  const month = now.getMonth() + 1
  const today = new Date(year, month - 1, now.getDate())

  const enrollments = await prisma.enrollment.findMany({
    where: { status: 'ACTIVE' },
    include: {
      paymentInfo: { select: { dueDay: true, dueDate: true, paidAt: true, valorMensal: true } },
      user: { select: { email: true } },
    },
  })

  let sentReminders = 0
  let sentOverdue = 0
  let deactivated = 0
  let errors = 0
  let skippedNoEmail = 0
  let skippedPaid = 0

  for (let i = 0; i < enrollments.length; i++) {
    if (i > 0 && i % BATCH_SIZE === 0) await sleep(DELAY_MS)
    const enrollment = enrollments[i]
    const dueDay = enrollment.diaPagamento ?? enrollment.paymentInfo?.dueDay ?? null
    if (dueDay == null || dueDay < 1 || dueDay > 31) continue

    const dueDate = nextDueDateForMonth(year, month, dueDay)
    const paymentMonth = await prisma.enrollmentPaymentMonth.findUnique({
      where: { enrollmentId_year_month: { enrollmentId: enrollment.id, year, month } },
      select: { paymentStatus: true },
    })
    if (paymentMonth?.paymentStatus === 'PAGO') {
      skippedPaid++
      continue
    }

    const finance = getEnrollmentFinanceData(enrollment)
    const email = finance.email?.trim()
    if (!email) {
      skippedNoEmail++
      continue
    }

    const daysUntilDue = dueDate > today ? daysDiff(today, dueDate) : 0
    const daysOverdue = dueDate <= today ? daysDiff(dueDate, today) : 0

    const checkAlreadySent = async (type: string) => {
      const found = await prisma.paymentNotification.findUnique({
        where: {
          enrollmentId_type_year_month: {
            enrollmentId: enrollment.id,
            type,
            year,
            month,
          },
        },
      })
      return !!found
    }

    const fullEnrollment = {
      ...enrollment,
      valorMensalidade: enrollment.valorMensalidade,
      diaPagamento: enrollment.diaPagamento,
      paymentInfo: enrollment.paymentInfo,
      user: enrollment.user,
    }

    if (daysUntilDue > 0) {
      if (daysUntilDue === 10) {
        if (!(await checkAlreadySent('reminder_10'))) {
          const r = await sendPaymentReminder(fullEnrollment, 10, year, month)
          if (r.sent) sentReminders++
          else errors++
          await sleep(DELAY_MS)
        }
      } else if (daysUntilDue === 5) {
        if (!(await checkAlreadySent('reminder_5'))) {
          const r = await sendPaymentReminder(fullEnrollment, 5, year, month)
          if (r.sent) sentReminders++
          else errors++
          await sleep(DELAY_MS)
        }
      } else if (daysUntilDue === 3) {
        if (!(await checkAlreadySent('reminder_3'))) {
          const r = await sendPaymentReminder(fullEnrollment, 3, year, month)
          if (r.sent) sentReminders++
          else errors++
          await sleep(DELAY_MS)
        }
      }
    } else if (daysOverdue >= 1 && daysOverdue <= 8) {
      const type = `overdue_${daysOverdue}`
      if (!(await checkAlreadySent(type))) {
        const r = await sendPaymentOverdueReminder(fullEnrollment, daysOverdue, year, month)
        if (r.sent) sentOverdue++
        else errors++
        await sleep(DELAY_MS)
      }
    } else if (daysOverdue > 8) {
      if (!(await checkAlreadySent('deactivated'))) {
        await prisma.enrollment.update({
          where: { id: enrollment.id },
          data: { status: 'INACTIVE', inactiveAt: now },
        })
        logFinanceAction({
          entityType: 'ENROLLMENT',
          entityId: enrollment.id,
          action: 'AUTO_DEACTIVATED_OVERDUE',
          newValue: { daysOverdue, year, month },
          performedBy: 'CRON_PAYMENT_NOTIFICATIONS',
        }).catch(() => {})
        const r = await sendEnrollmentDeactivated(fullEnrollment, year, month)
        if (r.sent) deactivated++
        else errors++
        await sleep(DELAY_MS)
      }
    }
  }

  return {
    ok: true,
    year,
    month,
    totalEnrollments: enrollments.length,
    sentReminders,
    sentOverdue,
    deactivated,
    errors,
    skippedNoEmail,
    skippedPaid,
  }
}

function getLastDayOfMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate()
}

export async function runGenerateInvoices(): Promise<{
  ok: boolean
  totalEnrollments: number
  generated: number
  errors: number
  errorDetails: Array<{ enrollmentId: string; nome: string; error: string }>
}> {
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())

  const enrollments = await prisma.enrollment.findMany({
    where: {
      status: 'ACTIVE',
      AND: [
        { OR: [{ diaPagamento: { not: null } }, { paymentInfo: { dueDay: { not: null } } }] },
        { OR: [{ valorMensalidade: { not: null } }, { paymentInfo: { valorMensal: { not: null } } }] },
      ],
    },
    include: { paymentInfo: { select: { dueDay: true, valorMensal: true } } },
  })

  let generated = 0
  const errors: Array<{ enrollmentId: string; nome: string; error: string }> = []

  for (let i = 0; i < enrollments.length; i++) {
    if (i > 0 && i % BILLING_BATCH === 0) await sleep(BILLING_DELAY)
    const e = enrollments[i]
    const dueDay = e.diaPagamento ?? e.paymentInfo?.dueDay ?? 10
    if (dueDay < 1 || dueDay > 31) continue

    const year = now.getFullYear()
    const month = now.getMonth() + 1
    const lastDay = getLastDayOfMonth(year, month)
    const safeDay = Math.min(dueDay, lastDay)
    const dueDate = new Date(year, month - 1, safeDay)
    const diffDays = Math.ceil((dueDate.getTime() - today.getTime()) / (24 * 60 * 60 * 1000))
    if (diffDays > DAYS_BEFORE_DUE) continue

    const exists = await prisma.coraInvoice.findUnique({
      where: { enrollmentId_year_month: { enrollmentId: e.id, year, month } },
    })
    if (exists) continue

    const paid = await prisma.enrollmentPaymentMonth.findUnique({
      where: { enrollmentId_year_month: { enrollmentId: e.id, year, month } },
      select: { paymentStatus: true },
    })
    if (paid?.paymentStatus === 'PAGO') continue

    try {
      await generateMonthlyBilling({
        enrollmentId: e.id,
        year,
        month,
        performedBy: 'CRON_GENERATE_INVOICES',
      })
      generated++
      await sleep(BILLING_DELAY)
    } catch (err) {
      errors.push({
        enrollmentId: e.id,
        nome: e.nome,
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }

  return {
    ok: true,
    totalEnrollments: enrollments.length,
    generated,
    errors: errors.length,
    errorDetails: errors.slice(0, 10),
  }
}
