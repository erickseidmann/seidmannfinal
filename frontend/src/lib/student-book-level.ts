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

/** Níveis do catálogo Admin → Livros (A1…C2), quando não há fase decimal. */
const CATALOG_CEFR_DESCRIPTIONS: Record<string, string> = {
  A1: 'Beginner',
  A2: 'Elementary',
  A3: 'Pre-intermediate',
  B1: 'Intermediate',
  B2: 'Upper Intermediate',
  B3: 'Upper Intermediate – Phase 2',
  B4: 'Advanced – Phase 1',
  C1: 'Advanced',
  C2: 'Proficiency',
}

/** Extrai token CEFR embutido no nome (ex.: "B2 - ST - 2026", "Book 5" → via número). */
const CEFR_TOKEN_REGEX =
  /\b(B1\.\d|B2\.\d|C1\.\d|A1|A2|A3|B1|B2|B3|B4|C1|C2)\b/i

/** Extrai o número do livro a partir do nome (ex.: "Book 3", "book 3"). */
export function parseBookNumberFromName(bookName: string | null | undefined): number | null {
  if (!bookName?.trim()) return null
  const match = bookName.trim().match(/(?:book|livro)\s*(\d+)/i)
  if (!match?.[1]) return null
  const n = Number(match[1])
  return Number.isFinite(n) && n >= 1 && n <= 8 ? n : null
}

export function parseCefrTokenFromBookName(bookName: string | null | undefined): string | null {
  if (!bookName?.trim()) return null
  const match = bookName.trim().match(CEFR_TOKEN_REGEX)
  if (!match?.[1]) return null
  return match[1].toUpperCase()
}

export function cefrLevelFromBookName(bookName: string | null | undefined): string {
  const num = parseBookNumberFromName(bookName)
  if (num != null) {
    return BOOK_NUMBER_TO_CEFR[num]?.cefr ?? NIVEL_LIVRO_NAO_DEFINIDO
  }
  const token = parseCefrTokenFromBookName(bookName)
  if (token) return token
  return NIVEL_LIVRO_NAO_DEFINIDO
}

export function cefrDescriptionFromBookName(bookName: string | null | undefined): string | null {
  const nivel = cefrLevelFromBookName(bookName)
  if (nivel === NIVEL_LIVRO_NAO_DEFINIDO) return null
  for (const item of Object.values(BOOK_NUMBER_TO_CEFR)) {
    if (item.cefr === nivel) return item.description
  }
  return CATALOG_CEFR_DESCRIPTIONS[nivel] ?? null
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
