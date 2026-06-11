import type { PrismaClient } from '@prisma/client'
import { getPreviousApprovedAdminValor, shouldAutoApproveAdminValor } from '@/lib/admin-user-payment-valor'

export type AdminMyFinanceSummary = {
  userId: string
  nome: string
  funcao: string | null
  year: number
  month: number
  valorAdm: number | null
  valorRepetido: boolean
  valorProfessorAulas: number | null
  totalAReceber: number
  paymentDueDay: number | null
  paymentStatus: 'PAGO' | 'EM_ABERTO' | null
  paidAt: string | null
  receiptUrl: string | null
  valorPendente: number | null
  linkedTeacherNome: string | null
}

export async function buildAdminMyFinanceSummary(
  prisma: PrismaClient,
  params: {
    userId: string
    year: number
    month: number
    valorProfessorAulas?: number | null
  }
): Promise<AdminMyFinanceSummary | null> {
  const user = await prisma.user.findFirst({
    where: { id: params.userId, role: 'ADMIN' },
    select: {
      id: true,
      nome: true,
      funcao: true,
      adminPaymentDueDay: true,
      linkedTeacherId: true,
      linkedTeacher: { select: { nome: true, paymentDueDay: true } },
    },
  })
  if (!user) return null

  let valor: number | null = null
  let valorRepetido: number | null = null
  let paymentStatus: 'PAGO' | 'EM_ABERTO' | null = null
  let paidAt: string | null = null
  let receiptUrl: string | null = null
  let valorPendente: number | null = null

  if (prisma.adminUserPaymentMonth) {
    const pm = await prisma.adminUserPaymentMonth.findUnique({
      where: {
        userId_year_month: {
          userId: params.userId,
          year: params.year,
          month: params.month,
        },
      },
    })

    valor = pm?.valor != null ? Number(pm.valor) : null
    paymentStatus =
      pm?.paymentStatus === 'PAGO'
        ? 'PAGO'
        : pm?.paymentStatus === 'EM_ABERTO'
          ? 'EM_ABERTO'
          : null
    paidAt = pm?.paidAt?.toISOString() ?? null
    receiptUrl = pm?.receiptUrl ?? null
    valorPendente = pm?.valorPendente != null ? Number(pm.valorPendente) : null

    if (valor == null) {
      const prev = await getPreviousApprovedAdminValor(prisma, params.userId, params.year, params.month)
      if (prev != null) valorRepetido = prev
    }

    if (
      pm &&
      valorPendente != null &&
      valorRepetido != null &&
      shouldAutoApproveAdminValor(valorPendente, valorRepetido)
    ) {
      await prisma.adminUserPaymentMonth.update({
        where: { userId_year_month: { userId: params.userId, year: params.year, month: params.month } },
        data: { valor: valorRepetido, valorPendente: null, valorPendenteRequestedAt: null },
      })
      valor = valorRepetido
      valorPendente = null
    }
  }

  const valorAdmEfetivo = valor ?? valorRepetido
  const aulas = params.valorProfessorAulas ?? null
  const totalAReceber =
    Math.round(
      ((valorAdmEfetivo ?? 0) + (user.linkedTeacherId != null && aulas != null ? aulas : 0)) * 100
    ) / 100

  const paymentDueDay =
    user.linkedTeacherId != null
      ? (user.linkedTeacher?.paymentDueDay ?? null)
      : (user.adminPaymentDueDay ?? null)

  return {
    userId: user.id,
    nome: user.nome,
    funcao: user.funcao,
    year: params.year,
    month: params.month,
    valorAdm: valorAdmEfetivo,
    valorRepetido: valor == null && valorRepetido != null,
    valorProfessorAulas: user.linkedTeacherId != null ? aulas : null,
    totalAReceber,
    paymentDueDay,
    paymentStatus,
    paidAt,
    receiptUrl,
    valorPendente,
    linkedTeacherNome: user.linkedTeacher?.nome ?? null,
  }
}
