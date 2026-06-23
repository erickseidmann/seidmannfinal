export const MIN_JUSTIFICATIVA_CONCILIACAO_LENGTH = 15

export interface RecebimentoJustificativaContext {
  divergenciaValor: boolean
  valorRecebimentoCentavos: number
  alocacoes: Array<{
    valorCentavos: number
    valorMensalidadeCentavos?: number | null
  }>
}

/** Exige justificativa quando valor diverge, alocação parcial ou composta. */
export function requiresRecebimentoJustificativa(ctx: RecebimentoJustificativaContext): boolean {
  const soma = ctx.alocacoes.reduce((s, a) => s + a.valorCentavos, 0)
  if (ctx.divergenciaValor) return true
  if (soma !== ctx.valorRecebimentoCentavos) return true
  if (ctx.alocacoes.length > 1) return true
  for (const a of ctx.alocacoes) {
    if (
      a.valorMensalidadeCentavos != null &&
      a.valorCentavos !== a.valorMensalidadeCentavos
    ) {
      return true
    }
  }
  return false
}

export function validateRecebimentoJustificativa(
  justificativa: string | null | undefined,
  required: boolean
): { ok: true; value: string | null } | { ok: false; message: string } {
  const trimmed = justificativa?.trim() ?? ''
  if (!required) {
    return { ok: true, value: trimmed || null }
  }
  if (trimmed.length < MIN_JUSTIFICATIVA_CONCILIACAO_LENGTH) {
    return {
      ok: false,
      message: `Informe uma justificativa com no mínimo ${MIN_JUSTIFICATIVA_CONCILIACAO_LENGTH} caracteres`,
    }
  }
  return { ok: true, value: trimmed }
}
