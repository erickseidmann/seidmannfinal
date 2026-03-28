/**
 * Ordem dos logs: mais recente primeiro. O primeiro evento que bate ano/mês vence.
 * PROOF_REJECTED após PROOF_SENT invalida o anexo até novo PROOF_SENT.
 */

export type ProofAuditLogRow = {
  action: string
  metadata: unknown
}

export function resolveTeacherProofFileUrlFromAuditLogs(
  logsNewestFirst: ProofAuditLogRow[],
  year: number,
  month: number
): string | null {
  for (const log of logsNewestFirst) {
    const meta = log.metadata as { year?: unknown; month?: unknown; fileUrl?: unknown } | null
    if (!meta) continue
    const metaYear = typeof meta.year === 'number' ? meta.year : Number(meta.year)
    const metaMonth = typeof meta.month === 'number' ? meta.month : Number(meta.month)
    if (metaYear !== year || metaMonth !== month) continue
    if (log.action === 'PROOF_REJECTED') return null
    if (log.action === 'PROOF_SENT') {
      const fileUrl = typeof meta.fileUrl === 'string' ? meta.fileUrl.trim() : ''
      if (fileUrl.startsWith('/uploads/')) return fileUrl
      return null
    }
  }
  return null
}
