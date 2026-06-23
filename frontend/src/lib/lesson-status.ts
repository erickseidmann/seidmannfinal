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

/** Aula permite criar ou editar lesson_record (CONFIRMED ou REPOSICAO). */
export function canRegisterLesson(status: string): boolean {
  return isLessonScheduledStatus(status)
}

export const LESSON_RECORD_BLOCKED_MESSAGE =
  'Esta aula está cancelada e não pode ser registrada. Se a aula realmente aconteceu, peça à administração para reverter o cancelamento ou criar uma aula de reposição.'

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

/** Cancelamento sem reposição (tardio) — reposição só com exceção explícita. */
export function lessonCancelledStatusRequiresExceptionForReposicao(status: string): boolean {
  return status === 'CANCELLED_NO_REPLACEMENT'
}

/** Pode agendar reposição (inclui exceção para cancelamento tardio). */
export function lessonAllowsAgendarReposicao(
  status: string,
  options?: { cancelamentoExcecao?: boolean }
): boolean {
  if (lessonCancelledStatusAllowsReposicao(status)) return true
  return options?.cancelamentoExcecao === true && status === 'CANCELLED_NO_REPLACEMENT'
}

/** Origem válida para criar uma aula REPOSICAO (API / fluxo admin). */
export function lessonStatusValidOriginForReposicao(
  status: string,
  options?: { cancelamentoExcecao?: boolean }
): boolean {
  return lessonAllowsAgendarReposicao(status, options)
}
