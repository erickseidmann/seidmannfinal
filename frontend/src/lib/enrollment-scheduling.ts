import type { EnrollmentStatus } from '@prisma/client'

/**
 * Matrículas antes do fluxo operacional de aulas: sem agenda na lista do calendário
 * e sem criação/atribuição de aulas com professor até avançarem no pagamento/contrato.
 */
export const ENROLLMENT_STATUSES_PRE_SCHEDULING: EnrollmentStatus[] = [
  'REGISTERED',
  'CONTRACT_ACCEPTED',
]

export function enrollmentAllowsSchedulingLessons(status: string): boolean {
  return !ENROLLMENT_STATUSES_PRE_SCHEDULING.includes(status as EnrollmentStatus)
}

/** Matrículas consideradas na checagem de frequência semanal / semana completa (fora de Matriculado/Contrato aceito). */
export const ENROLLMENT_STATUSES_LESSON_TRACKING: EnrollmentStatus[] = ['ACTIVE', 'PAYMENT_PENDING']
