/**
 * Serviço de envio de emails de notificação de pagamento.
 * Usa o mesmo SMTP/nodemailer configurado (Brevo em produção).
 */

import { prisma } from '@/lib/prisma'
import { sendEmail } from '@/lib/email'
import { getEnrollmentFinanceData } from '@/lib/finance'
import {
  buildPaymentReminderEmail,
  buildPaymentOverdueReminderEmail,
  buildPaymentConfirmationEmail,
  buildEnrollmentDeactivatedEmail,
  type PaymentEmailEnrollment,
} from '@/lib/email/templates/payment'

export type PaymentNotificationType =
  | 'reminder_10'
  | 'reminder_5'
  | 'reminder_3'
  | `overdue_${number}`
  | 'payment_confirmed'
  | 'deactivated'

type EnrollmentWithPayment = {
  id: string
  nome: string
  email: string
  valorMensalidade: unknown
  diaPagamento: number | null
  paymentInfo: {
    valorMensal: unknown
    dueDay: number | null
    dueDate: Date | null
    paidAt: Date | null
  } | null
  user?: { email: string } | null
  nomeResponsavel?: string | null
  emailResponsavel?: string | null
  cpfResponsavel?: string | null
}

function toPaymentEmailEnrollment(
  enrollment: EnrollmentWithPayment,
  finance: { nome: string; email: string | null },
  valorMensal: number | null,
  dataVencimento: Date | null,
  instrucoes?: string | null
): PaymentEmailEnrollment {
  return {
    nome: finance.nome,
    valorMensal,
    dataVencimento,
    instrucoesPagamento: instrucoes ?? null,
  }
}

/** Próxima data de vencimento dado o dia do mês (1-31) */
function nextDueDateFromDay(dayOfMonth: number, afterDate?: Date): Date {
  const after = afterDate ?? new Date()
  const year = after.getFullYear()
  const month = after.getMonth()
  const safeDay = Math.min(dayOfMonth, new Date(year, month + 1, 0).getDate())
  const candidate = new Date(year, month, safeDay)
  if (candidate > after) return candidate
  const nextSafe = Math.min(dayOfMonth, new Date(year, month + 2, 0).getDate())
  return new Date(year, month + 1, nextSafe)
}

async function registerNotification(params: {
  enrollmentId: string
  type: PaymentNotificationType
  year: number
  month: number
  emailTo: string
  success: boolean
  errorMessage?: string | null
}): Promise<void> {
  try {
    await prisma.paymentNotification.upsert({
      where: {
        enrollmentId_type_year_month: {
          enrollmentId: params.enrollmentId,
          type: params.type,
          year: params.year,
          month: params.month,
        },
      },
      create: {
        enrollmentId: params.enrollmentId,
        type: params.type,
        year: params.year,
        month: params.month,
        emailTo: params.emailTo,
        success: params.success,
        errorMessage: params.errorMessage,
      },
      update: {
        sentAt: new Date(),
        emailTo: params.emailTo,
        success: params.success,
        errorMessage: params.errorMessage,
      },
    })
  } catch (err) {
    console.error('[payment-notifications] Erro ao registrar notificação:', err)
  }
}

/**
 * Envia lembrete ANTES do vencimento.
 * Retorna true se enviou com sucesso; false em caso de erro.
 */
export async function sendPaymentReminder(
  enrollment: EnrollmentWithPayment,
  daysUntilDue: number,
  year: number,
  month: number
): Promise<{ sent: boolean; error?: string }> {
  const finance = getEnrollmentFinanceData(enrollment)
  const email = finance.email?.trim()
  if (!email) {
    console.warn(`[payment-notifications] Enrollment ${enrollment.id} sem email - lembrete não enviado`)
    return { sent: false, error: 'Email vazio' }
  }

  const valorMensal =
    enrollment.valorMensalidade != null
      ? Number(enrollment.valorMensalidade)
      : enrollment.paymentInfo?.valorMensal != null
        ? Number(enrollment.paymentInfo.valorMensal)
        : null
  const diaPag = enrollment.diaPagamento ?? enrollment.paymentInfo?.dueDay ?? null
  let dataVenc: Date | null = enrollment.paymentInfo?.dueDate ? new Date(enrollment.paymentInfo.dueDate) : null
  if (!dataVenc && diaPag != null && diaPag >= 1 && diaPag <= 31) {
    dataVenc = nextDueDateFromDay(diaPag, new Date(year, month - 1, 1))
  }

  const payload = toPaymentEmailEnrollment(enrollment, finance, valorMensal, dataVenc, null)
  const { subject, text, html } = buildPaymentReminderEmail(payload, daysUntilDue)

  const sent = await sendEmail({ to: email, subject, text, html })
  const type: PaymentNotificationType = `reminder_${daysUntilDue}` as PaymentNotificationType
  await registerNotification({
    enrollmentId: enrollment.id,
    type,
    year,
    month,
    emailTo: email,
    success: sent,
    errorMessage: sent ? null : 'Falha no envio',
  })

  return sent ? { sent: true } : { sent: false, error: 'Falha no envio SMTP' }
}

/**
 * Envia lembrete DEPOIS do vencimento (em atraso).
 */
export async function sendPaymentOverdueReminder(
  enrollment: EnrollmentWithPayment,
  daysOverdue: number,
  year: number,
  month: number
): Promise<{ sent: boolean; error?: string }> {
  const finance = getEnrollmentFinanceData(enrollment)
  const email = finance.email?.trim()
  if (!email) {
    console.warn(`[payment-notifications] Enrollment ${enrollment.id} sem email - lembrete atraso não enviado`)
    return { sent: false, error: 'Email vazio' }
  }

  const valorMensal =
    enrollment.valorMensalidade != null
      ? Number(enrollment.valorMensalidade)
      : enrollment.paymentInfo?.valorMensal != null
        ? Number(enrollment.paymentInfo.valorMensal)
        : null
  const diaPag = enrollment.diaPagamento ?? enrollment.paymentInfo?.dueDay ?? null
  const dataVenc = new Date(year, month - 1, Math.min(diaPag ?? 10, new Date(year, month, 0).getDate()))

  const payload = toPaymentEmailEnrollment(enrollment, finance, valorMensal, dataVenc, null)
  const { subject, text, html } = buildPaymentOverdueReminderEmail(payload, daysOverdue)

  const sent = await sendEmail({ to: email, subject, text, html })
  const type: PaymentNotificationType = `overdue_${daysOverdue}` as PaymentNotificationType
  await registerNotification({
    enrollmentId: enrollment.id,
    type,
    year,
    month,
    emailTo: email,
    success: sent,
    errorMessage: sent ? null : 'Falha no envio',
  })

  return sent ? { sent: true } : { sent: false, error: 'Falha no envio SMTP' }
}

/**
 * Envia confirmação de pagamento.
 */
export async function sendPaymentConfirmation(
  enrollment: EnrollmentWithPayment,
  amount: number,
  paymentDate: Date,
  year: number,
  month: number,
  nfseSerahEnviada?: boolean
): Promise<{ sent: boolean; error?: string }> {
  const finance = getEnrollmentFinanceData(enrollment)
  const email = finance.email?.trim()
  if (!email) {
    console.warn(`[payment-notifications] Enrollment ${enrollment.id} sem email - confirmação não enviada`)
    return { sent: false, error: 'Email vazio' }
  }

  const { subject, text, html } = buildPaymentConfirmationEmail(
    { nome: finance.nome },
    amount,
    paymentDate,
    nfseSerahEnviada
  )

  const sent = await sendEmail({ to: email, subject, text, html })
  await registerNotification({
    enrollmentId: enrollment.id,
    type: 'payment_confirmed',
    year,
    month,
    emailTo: email,
    success: sent,
    errorMessage: sent ? null : 'Falha no envio',
  })

  return sent ? { sent: true } : { sent: false, error: 'Falha no envio SMTP' }
}

/**
 * Envia aviso de matrícula suspensa por inadimplência.
 */
export async function sendEnrollmentDeactivated(
  enrollment: EnrollmentWithPayment,
  year: number,
  month: number
): Promise<{ sent: boolean; error?: string }> {
  const finance = getEnrollmentFinanceData(enrollment)
  const email = finance.email?.trim()
  if (!email) {
    console.warn(`[payment-notifications] Enrollment ${enrollment.id} sem email - desativação não enviada`)
    return { sent: false, error: 'Email vazio' }
  }

  const { subject, text, html } = buildEnrollmentDeactivatedEmail({ nome: finance.nome })

  const sent = await sendEmail({ to: email, subject, text, html })
  await registerNotification({
    enrollmentId: enrollment.id,
    type: 'deactivated',
    year,
    month,
    emailTo: email,
    success: sent,
    errorMessage: sent ? null : 'Falha no envio',
  })

  return sent ? { sent: true } : { sent: false, error: 'Falha no envio SMTP' }
}
