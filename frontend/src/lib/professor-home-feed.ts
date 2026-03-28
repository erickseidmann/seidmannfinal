/**
 * Prazo em que notificações e anúncios permanecem visíveis no painel do professor (Início / APIs).
 */

import type { Prisma } from '@prisma/client'

export const PROFESSOR_HOME_FEED_RETENTION_DAYS = 30

/** Data mínima de criação (notificações) ou envio/criação (anúncios) para ainda aparecer no feed. */
export function cutoffDateProfessorHomeFeed(): Date {
  const d = new Date()
  d.setDate(d.getDate() - PROFESSOR_HOME_FEED_RETENTION_DAYS)
  return d
}

/** Notificações já lidas somem da lista após este prazo (continuam dentro da janela de 30 dias acima). */
export const PROFESSOR_ALERT_READ_VISIBILITY_DAYS = 2

export function cutoffDateProfessorReadAlertsStillVisible(): Date {
  const d = new Date()
  d.setDate(d.getDate() - PROFESSOR_ALERT_READ_VISIBILITY_DAYS)
  return d
}

/** Anúncios para professores: últimos 30 dias a partir do envio (`sentAt`) ou, se não enviado, da criação. */
export function announcementWhereProfessorVisible(
  notOlderThan: Date
): Prisma.AnnouncementWhereInput {
  return {
    audience: { in: ['TEACHERS', 'ALL'] },
    OR: [
      { sentAt: { gte: notOlderThan } },
      { AND: [{ sentAt: null }, { criadoEm: { gte: notOlderThan } }] },
    ],
  }
}
