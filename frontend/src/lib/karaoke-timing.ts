/**
 * A letra é repartida uniformemente no intervalo (duração do vídeo − offset de início).
 */
export function getLyricWindowSec(totalVideoSec: number, startOffsetSec: number): number {
  const off = Math.max(0, startOffsetSec)
  if (!Number.isFinite(totalVideoSec) || totalVideoSec <= 0) return 0.001
  return Math.max(0.001, totalVideoSec - off)
}

export function effectiveKaraokeTimeSec(currentTimeSec: number, startOffsetSec: number): number {
  return Math.max(0, currentTimeSec - Math.max(0, startOffsetSec))
}

/** Limite 10 min (evita lixo no formulário admin). */
export function parseStartOffsetSecField(v: unknown): number {
  const n = Number(v)
  if (!Number.isFinite(n) || n < 0) return 0
  return Math.min(n, 600)
}
