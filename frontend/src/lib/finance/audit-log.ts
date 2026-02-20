/**
 * Audit log para mudanças financeiras.
 * Nunca quebra o fluxo principal: em caso de erro apenas loga em console.
 */

import { prisma } from '@/lib/prisma'
import type { FinanceAuditLog as PrismaFinanceAuditLog, Prisma } from '@prisma/client'

export async function logFinanceAction(params: {
  entityType: string
  entityId: string
  action: string
  oldValue?: Record<string, unknown> | null
  newValue?: Record<string, unknown> | null
  performedBy?: string | null
  metadata?: Record<string, unknown> | null
}): Promise<void> {
  try {
    await prisma.financeAuditLog.create({
      data: {
        entityType: params.entityType,
        entityId: params.entityId,
        action: params.action,
        oldValue: (params.oldValue ?? undefined) as Prisma.InputJsonValue | undefined,
        newValue: (params.newValue ?? undefined) as Prisma.InputJsonValue | undefined,
        performedBy: params.performedBy ?? null,
        metadata: (params.metadata ?? undefined) as Prisma.InputJsonValue | undefined,
      },
    })
  } catch (error) {
    console.error('[finance audit log]', error)
  }
}

export type FinanceAuditLog = PrismaFinanceAuditLog

export async function getFinanceHistory(
  entityType: string,
  entityId: string,
  limit?: number
): Promise<FinanceAuditLog[]> {
  try {
    const list = await prisma.financeAuditLog.findMany({
      where: { entityType, entityId },
      orderBy: { criadoEm: 'desc' },
      take: limit ?? 50,
    })
    return list
  } catch (error) {
    console.error('[finance audit getFinanceHistory]', error)
    return []
  }
}
