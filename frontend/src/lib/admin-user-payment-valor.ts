import type { PrismaClient } from '@prisma/client'

export function moneyEquals(a: number, b: number): boolean {
  return Math.round(a * 100) === Math.round(b * 100)
}

/** Último valor aprovado (`valor`) em mês anterior ao competência informada. */
export async function getPreviousApprovedAdminValor(
  prisma: PrismaClient,
  userId: string,
  year: number,
  month: number
): Promise<number | null> {
  const row = await prisma.adminUserPaymentMonth.findFirst({
    where: {
      userId,
      valor: { not: null },
      OR: [{ year: { lt: year } }, { year, month: { lt: month } }],
    },
    select: { valor: true },
    orderBy: [{ year: 'desc' }, { month: 'desc' }],
  })
  return row?.valor != null ? Number(row.valor) : null
}

/** Valor de referência para comparar proposta: aprovado no mês ou último mês anterior. */
export function resolveAdminValorReference(
  currentApproved: number | null,
  previousApproved: number | null
): number | null {
  return currentApproved ?? previousApproved
}

/** Proposta igual à referência não exige aprovação do super admin. */
export function shouldAutoApproveAdminValor(
  proposed: number,
  reference: number | null
): boolean {
  if (reference == null) return false
  return moneyEquals(proposed, reference)
}
