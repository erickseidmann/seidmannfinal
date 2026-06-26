/** Valores aceitos no banco (inclui 40 min em matrículas antigas). */
export const TEMPOS_AULA_VALIDOS = [30, 40, 60, 120] as const

/** Opções para novas matrículas e formulários (sem 40 min). */
export const TEMPOS_AULA_SELECAO = [30, 60, 120] as const

export function isTempoAulaValido(value: number): boolean {
  return (TEMPOS_AULA_VALIDOS as readonly number[]).includes(value)
}

export function isTempoAulaSelecionavel(value: number): boolean {
  return (TEMPOS_AULA_SELECAO as readonly number[]).includes(value)
}

/** Aceita 30/60/120; mantém 40 apenas se a matrícula já era 40 min. */
export function parseTempoAulaMinutosForUpdate(
  value: unknown,
  existingTempoAulaMinutos: number | null | undefined
): number | null {
  const n = Number(value)
  if (Number.isNaN(n)) return null
  if (isTempoAulaSelecionavel(n)) return n
  if (n === 40 && existingTempoAulaMinutos === 40) return 40
  return null
}

export function parseTempoAulaMinutosForCreate(value: unknown): number | null {
  const n = typeof value === 'number' ? value : parseInt(String(value), 10)
  if (Number.isNaN(n) || !isTempoAulaSelecionavel(n)) return null
  return n
}

/** Rótulos para exibição (inclui legado 40 min). */
export const TEMPO_AULA_LABELS: Record<number, string> = {
  30: '30 min',
  40: '40 min',
  60: '1 hora',
  120: '2 horas',
}

export const TEMPO_AULA_LABELS_ADMIN: Record<number, string> = {
  30: '00:30',
  40: '00:40',
  60: '01:00',
  120: '02:00',
}
