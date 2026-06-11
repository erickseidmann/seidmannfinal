import type { Prisma } from '@prisma/client'

/** Notificações automáticas do painel do professor (novo aluno, pagamento, etc.). */
export const PROFESSOR_SYSTEM_ALERT_TYPES = [
  'PAYMENT_DONE',
  'NEW_ANNOUNCEMENT',
  'NEW_STUDENT',
  'NEW_TRAINING',
  'PROOF_RESEND_NEEDED',
  'STUDENT_INACTIVE',
] as const

export type ProfessorSystemAlertType = (typeof PROFESSOR_SYSTEM_ALERT_TYPES)[number]

/** Alertas criados pela gestão (ex.: «professor falta muito») — sem type de sistema. */
export function managementTeacherAlertWhere(): Prisma.TeacherAlertWhereInput {
  return {
    NOT: {
      type: { in: [...PROFESSOR_SYSTEM_ALERT_TYPES] },
    },
  }
}

export function isProfessorSystemAlertType(type: string | null | undefined): boolean {
  if (!type) return false
  return (PROFESSOR_SYSTEM_ALERT_TYPES as readonly string[]).includes(type)
}
