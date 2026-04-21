/**
 * Descobre qual year/month de TeacherPaymentMonth usar para “hoje”.
 * - Período em aberto que contém hoje tem prioridade.
 * - Se o período que contém hoje está PAGO, usa o próximo período EM_ABERTO (para não manter alertas/registros do ciclo já pago).
 *
 * `todayKey` usa ymdUtc para alinhar com dataInicio/dataTermino do GET financeiro (componentes UTC).
 */

import { ymdUtc } from '@/lib/datetime'

export type ProfessorFinanceiroPayload = { ok: boolean; data?: Record<string, unknown> }

type PeriodRow = {
  year: number
  month: number
  start: string
  end: string
  status: string
  finJson: ProfessorFinanceiroPayload
}

function monthCandidatesAroundToday(spanEachSide: number): { year: number; month: number }[] {
  const now = new Date()
  const baseY = now.getUTCFullYear()
  const baseM = now.getUTCMonth() + 1
  const seen = new Set<string>()
  const out: { year: number; month: number }[] = []
  for (let delta = -spanEachSide; delta <= spanEachSide + 4; delta++) {
    const d = new Date(Date.UTC(baseY, baseM - 1 + delta, 1))
    const y = d.getUTCFullYear()
    const m = d.getUTCMonth() + 1
    const key = `${y}-${m}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push({ year: y, month: m })
  }
  return out
}

async function fetchFinanceiroMonths(
  fetchImpl: typeof fetch,
  candidates: { year: number; month: number }[]
): Promise<PeriodRow[]> {
  const results = await Promise.all(
    candidates.map(async (c) => {
      const res = await fetchImpl(`/api/professor/financeiro?year=${c.year}&month=${c.month}`, {
        credentials: 'include',
      })
      const json = (await res.json().catch(() => ({}))) as ProfessorFinanceiroPayload
      if (!res.ok || !json?.ok || !json.data?.dataInicio || !json.data?.dataTermino) return null
      const d = json.data as { dataInicio: string; dataTermino: string; statusPagamento?: string }
      return {
        year: c.year,
        month: c.month,
        start: String(d.dataInicio),
        end: String(d.dataTermino),
        status: String(d.statusPagamento || 'EM_ABERTO'),
        finJson: json,
      }
    })
  )
  return results.filter((r): r is PeriodRow => !!r)
}

export async function resolveProfessorFinanceiroForToday(
  fetchImpl: typeof fetch
): Promise<ProfessorFinanceiroPayload | null> {
  const now = new Date()
  const todayKey = ymdUtc(now)

  const valid = await fetchFinanceiroMonths(fetchImpl, monthCandidatesAroundToday(1))
  if (valid.length === 0) return null

  const openToday = valid.find((r) => r.start <= todayKey && todayKey <= r.end && r.status !== 'PAGO')
  if (openToday) return openToday.finJson

  const paidToday = valid.find((r) => r.start <= todayKey && todayKey <= r.end && r.status === 'PAGO')
  if (paidToday) {
    const nextOpen = valid
      .filter((r) => r.status !== 'PAGO' && r.start > paidToday.end)
      .sort((a, b) => a.start.localeCompare(b.start))[0]
    if (nextOpen) return nextOpen.finJson
  }

  const futureOpen = valid
    .filter((r) => r.status !== 'PAGO' && r.start > todayKey)
    .sort((a, b) => a.start.localeCompare(b.start))[0]
  if (futureOpen) return futureOpen.finJson

  if (paidToday) return paidToday.finJson

  const containingAny = valid.find((r) => r.start <= todayKey && todayKey <= r.end)
  if (containingAny) return containingAny.finJson

  return valid.sort((a, b) => a.start.localeCompare(b.start))[valid.length - 1]?.finJson ?? null
}

/** Mesma regra do GET financeiro: % de aulas do período que já têm registro. */
export function percentRegistrosFromFinanceiroData(data: Record<string, unknown> | undefined): number | null {
  if (!data) return null
  const direct = data.percentRegistrosFeitos
  if (typeof direct === 'number') return direct

  const total = data.totalRegistrosEsperados
  const com = data.aulasComRegistro
  if (typeof total === 'number' && total > 0 && typeof com === 'number') {
    return Math.min(100, Math.round((100 * com) / total))
  }
  return null
}
