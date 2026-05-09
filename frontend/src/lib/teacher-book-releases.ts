/**
 * Auto-liberação de livros do catálogo para professores.
 *
 * Regra de negócio (definida em conversa com o admin):
 *  - Quando um professor passa a ensinar um idioma (criação ou inclusão),
 *    todos os livros desse idioma já cadastrados são automaticamente liberados a ele.
 *  - Quando um livro é cadastrado com um idioma definido,
 *    ele é automaticamente liberado a todos os professores ativos que ensinam esse idioma.
 *  - Se um admin remover manualmente uma liberação (DELETE), ela permanece removida.
 *    Não tentamos "ressuscitar" a liberação ao re-salvar o professor sem que um novo
 *    idioma tenha sido adicionado.
 */

import { prisma } from '@/lib/prisma'

export type TeacherLanguage = 'ENGLISH' | 'SPANISH'

const IDIOMA_TO_LANGUAGE: Record<string, TeacherLanguage> = {
  INGLES: 'ENGLISH',
  ENGLISH: 'ENGLISH',
  ESPANHOL: 'SPANISH',
  SPANISH: 'SPANISH',
}

/** Converte "INGLES"/"ESPANHOL" (idiomasEnsina do Teacher) para o enum Language do Book.
 *  Demais idiomas (PORTUGUES, ITALIANO, FRANCES) não têm catálogo próprio e retornam null. */
export function mapIdiomaToBookLanguage(idioma: string | null | undefined): TeacherLanguage | null {
  if (!idioma) return null
  return IDIOMA_TO_LANGUAGE[String(idioma).toUpperCase()] ?? null
}

export function mapIdiomasToBookLanguages(
  idiomas: ReadonlyArray<string> | null | undefined
): TeacherLanguage[] {
  if (!Array.isArray(idiomas)) return []
  const out = new Set<TeacherLanguage>()
  for (const i of idiomas) {
    const l = mapIdiomaToBookLanguage(i)
    if (l) out.add(l)
  }
  return Array.from(out)
}

/** Cria liberações (BookRelease) para o usuário do professor para todos os livros dos idiomas indicados.
 *  Usa a unique [userId, bookCode]: liberações já existentes são ignoradas (não duplicam,
 *  mas tampouco "ressuscitam" liberações que foram removidas manualmente neste mesmo ciclo).
 *
 *  Importante: quem decide o que liberar é a CHAMADA — passe apenas os idiomas que devem
 *  disparar liberação (por ex. recém-adicionados ao professor). */
export async function releaseBooksToTeacherForLanguages(args: {
  teacherUserId: string
  languages: ReadonlyArray<TeacherLanguage>
  adminEmail: string
}): Promise<{ released: number }> {
  const { teacherUserId, languages, adminEmail } = args
  if (!teacherUserId || languages.length === 0) return { released: 0 }

  const books = await prisma.book.findMany({
    where: { language: { in: languages as TeacherLanguage[] } },
    select: { id: true },
  })
  if (books.length === 0) return { released: 0 }

  const existing = await prisma.bookRelease.findMany({
    where: { userId: teacherUserId, bookCode: { in: books.map((b) => b.id) } },
    select: { bookCode: true },
  })
  const alreadyHas = new Set(existing.map((r) => r.bookCode))

  const toCreate = books
    .filter((b) => !alreadyHas.has(b.id))
    .map((b) => ({
      userId: teacherUserId,
      bookCode: b.id,
      bookId: b.id,
      releasedByAdminEmail: adminEmail || 'system@seidmann',
    }))

  if (toCreate.length === 0) return { released: 0 }

  await prisma.bookRelease.createMany({ data: toCreate, skipDuplicates: true })
  return { released: toCreate.length }
}

/** Libera UM livro a todos os professores ATIVOS (com userId) que ensinam o idioma do livro.
 *  Usado quando um livro novo é cadastrado. Liberações pré-existentes são ignoradas. */
export async function releaseBookToActiveTeachersForLanguage(args: {
  bookId: string
  language: TeacherLanguage
  adminEmail: string
}): Promise<{ released: number }> {
  const { bookId, language, adminEmail } = args
  if (!bookId || !language) return { released: 0 }

  // Idioma "INGLES"/"ESPANHOL" usado em Teacher.idiomasEnsina (JSON).
  const idiomaPt = language === 'ENGLISH' ? 'INGLES' : 'ESPANHOL'

  // Buscamos todos os teachers com userId e filtramos no app porque idiomasEnsina é JSON.
  const teachers = await prisma.teacher.findMany({
    where: {
      userId: { not: null },
      status: 'ACTIVE',
    },
    select: { userId: true, idiomasEnsina: true },
  })

  const userIds = teachers
    .filter((t) => {
      const arr = Array.isArray(t.idiomasEnsina) ? (t.idiomasEnsina as unknown as string[]) : []
      return arr.some((x) => String(x).toUpperCase() === idiomaPt)
    })
    .map((t) => t.userId!)
    .filter(Boolean)

  if (userIds.length === 0) return { released: 0 }

  const existing = await prisma.bookRelease.findMany({
    where: { bookCode: bookId, userId: { in: userIds } },
    select: { userId: true },
  })
  const alreadyHas = new Set(existing.map((r) => r.userId))

  const toCreate = userIds
    .filter((id) => !alreadyHas.has(id))
    .map((userId) => ({
      userId,
      bookCode: bookId,
      bookId,
      releasedByAdminEmail: adminEmail || 'system@seidmann',
    }))

  if (toCreate.length === 0) return { released: 0 }

  await prisma.bookRelease.createMany({ data: toCreate, skipDuplicates: true })
  return { released: toCreate.length }
}

/** Calcula quais idiomas (ENGLISH/SPANISH) foram ADICIONADOS comparando antigo→novo.
 *  Útil no PATCH de teacher para liberar apenas livros dos idiomas recém-incluídos. */
export function languagesAdded(
  oldIdiomas: ReadonlyArray<string> | null | undefined,
  newIdiomas: ReadonlyArray<string> | null | undefined
): TeacherLanguage[] {
  const oldSet = new Set(mapIdiomasToBookLanguages(oldIdiomas))
  const next = mapIdiomasToBookLanguages(newIdiomas)
  return next.filter((l) => !oldSet.has(l))
}
