/**
 * Extrato Cora (CREDIT) → NormalizedPayment → reconcilePayment.
 */

import {
  fetchBankStatementPage,
  type CoraStatementEntry,
} from '@/lib/cora/client'
import type { NormalizedPayment } from './types'
import { inferDocumentoTipo, onlyDigits } from './normalize'

function parseCoraDate(raw: string): Date {
  if (!raw) return new Date(NaN)
  let s = raw.trim()
  // Cora envia "+00" (sem minutos). Normalizar offsets de timezone:
  s = s.replace(/([+-]\d{2})$/, '$1:00')
  s = s.replace(/([+-]\d{2})(\d{2})$/, '$1:$2')
  const d = new Date(s)
  if (Number.isNaN(d.getTime())) {
    console.warn('[cora-statement] createdAt inválido, usando now:', raw)
    return new Date()
  }
  return d
}

function formatDateParam(d: Date): string {
  return d.toISOString().slice(0, 10)
}

export async function fetchCoraStatement(
  start: Date,
  end: Date
): Promise<CoraStatementEntry[]> {
  const startStr = formatDateParam(start)
  const endStr = formatDateParam(end)
  const all: CoraStatementEntry[] = []
  let page = 1

  while (true) {
    const res = await fetchBankStatementPage({
      start: startStr,
      end: endStr,
      page,
      perPage: 100,
    })
    const entries = res.entries ?? []
    if (entries.length === 0) break
    all.push(...entries)
    if (entries.length < 100) break
    page++
  }

  return all
}

export function mapStatementEntryToNormalized(
  entry: CoraStatementEntry
): NormalizedPayment {
  const identity = entry.transaction?.counterParty?.identity
  let documentoPagador: string | undefined
  if (identity) {
    const d = onlyDigits(identity)
    if (inferDocumentoTipo(d)) documentoPagador = d
  }

  return {
    provider: 'CORA',
    providerPaymentId: entry.id,
    valor: entry.amount,
    dataPagamento: parseCoraDate(entry.createdAt),
    metodo: entry.transaction?.type,
    documentoPagador,
    nomePagador: entry.transaction?.counterParty?.name,
    txid: entry.transaction?.id,
    rawPayload: entry,
  }
}

export type { CoraStatementEntry }
