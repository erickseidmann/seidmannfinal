/**
 * Política de retenção de alertas/notificações.
 *
 * Regra única do produto (definida em conversa com o admin):
 * alertas e notificações ficam visíveis por NOTIFICATION_RETENTION_DAYS dias
 * após sua criação. Após esse prazo, somem das listas (admin, professor e aluno).
 *
 * Os registros NÃO são apagados do banco — apenas são filtrados nas consultas,
 * para preservar histórico/auditoria. Se um dia for necessário fazer cleanup,
 * basta criar um job que apague linhas mais antigas que essa janela.
 */

import type { Prisma } from '@prisma/client'

export const NOTIFICATION_RETENTION_DAYS = 30

/** Notificações do admin já lidas somem da lista após este prazo. */
export const ADMIN_NOTIFICATION_READ_VISIBILITY_HOURS = 1

/** Data mínima de criação para uma notificação/alerta ainda aparecer nas listas. */
export function notificationRetentionCutoff(now: Date = new Date()): Date {
  const d = new Date(now)
  d.setDate(d.getDate() - NOTIFICATION_RETENTION_DAYS)
  return d
}

export function adminNotificationReadVisibilityCutoff(now: Date = new Date()): Date {
  return new Date(now.getTime() - ADMIN_NOTIFICATION_READ_VISIBILITY_HOURS * 60 * 60 * 1000)
}

/** Filtro da lista do sininho admin: não lidas + lidas na última hora (dentro da retenção de 30 dias). */
export function adminNotificationListWhere(
  userId: string,
  now: Date = new Date()
): Prisma.AdminNotificationWhereInput {
  return {
    userId,
    criadoEm: { gte: notificationRetentionCutoff(now) },
    OR: [{ readAt: null }, { readAt: { gte: adminNotificationReadVisibilityCutoff(now) } }],
  }
}
