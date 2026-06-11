export type LessonRecordUnlockStatus = 'PENDING' | 'APPROVED' | 'DENIED'

export interface LessonRecordUnlockRef {
  status: LessonRecordUnlockStatus
}

export function isLessonRecordUnlockApproved(
  unlock?: LessonRecordUnlockRef | null
): boolean {
  return unlock?.status === 'APPROVED'
}

export function isLessonRecordUnlockPending(
  unlock?: LessonRecordUnlockRef | null
): boolean {
  return unlock?.status === 'PENDING'
}

export const LESSON_RECORD_UNLOCK_STATUS_LABELS: Record<LessonRecordUnlockStatus, string> = {
  PENDING: 'Aguardando',
  APPROVED: 'Liberada',
  DENIED: 'Negada',
}
