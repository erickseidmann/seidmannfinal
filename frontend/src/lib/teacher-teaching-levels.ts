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

/** Aluno sem nível definido → não bloqueia (ainda não há referência de livro). */
export function teacherCanTeachStudentLevel(
  teacherNiveis: string[] | null | undefined,
  studentNivel: string | null | undefined
): boolean {
  const nivel = studentNivel?.trim()
  if (!nivel || nivel === NIVEL_LIVRO_NAO_DEFINIDO) return true
  const niveis = normalizeTeacherNiveisEnsina(teacherNiveis)
  if (niveis.length === 0) return false
  return niveis.includes(nivel)
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
