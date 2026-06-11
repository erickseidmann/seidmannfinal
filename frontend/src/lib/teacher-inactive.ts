/**
 * Regras de professor inativo: listas operacionais, pagamentos por mês e acesso.
 */

import type { UserStatus } from '@prisma/client'
import { startOfCalendarDayBrazilDateKey, toDateKeyInTZ, ymdInTZ } from '@/lib/datetime'

export function inactiveMonthFromDate(inactiveAt: Date): { year: number; month: number } {
  const key = ymdInTZ(inactiveAt)
  const [year, month] = key.split('-').map(Number)
  return { year, month }
}

/** Professor aparece em listas operacionais (admin, calendário, designação, etc.) */
export function isTeacherActiveForLists(status: UserStatus | string): boolean {
  return status !== 'INACTIVE'
}

/**
 * Pagamento no mês visualizado: ativo sempre; inativo em abril ainda aparece em abril, não em maio+.
 */
export function isTeacherPayableInMonth(
  status: UserStatus | string,
  inactiveAt: Date | null | undefined,
  viewYear: number,
  viewMonth: number
): boolean {
  if (status === 'ACTIVE') return true
  if (status !== 'INACTIVE') return false
  if (!inactiveAt) return false
  const { year: iy, month: im } = inactiveMonthFromDate(inactiveAt)
  if (viewYear < iy) return true
  if (viewYear > iy) return false
  return viewMonth <= im
}

/** Data de inativação a partir de AAAA-MM-DD ou hoje (BRT). */
export function resolveTeacherInactiveAt(inactiveFrom?: string | null): Date {
  const trimmed = inactiveFrom?.trim()
  if (trimmed && /^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    const d = startOfCalendarDayBrazilDateKey(trimmed)
    if (d) return d
  }
  const todayKey = toDateKeyInTZ(new Date())
  return startOfCalendarDayBrazilDateKey(todayKey) ?? new Date()
}

export type TeacherStatusFields = {
  status: UserStatus
  inactiveAt: Date | null
  userId: string | null
}

export function buildTeacherStatusPatch(
  current: TeacherStatusFields,
  newStatus: UserStatus,
  inactiveFrom?: string | null
): { status: UserStatus; inactiveAt: Date | null } {
  if (newStatus === 'INACTIVE') {
    return {
      status: 'INACTIVE',
      inactiveAt:
        current.status === 'INACTIVE' && current.inactiveAt
          ? current.inactiveAt
          : resolveTeacherInactiveAt(inactiveFrom),
    }
  }
  if (newStatus === 'ACTIVE') {
    return { status: 'ACTIVE', inactiveAt: null }
  }
  return { status: newStatus, inactiveAt: newStatus === 'INACTIVE' ? current.inactiveAt : null }
}

/** Sincroniza User.status com Teacher ao ativar/inativar (bloqueia login). */
export async function syncLinkedUserStatus(
  userId: string | null | undefined,
  teacherStatus: UserStatus
): Promise<void> {
  if (!userId) return
  const { prisma } = await import('@/lib/prisma')
  const userStatus: UserStatus =
    teacherStatus === 'ACTIVE' ? 'ACTIVE' : 'INACTIVE'
  await prisma.user.update({
    where: { id: userId },
    data: { status: userStatus },
  })
}
