import { isLessonCancelledFamily } from '@/lib/lesson-status'

export type LessonRescheduleRef = {
  id: string
  enrollmentId: string
  status: string
  startAt: string
  notes: string | null
}

/** Mapa cancelledLessonId → startAt ISO da aula REPOSICAO vinculada. */
export function buildRescheduledAtByCancelledLessonId(
  lessons: LessonRescheduleRef[]
): Map<string, string> {
  return buildRescheduleLinks(lessons).rescheduledAtByCancelledId
}

export function buildRescheduleLinks(lessons: LessonRescheduleRef[]): {
  rescheduledAtByCancelledId: Map<string, string>
  originalAtByReposicaoId: Map<string, string>
} {
  const rescheduledAtByCancelledId = new Map<string, string>()
  const originalAtByReposicaoId = new Map<string, string>()
  const reposicoes = lessons.filter((l) => l.status === 'REPOSICAO')
  const cancelled = lessons.filter((l) => isLessonCancelledFamily(l.status))
  const usedReposicaoIds = new Set<string>()

  for (const c of cancelled) {
    const marker = `[cancelledLessonId:${c.id}]`
    let match =
      reposicoes.find((r) => !usedReposicaoIds.has(r.id) && (r.notes ?? '').includes(marker)) ??
      null

    if (!match) {
      const dateToken = new Date(c.startAt).toLocaleDateString('pt-BR', {
        timeZone: 'America/Sao_Paulo',
      })
      match =
        reposicoes.find(
          (r) =>
            !usedReposicaoIds.has(r.id) &&
            r.enrollmentId === c.enrollmentId &&
            new Date(r.startAt).getTime() >= new Date(c.startAt).getTime() &&
            (r.notes ?? '').includes(`aula cancelada em ${dateToken}`)
        ) ?? null
    }

    if (match) {
      usedReposicaoIds.add(match.id)
      rescheduledAtByCancelledId.set(c.id, match.startAt)
      originalAtByReposicaoId.set(match.id, c.startAt)
    }
  }

  for (const r of reposicoes) {
    if (originalAtByReposicaoId.has(r.id)) continue
    const fromNotes = extractOriginalDateFromReposicaoNotes(r.notes, lessons)
    if (fromNotes) originalAtByReposicaoId.set(r.id, fromNotes)
  }

  return { rescheduledAtByCancelledId, originalAtByReposicaoId }
}

/** ISO da aula original ou DD/MM nas notas da reposição. */
export function extractOriginalDateFromReposicaoNotes(
  notes: string | null,
  allLessons: LessonRescheduleRef[]
): string | null {
  if (!notes?.trim()) return null

  const markerMatch = notes.match(/\[cancelledLessonId:([^\]]+)\]/)
  if (markerMatch?.[1]) {
    const cancelled = allLessons.find((l) => l.id === markerMatch[1])
    if (cancelled) return cancelled.startAt
  }

  const dateMatch = notes.match(/aula cancelada em (\d{2}\/\d{2}\/\d{4})/i)
  if (dateMatch?.[1]) {
    const [day, month, year] = dateMatch[1].split('/').map(Number)
    return new Date(Date.UTC(year, month - 1, day, 12, 0, 0)).toISOString()
  }

  return null
}

export function formatOriginalLessonBadgeDate(originalAt: string): string {
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(originalAt)) return originalAt
  return formatRescheduledBadgeDate(originalAt)
}

export function formatRescheduledBadgeDate(startAtIso: string): string {
  return new Date(startAtIso).toLocaleDateString('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}

/** Data em que a aula foi cancelada (DD/MM/AAAA), extraída das observações. */
export function extractCancelledAtFromNotes(notes: string | null): string | null {
  if (!notes?.trim()) return null

  const lines = notes.split('\n').filter((line) => line.trim())
  const lastCancelLine = [...lines].reverse().find(
    (line) => line.includes('Aula foi cancelada') || /cancelada pelo/i.test(line)
  )
  if (!lastCancelLine) return null

  const match = lastCancelLine.match(/(?:às|no dia)\s+(\d{2}\/\d{2}\/\d{4})/i)
  if (match?.[1]) return match[1]

  const fallback = lastCancelLine.match(/(\d{2}\/\d{2}\/\d{4})/)
  return fallback?.[1] ?? null
}
