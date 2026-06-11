import { isSuperAdminEmail } from '@/lib/auth'
import { toDateKeyInTZ } from '@/lib/datetime'

export const LESSON_PAST_EDIT_DENIED_MESSAGE =
  'Aulas de dias anteriores só podem ser alteradas pelo administrador principal (admin@seidmann.com).'

export const LESSON_PAST_EDIT_NEEDS_APPROVAL_MESSAGE =
  'Esta aula já passou. Para alterá-la é necessária aprovação de um administrador autorizado.'

/** Aula em dia civil anterior ao de hoje (fuso Brasil). */
export function isLessonOnPastCalendarDay(startAt: Date | string, now = new Date()): boolean {
  const lessonDate = typeof startAt === 'string' ? new Date(startAt) : startAt
  if (Number.isNaN(lessonDate.getTime())) return false
  const lessonKey = toDateKeyInTZ(lessonDate)
  const todayKey = toDateKeyInTZ(now)
  return lessonKey < todayKey
}

/** Pode editar aula passada diretamente (sem solicitação). */
export function canAdminDirectEditPastLesson(
  adminEmail: string | undefined | null,
  canApproveLateLessonEdits = false
): boolean {
  if (isSuperAdminEmail(adminEmail ?? undefined)) return true
  return canApproveLateLessonEdits
}

/** Pode aprovar solicitações de alteração tardia. */
export function canAdminApprovePastLessonEdit(
  adminEmail: string | undefined | null,
  canApproveLateLessonEdits = false
): boolean {
  return canAdminDirectEditPastLesson(adminEmail, canApproveLateLessonEdits)
}

export function canAdminEditLessonOnDate(
  startAt: Date | string,
  adminEmail: string | undefined | null,
  options?: { canApproveLateLessonEdits?: boolean; now?: Date }
): boolean {
  if (!isLessonOnPastCalendarDay(startAt, options?.now)) return true
  return canAdminDirectEditPastLesson(adminEmail, options?.canApproveLateLessonEdits ?? false)
}
