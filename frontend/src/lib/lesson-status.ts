/**
 * Status de Lesson (calendário) — alinhado ao enum Prisma `LessonStatus`.
 */

export const LESSON_STATUSES_SCHEDULED = ['CONFIRMED', 'REPOSICAO'] as const

/** Cancelamentos (não ocupam grade como aula ativa). */
export const LESSON_STATUSES_CANCELLED_FAMILY = [
  'CANCELLED',
  'CANCELLED_BY_TEACHER',
  'CANCELLED_NO_REPLACEMENT',
] as const

export type LessonStatusUi =
  | 'CONFIRMED'
  | 'CANCELLED'
  | 'CANCELLED_BY_TEACHER'
  | 'CANCELLED_NO_REPLACEMENT'
  | 'REPOSICAO'

export const LESSON_STATUS_LABELS: Record<LessonStatusUi, string> = {
  CONFIRMED: 'Confirmada',
  CANCELLED: 'Cancelada',
  CANCELLED_BY_TEACHER: 'Aula cancelada pelo professor',
  CANCELLED_NO_REPLACEMENT: 'Cancelada sem reposição',
  REPOSICAO: 'Reposição',
}

export function isLessonScheduledStatus(status: string): boolean {
  return status === 'CONFIRMED' || status === 'REPOSICAO'
}

export function isLessonCancelledFamily(status: string): boolean {
  return (
    status === 'CANCELLED' ||
    status === 'CANCELLED_BY_TEACHER' ||
    status === 'CANCELLED_NO_REPLACEMENT'
  )
}

/** Pode marcar/agendar reposição a partir deste cancelamento. */
export function lessonCancelledStatusAllowsReposicao(status: string): boolean {
  return status === 'CANCELLED' || status === 'CANCELLED_BY_TEACHER'
}

/** Origem válida para criar uma aula REPOSICAO (API / fluxo admin). */
export function lessonStatusValidOriginForReposicao(status: string): boolean {
  return status === 'CANCELLED' || status === 'CANCELLED_BY_TEACHER'
}
