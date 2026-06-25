/**
 * Prazo em que anúncios permanecem visíveis no painel do aluno.
 */

import type { Prisma } from '@prisma/client'

export const STUDENT_HOME_FEED_RETENTION_DAYS = 30

export function cutoffDateStudentHomeFeed(): Date {
  const d = new Date()
  d.setDate(d.getDate() - STUDENT_HOME_FEED_RETENTION_DAYS)
  return d
}

/** Anúncios para alunos: últimos 30 dias a partir do envio ou da criação. */
export function announcementWhereStudentVisible(
  notOlderThan: Date
): Prisma.AnnouncementWhereInput {
  return {
    audience: { in: ['STUDENTS', 'ALL', 'ACTIVE_ONLY'] },
    OR: [
      { sentAt: { gte: notOlderThan } },
      { AND: [{ sentAt: null }, { criadoEm: { gte: notOlderThan } }] },
    ],
  }
}
