/**
 * Extrato Santander (CREDITO) → NormalizedPayment → reconcilePayment.
 *
 * Idempotência: providerPaymentId sintético com dataISO do LANÇAMENTO (não da janela do cron).
 * seq estável: ordenação fixa + contador por (dateKey, valor, documento) em batch após todas as páginas.
 *
 * Cron: janela initialDate=hoje−3, finalDate=hoje+1 (America/Sao_Paulo) — cobre atraso da API
 * e descompasso de data do extrato (D+1 vs servidor); re-sync não duplica (chave por lançamento).
 */

import { santanderAuthenticatedGet } from '@/lib/santander/client'
import { getDateInTZ, toDateKeyInTZ } from '@/lib/datetime'
import type { NormalizedPayment } from './types'
import { inferDocumentoTipo, onlyDigits } from './normalize'

const DEFAULT_BANK_ID = '90400888000142'

export interface SantanderStatementEntry {
  creditDebitType: string
  transactionName: string
  historicComplement?: string
  amount: string
  transactionDate: string
}

export interface SantanderStatementResponse {
  _content?: SantanderStatementEntry[]
  _pageable?: { totalPages?: string; totalRecords?: string }
}

export type SantanderPreparedEntry = {
  entry: SantanderStatementEntry
  dateKey: string
  valorCentavos: number
  documentoKey: string
  documentoPagador?: string
  dataPagamento: Date
  seq: number
}

/** Desloca uma chave AAAA-MM-DD em dias civis (meio-dia UTC interno). */
export function addDaysToDateKey(dateKey: string, days: number): string {
  const m = dateKey.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!m) throw new Error(`dateKey inválida: ${dateKey}`)
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12, 0, 0))
  d.setUTCDate(d.getUTCDate() + days)
  const y = d.getUTCFullYear()
  const mo = String(d.getUTCMonth() + 1).padStart(2, '0')
  const day = String(d.getUTCDate()).padStart(2, '0')
  return `${y}-${mo}-${day}`
}

/**
 * Janela do sync (America/Sao_Paulo): últimos 4 dias civis até amanhã.
 * initialDate = hoje − 3, finalDate = hoje + 1 (âncora em today).
 * Em produção vimos transactionDate D+1 vs "hoje" do servidor e atraso da API;
 * idempotência usa dateKey do lançamento — alargar a janela não duplica.
 */
export function getSantanderSyncDateWindow(): {
  initialDate: string
  finalDate: string
} {
  const today = toDateKeyInTZ(new Date())
  return {
    initialDate: addDaysToDateKey(today, -3),
    finalDate: addDaysToDateKey(today, 1),
  }
}

export function parseSantanderTransactionDate(
  raw: string
): { dateKey: string; dataPagamento: Date } | null {
  const m = raw.trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/)
  if (!m) return null
  const dateKey = `${m[3]}-${m[2]}-${m[1]}`
  return { dateKey, dataPagamento: getDateInTZ(dateKey) }
}

function isCredito(type: string): boolean {
  return type.trim().toUpperCase() === 'CREDITO'
}

function parseAmountReais(amount: string): number | null {
  const n = Number.parseFloat(String(amount).replace(',', '.').trim())
  if (Number.isNaN(n) || n <= 0) return null
  return Math.round(n * 100)
}

function resolveDocumento(historicComplement?: string): {
  documentoPagador?: string
  documentoKey: string
} {
  if (!historicComplement?.trim()) {
    return { documentoKey: 'SEMDOC' }
  }
  const d = onlyDigits(historicComplement)
  if (inferDocumentoTipo(d)) {
    return { documentoPagador: d, documentoKey: d }
  }
  return { documentoKey: 'SEMDOC' }
}

/** Extrai nome do pagador quando o complemento histórico traz texto além do documento. */
export function parseSantanderPayerNameFromComplement(
  historicComplement?: string
): string | undefined {
  const raw = historicComplement?.trim()
  if (!raw) return undefined

  const lower = raw.toLowerCase()
  if (lower === 'cpf' || lower === 'cnpj' || lower === 'pix') return undefined

  const digits = onlyDigits(raw)
  const docTipo = inferDocumentoTipo(digits)

  if (docTipo && digits) {
    const withoutDoc = raw.replace(digits, '').trim()
    const namePart = withoutDoc
      .replace(/[^\p{L}\s.'-]/gu, ' ')
      .replace(/\s+/g, ' ')
      .trim()
    if (namePart.length >= 3 && !/^(cpf|cnpj|pix|ted|doc|tev)$/i.test(namePart)) {
      return namePart
    }
    return undefined
  }

  if (!/^\d+$/.test(raw)) {
    const cleaned = raw
      .replace(/[^\p{L}\s.'-]/gu, ' ')
      .replace(/\s+/g, ' ')
      .trim()
    if (cleaned.length >= 3) return cleaned
  }

  return undefined
}

/**
 * Ordenação estável + seq por grupo (data+valor+documento) antes de mapear para NormalizedPayment.
 */
export function assignStableSeq(
  entries: SantanderStatementEntry[]
): SantanderPreparedEntry[] {
  const prepared: Omit<SantanderPreparedEntry, 'seq'>[] = []

  for (const entry of entries) {
    if (!isCredito(entry.creditDebitType)) continue

    const parsed = parseSantanderTransactionDate(entry.transactionDate)
    if (!parsed) {
      console.warn(
        '[santander-statement] transactionDate inválida, ignorando:',
        entry.transactionDate
      )
      continue
    }

    const valorCentavos = parseAmountReais(entry.amount)
    if (valorCentavos == null) {
      console.warn('[santander-statement] amount inválido, ignorando:', entry.amount)
      continue
    }

    const { documentoPagador, documentoKey } = resolveDocumento(entry.historicComplement)

    prepared.push({
      entry,
      dateKey: parsed.dateKey,
      valorCentavos,
      documentoKey,
      documentoPagador,
      dataPagamento: parsed.dataPagamento,
    })
  }

  prepared.sort((a, b) => {
    if (a.dateKey !== b.dateKey) return a.dateKey.localeCompare(b.dateKey)
    if (a.valorCentavos !== b.valorCentavos) return a.valorCentavos - b.valorCentavos
    if (a.documentoKey !== b.documentoKey) return a.documentoKey.localeCompare(b.documentoKey)
    const ha = (a.entry.historicComplement ?? '').trim()
    const hb = (b.entry.historicComplement ?? '').trim()
    if (ha !== hb) return ha.localeCompare(hb)
    return (a.entry.transactionName ?? '').localeCompare(b.entry.transactionName ?? '')
  })

  const groupSeq = new Map<string, number>()
  return prepared.map((p) => {
    const groupKey = `${p.dateKey}:${p.valorCentavos}:${p.documentoKey}`
    const seq = (groupSeq.get(groupKey) ?? 0) + 1
    groupSeq.set(groupKey, seq)
    return { ...p, seq }
  })
}

export function buildProviderPaymentId(p: SantanderPreparedEntry): string {
  return `SANT:${p.dateKey}:${p.valorCentavos}:${p.documentoKey}:${p.seq}`
}

export function mapPreparedToNormalized(p: SantanderPreparedEntry): NormalizedPayment {
  const metodo = (p.entry.transactionName ?? 'CREDITO').slice(0, 50)
  const nomeFromComplement = parseSantanderPayerNameFromComplement(p.entry.historicComplement)
  return {
    provider: 'SANTANDER',
    providerPaymentId: buildProviderPaymentId(p),
    valor: p.valorCentavos,
    dataPagamento: p.dataPagamento,
    metodo,
    documentoPagador: p.documentoPagador,
    nomePagador: nomeFromComplement,
    rawPayload: p.entry,
  }
}

export async function fetchSantanderStatement(
  initialDate: string,
  finalDate: string
): Promise<SantanderStatementEntry[]> {
  const bankId = process.env.SANTANDER_BANK_ID || DEFAULT_BANK_ID
  const statementId = process.env.SANTANDER_STATEMENT_ID
  if (!statementId) {
    throw new Error('SANTANDER_STATEMENT_ID é obrigatório (formato agencia.conta12digitos)')
  }

  const basePath = `/bank_account_information/v1/banks/${encodeURIComponent(bankId)}/statements/${encodeURIComponent(statementId)}`
  const all: SantanderStatementEntry[] = []
  let offset = 1
  const limit = 50

  while (true) {
    const q = new URLSearchParams({
      initialDate,
      finalDate,
      _limit: String(limit),
      _offset: String(offset),
    })
    const res = await santanderAuthenticatedGet<SantanderStatementResponse>(
      `${basePath}?${q.toString()}`
    )
    const page = res._content ?? []
    all.push(...page)

    const totalPages = Math.max(1, Number(res._pageable?.totalPages ?? 1) || 1)
    if (offset >= totalPages || page.length === 0) break
    offset++
  }

  return all
}

/** Busca todas as páginas, aplica seq estável e retorna itens prontos para sync. */
export async function fetchSantanderPreparedEntries(
  initialDate: string,
  finalDate: string
): Promise<SantanderPreparedEntry[]> {
  const raw = await fetchSantanderStatement(initialDate, finalDate)
  return assignStableSeq(raw)
}

export function isSantanderStatementSyncEnabled(): boolean {
  if (process.env.SANTANDER_STATEMENT_SYNC_ENABLED === 'false') return false
  return Boolean(
    process.env.SANTANDER_CLIENT_ID &&
      process.env.SANTANDER_CLIENT_SECRET &&
      process.env.SANTANDER_STATEMENT_ID
  )
}
