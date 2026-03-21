/** Motivo da inativação da matrícula (alinhado ao enum Prisma `InactiveReason`) */
export const INACTIVE_REASON_VALUES = [
  'FINANCEIRO',
  'SEM_TEMPO_AULAS',
  'PROBLEMAS_METODO',
  'PROBLEMAS_PROFESSORES',
  'PROBLEMAS_GESTAO_ESCOLA',
  'NAO_GOSTOU',
  'OUTRO',
] as const

export type InactiveReasonValue = (typeof INACTIVE_REASON_VALUES)[number]

export const INACTIVE_REASON_LABELS: Record<InactiveReasonValue, string> = {
  FINANCEIRO: 'Financeiro',
  SEM_TEMPO_AULAS: 'Sem tempo para as aulas',
  PROBLEMAS_METODO: 'Problemas com o método',
  PROBLEMAS_PROFESSORES: 'Problemas com os professores',
  PROBLEMAS_GESTAO_ESCOLA: 'Problemas com a gestão da escola',
  NAO_GOSTOU: 'Não gostou',
  OUTRO: 'Outro',
}

export function isValidInactiveReason(value: unknown): value is InactiveReasonValue {
  return typeof value === 'string' && (INACTIVE_REASON_VALUES as readonly string[]).includes(value)
}

/** Valida motivo obrigatório ao inativar; OUTRO exige texto (mín. 3 caracteres). */
export function validateInactiveReasonPayload(
  inactiveReason: unknown,
  inactiveReasonOther: unknown
): { ok: true; inactiveReason: InactiveReasonValue; inactiveReasonOther: string | null } | { ok: false; message: string } {
  if (!isValidInactiveReason(inactiveReason)) {
    return { ok: false, message: 'Selecione o motivo da inativação.' }
  }
  const otherTrim =
    typeof inactiveReasonOther === 'string' ? inactiveReasonOther.trim().slice(0, 500) : ''
  if (inactiveReason === 'OUTRO') {
    if (otherTrim.length < 3) {
      return { ok: false, message: 'Quando o motivo for "Outro", descreva em pelo menos 3 caracteres.' }
    }
    return { ok: true, inactiveReason, inactiveReasonOther: otherTrim }
  }
  return { ok: true, inactiveReason, inactiveReasonOther: null }
}
