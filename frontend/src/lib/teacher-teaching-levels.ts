import { BOOK_NUMBER_TO_CEFR, NIVEL_LIVRO_NAO_DEFINIDO } from '@/lib/student-book-level'

/** Níveis CEFR que o professor pode ensinar (alinhado aos livros Book 1–8). */
export const TEACHER_CEFR_LEVEL_OPTIONS = Object.values(BOOK_NUMBER_TO_CEFR).map((item) => ({
  value: item.cefr,
  label: `${item.cefr} — ${item.description}`,
}))

export const VALID_TEACHER_CEFR_LEVELS = new Set(
  TEACHER_CEFR_LEVEL_OPTIONS.map((o) => o.value)
)

export function sanitizeTeacherNiveisEnsina(input: unknown): string[] {
  if (!Array.isArray(input)) return []
  const out: string[] = []
  for (const raw of input) {
    const v = String(raw ?? '').trim()
    if (VALID_TEACHER_CEFR_LEVELS.has(v) && !out.includes(v)) out.push(v)
  }
  return out
}

export function normalizeTeacherNiveisEnsina(
  value: unknown
): string[] {
  if (Array.isArray(value)) return sanitizeTeacherNiveisEnsina(value)
  if (value == null) return []
  return sanitizeTeacherNiveisEnsina([value])
}

/**
 * Catálogo Admin → Livros (A1…C2) vs níveis do professor (A1, A2, B1.1, B1.2…).
 * Um aluno com livro cadastrado como "B1" deve ser aceito por professor com B1.1 e/ou B1.2.
 */
const CATALOG_LEVEL_TO_TEACHER_LEVELS: Record<string, string[]> = {
  A1: ['A1'],
  A2: ['A2'],
  A3: ['A2', 'B1.1'],
  B1: ['B1.1', 'B1.2'],
  B2: ['B2.1', 'B2.2'],
  B3: ['B2.2'],
  B4: ['C1.1'],
  C1: ['C1.1', 'C1.2'],
  C2: ['C1.2'],
}

/** Níveis do professor que satisfazem o nível efetivo do aluno (catálogo ou fase decimal). */
export function studentLevelVariantsForTeacherMatch(studentNivel: string): string[] {
  const nivel = studentNivel.trim()
  if (VALID_TEACHER_CEFR_LEVELS.has(nivel)) return [nivel]
  const mapped = CATALOG_LEVEL_TO_TEACHER_LEVELS[nivel]
  if (mapped?.length) return mapped
  return [nivel]
}

/** Aluno sem nível definido → não bloqueia (ainda não há referência de livro). */
export function teacherCanTeachStudentLevel(
  teacherNiveis: string[] | null | undefined,
  studentNivel: string | null | undefined
): boolean {
  const nivel = studentNivel?.trim()
  if (!nivel || nivel === NIVEL_LIVRO_NAO_DEFINIDO) return true
  const niveis = normalizeTeacherNiveisEnsina(teacherNiveis)
  // Legado: professor sem níveis cadastrados → não restringe (evita bloqueio em massa).
  if (niveis.length === 0) return true
  const studentVariants = studentLevelVariantsForTeacherMatch(nivel)
  return studentVariants.some((variant) => niveis.includes(variant))
}

export const TEACHER_LEVEL_MISMATCH_MESSAGE =
  'Isso não pode ser feito porque o professor não está habilitado para o nível do aluno.'

export function teacherStudentLevelMismatchMessage(
  studentNivel: string,
  teacherName?: string
): string {
  const who = teacherName ? `O professor ${teacherName}` : 'O professor'
  return `${who} não está habilitado para dar aula ao nível ${studentNivel} do aluno. Cadastre o nível em Gestão → Professores ou escolha outro professor.`
}

export function formatTeacherNiveisLabel(niveis: string[] | null | undefined): string {
  const list = normalizeTeacherNiveisEnsina(niveis)
  return list.length > 0 ? list.join(', ') : '—'
}
