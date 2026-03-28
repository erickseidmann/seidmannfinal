/**
 * Quando o schema Prisma já tem `TeacherAlert.enrollmentId` mas a migration
 * ainda não foi aplicada no MySQL, o Prisma retorna P2022. Evita quebrar o painel.
 */

import { Prisma } from '@prisma/client'
import type { PrismaClient } from '@prisma/client'

export function isTeacherAlertEnrollmentIdColumnError(e: unknown): boolean {
  if (!(e instanceof Prisma.PrismaClientKnownRequestError)) return false
  if (e.code !== 'P2022') return false
  const col = e.meta?.column
  return typeof col === 'string' && col.includes('enrollment_id')
}

export type TeacherAlertRowForEnrich = {
  id: string
  message: string
  type: string | null
  level: string | null
  readAt: Date | null
  criadoEm: Date
  enrollmentId: string | null
}

const SELECT_BASE = {
  id: true,
  message: true,
  type: true,
  level: true,
  readAt: true,
  criadoEm: true,
} as const

export async function findTeacherAlertsForProfessorWidgets(
  prisma: PrismaClient,
  where: Prisma.TeacherAlertWhereInput,
  take: number
): Promise<TeacherAlertRowForEnrich[]> {
  try {
    return await prisma.teacherAlert.findMany({
      where,
      orderBy: { criadoEm: 'desc' },
      take,
      select: { ...SELECT_BASE, enrollmentId: true },
    })
  } catch (e) {
    if (!isTeacherAlertEnrollmentIdColumnError(e)) throw e
    const rows = await prisma.teacherAlert.findMany({
      where,
      orderBy: { criadoEm: 'desc' },
      take,
      select: SELECT_BASE,
    })
    return rows.map((r) => ({ ...r, enrollmentId: null }))
  }
}
