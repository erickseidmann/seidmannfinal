/**
 * Quando o pagamento do funcionário ADM é marcado como PAGO e há linkedTeacherId,
 * marca o TeacherPaymentMonth correspondente como PAGO (mesma regra do notify dos professores).
 */

import { prisma } from '@/lib/prisma'
import { syncTeacherPaymentMarkedPaidAt } from '@/lib/finance/teacher-payment-marked-paid-at'
import {
  findTeacherPaymentMonthByCompetenceBrt,
  upsertKeysForCompetenceMonth,
} from '@/lib/teacher-payment-month-db'

const MESES_NOMES: Record<number, string> = {
  1: 'janeiro',
  2: 'fevereiro',
  3: 'março',
  4: 'abril',
  5: 'maio',
  6: 'junho',
  7: 'julho',
  8: 'agosto',
  9: 'setembro',
  10: 'outubro',
  11: 'novembro',
  12: 'dezembro',
}

/**
 * @param competenceYear competenceMonth — mês da tela Administração (1–12)
 */
export async function markLinkedTeacherPaidForAdminCompetenceMonth(options: {
  teacherId: string
  competenceYear: number
  competenceMonth: number
  performedByUserId: string | null
}): Promise<void> {
  const { teacherId, competenceYear, competenceMonth, performedByUserId } = options

  const teacher = await prisma.teacher.findUnique({ where: { id: teacherId }, select: { id: true } })
  if (!teacher) return

  const existingByEnd = await findTeacherPaymentMonthByCompetenceBrt(
    teacherId,
    competenceYear,
    competenceMonth
  )
  const { year: keyYear, month: keyMonth } = upsertKeysForCompetenceMonth(
    competenceYear,
    competenceMonth,
    existingByEnd
  )

  const pmExisting = await prisma.teacherPaymentMonth.findUnique({
    where: { teacherId_year_month: { teacherId, year: keyYear, month: keyMonth } },
    select: { paymentStatus: true },
  })
  const previousStatus = pmExisting?.paymentStatus ?? null

  await prisma.teacherPaymentMonth.upsert({
    where: { teacherId_year_month: { teacherId, year: keyYear, month: keyMonth } },
    create: {
      teacherId,
      year: keyYear,
      month: keyMonth,
      paymentStatus: 'PAGO',
    },
    update: { paymentStatus: 'PAGO' },
  })

  await syncTeacherPaymentMarkedPaidAt(teacherId, keyYear, keyMonth, previousStatus, 'PAGO')

  if (previousStatus !== 'PAGO' && prisma.teacherAlert) {
    const mesNome = MESES_NOMES[competenceMonth] ?? String(competenceMonth)
    await prisma.teacherAlert.create({
      data: {
        teacherId,
        message: `Seu pagamento referente a ${mesNome} de ${competenceYear} foi confirmado.`,
        type: 'PAYMENT_DONE',
        level: 'INFO',
        createdById: performedByUserId,
      },
    })
  }
}
