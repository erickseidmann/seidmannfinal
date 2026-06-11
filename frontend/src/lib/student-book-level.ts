/** Mapeamento Livro → nível CEFR (Seidmann Institute). */
export const BOOK_NUMBER_TO_CEFR: Record<
  number,
  { cefr: string; description: string }
> = {
  1: { cefr: 'A1', description: 'Beginner' },
  2: { cefr: 'A2', description: 'Elementary' },
  3: { cefr: 'B1.1', description: 'Intermediate – Phase 1' },
  4: { cefr: 'B1.2', description: 'Intermediate – Phase 2' },
  5: { cefr: 'B2.1', description: 'Upper Intermediate – Phase 1' },
  6: { cefr: 'B2.2', description: 'Upper Intermediate – Phase 2' },
  7: { cefr: 'C1.1', description: 'Advanced – Phase 1' },
  8: { cefr: 'C1.2', description: 'Advanced – Phase 2' },
}

export const NIVEL_LIVRO_NAO_DEFINIDO = 'não definido'

/** Extrai o número do livro a partir do nome (ex.: "Book 3", "book 3"). */
export function parseBookNumberFromName(bookName: string | null | undefined): number | null {
  if (!bookName?.trim()) return null
  const match = bookName.trim().match(/(?:book|livro)\s*(\d+)/i)
  if (!match?.[1]) return null
  const n = Number(match[1])
  return Number.isFinite(n) && n >= 1 && n <= 8 ? n : null
}

export function cefrLevelFromBookName(bookName: string | null | undefined): string {
  const num = parseBookNumberFromName(bookName)
  if (num == null) return NIVEL_LIVRO_NAO_DEFINIDO
  return BOOK_NUMBER_TO_CEFR[num]?.cefr ?? NIVEL_LIVRO_NAO_DEFINIDO
}

export function cefrDescriptionFromBookName(bookName: string | null | undefined): string | null {
  const num = parseBookNumberFromName(bookName)
  if (num == null) return null
  return BOOK_NUMBER_TO_CEFR[num]?.description ?? null
}

/** Escolhe o livro de maior número entre candidatos (ex.: liberações do aluno). */
export function pickHighestBookName(candidates: (string | null | undefined)[]): string | null {
  let best: { name: string; num: number } | null = null
  for (const raw of candidates) {
    const name = raw?.trim()
    if (!name) continue
    const num = parseBookNumberFromName(name)
    if (num == null) continue
    if (!best || num > best.num) best = { name, num }
  }
  return best?.name ?? null
}
