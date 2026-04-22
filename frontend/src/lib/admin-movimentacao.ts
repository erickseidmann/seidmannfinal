/**
 * Regras compartilhadas entre a tela Movimentações e relatórios (adminExpense.description).
 */

export function extractTipoMovimentacao(description: string | null | undefined): 'ENTRADA' | 'SAIDA' {
  const d = description || ''
  if (/\[TIPO:\s*ENTRADA\s*\]/i.test(d)) return 'ENTRADA'
  return 'SAIDA'
}

function extractTipoTransacaoMarker(description: string | null | undefined): string {
  const m = (description || '').match(/\[TIPO_TRANSACAO:\s*([^\]]+)\]/i)
  return (m?.[1] ?? '').trim()
}

/** Valor do marcador [TIPO_TRANSACAO:…] indica crédito (coluna Tipo transação). */
function isCreditoFromTipoTransacaoValor(tt: string): boolean {
  const t = tt.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase()
  if (t.includes('DEBITO') || t.includes('DEBIT')) return false
  if (/^(ATM|POS|FEE|SRVCHG|CHECK)$/.test(t)) return false
  if (t.includes('CREDITO') || t.includes('CREDIT')) return true
  if (t === 'DEP' || t === 'DIRECTDEP' || t === 'INT' || t === 'DIV') return true
  return false
}

/**
 * Coluna "Tipo transação": com marcador usa [TIPO_TRANSACAO:…]; sem marcador usa só o dropdown
 * (CRÉDITO se Entrada, DÉBITO se Saída). Se o dropdown ainda não existe no estado, usa o tipo salvo na descrição.
 */
export function isCreditoComoNaTelaMovimentacoes(
  description: string | null | undefined,
  editableTipo?: 'ENTRADA' | 'SAIDA' | null
): boolean {
  const tt = extractTipoTransacaoMarker(description)
  if (tt) return isCreditoFromTipoTransacaoValor(tt)
  if (editableTipo === 'ENTRADA') return true
  if (editableTipo === 'SAIDA') return false
  return extractTipoMovimentacao(description) === 'ENTRADA'
}

/** Relatório / API: só descrição persistida (sem estado do formulário). */
export function shouldIncludeValorInTotalEntradaRegis(description: string | null | undefined): boolean {
  const tt = extractTipoTransacaoMarker(description)
  if (tt) return isCreditoFromTipoTransacaoValor(tt)
  return extractTipoMovimentacao(description) === 'ENTRADA'
}

/** Marcadores de extrato em `AdminExpense.description` (DATA, TRANSACAO, IDENTIFICACAO). */
export function extractMovimentacaoMarcadoresExtrato(description: string | null | undefined): {
  data: string
  transacao: string
  identificacao: string
} {
  const d = description ?? ''
  const pick = (marker: string) => {
    const m = d.match(new RegExp(`\\[${marker}:([^\\]]+)\\]`, 'i'))
    return (m?.[1] ?? '').trim()
  }
  return {
    data: pick('DATA'),
    transacao: pick('TRANSACAO'),
    identificacao: pick('IDENTIFICACAO'),
  }
}

type LinhaComValor = {
  description: string | null | undefined
  valor: number | string
  year: number
  month: number
  fixedSeriesId?: string | null
}

/**
 * Evita somar duas vezes a mesma linha lógica:
 * - extrato: FITID/identificação ou data+transação+valor no mesmo mês;
 * - despesa fixa: mesma série no mesmo mês.
 */
export function dedupeLinhasMovimentacaoParaSoma<T extends LinhaComValor>(rows: T[]): T[] {
  const seen = new Set<string>()
  const out: T[] = []
  for (const row of rows) {
    const v = Math.round(Number(row.valor) * 100) / 100
    const key = chaveDedupeLinha(row.description, v, row.year, row.month, row.fixedSeriesId ?? null)
    if (key) {
      if (seen.has(key)) continue
      seen.add(key)
    }
    out.push(row)
  }
  return out
}

function chaveDedupeLinha(
  description: string | null | undefined,
  valor: number,
  year: number,
  month: number,
  fixedSeriesId: string | null
): string | null {
  const d = description || ''
  if (/\[EXTRATO_ID:/i.test(d)) {
    const ident = d.match(/\[IDENTIFICACAO:\s*([^\]]*)\]/i)?.[1]?.trim() ?? ''
    if (ident) return `ext|${year}|${month}|id:${ident}|v:${valor}`
    const data = d.match(/\[DATA:\s*([^\]]*)\]/i)?.[1]?.trim() ?? ''
    const trans = d.match(/\[TRANSACAO:\s*([^\]]*)\]/i)?.[1]?.trim() ?? ''
    if (data && trans) return `ext|${year}|${month}|d:${data}|t:${trans}|v:${valor}`
    return null
  }
  if (fixedSeriesId) return `fix|${fixedSeriesId}|${year}|${month}`
  return null
}
