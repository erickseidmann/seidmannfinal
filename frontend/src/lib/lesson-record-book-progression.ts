import { parseBookNumberFromName } from '@/lib/student-book-level'

export const BOOK_RETROGRADE_MESSAGE = (referenceBook: string) =>
  `Não é permitido registrar um livro anterior ao da última aula. O aluno(a) está atualmente no ${referenceBook}.`

export function bookAdvanceConfirmMessage(
  referenceBook: string,
  newBook: string,
  studentName?: string
): string {
  const who = studentName ? `O aluno(a) ${studentName}` : 'O aluno(a)'
  return (
    `Atenção: você está avançando o aluno para um livro mais avançado (${newBook}).\n\n` +
    `${who} está atualmente no ${referenceBook}.\n\n` +
    `Tem certeza que deseja progredir?`
  )
}

export type BookProgressionCheck =
  | { ok: true }
  | { ok: false; code: 'RETROGRADE'; message: string; referenceBook: string }
  | { ok: false; code: 'ADVANCE_NEEDS_CONFIRM'; message: string; referenceBook: string; newBook: string }

/** Livro de referência para comparar progressão (última aula / edição da última aula). */
export function resolveBookProgressionReference(options: {
  latestRecordBook: string | null | undefined
  latestRecordId?: string | null
  editingRecordId?: string | null
  editingOriginalBook?: string | null
}): string | null {
  const latestBook = options.latestRecordBook?.trim() || null
  if (!options.editingRecordId) return latestBook
  if (options.latestRecordId === options.editingRecordId) {
    return options.editingOriginalBook?.trim() || null
  }
  return latestBook
}

export function checkBookProgression(
  newBook: string | null | undefined,
  referenceBook: string | null | undefined,
  confirmAdvance?: boolean
): BookProgressionCheck {
  const ref = referenceBook?.trim() || null
  const next = newBook?.trim() || null
  if (!ref || !next) return { ok: true }

  const refNum = parseBookNumberFromName(ref)
  const newNum = parseBookNumberFromName(next)
  if (refNum == null || newNum == null) return { ok: true }

  if (newNum < refNum) {
    return {
      ok: false,
      code: 'RETROGRADE',
      message: BOOK_RETROGRADE_MESSAGE(ref),
      referenceBook: ref,
    }
  }
  if (newNum > refNum && !confirmAdvance) {
    return {
      ok: false,
      code: 'ADVANCE_NEEDS_CONFIRM',
      message: bookAdvanceConfirmMessage(ref, next),
      referenceBook: ref,
      newBook: next,
    }
  }
  return { ok: true }
}

type LessonRecordBookRow = { id: string; book: string | null }

type PrismaLessonRecordClient = {
  lessonRecord: {
    findMany: (args: unknown) => Promise<LessonRecordBookRow[]>
  }
}

export async function getLatestLessonRecordWithBook(
  prismaClient: PrismaLessonRecordClient,
  enrollmentId: string
): Promise<{ recordId: string; book: string } | null> {
  const rows = await prismaClient.lessonRecord.findMany({
    where: {
      lesson: { enrollmentId },
      AND: [{ book: { not: null } }, { NOT: { book: '' } }],
    },
    select: { id: true, book: true },
    orderBy: { lesson: { startAt: 'desc' } },
    take: 1,
  })
  const row = rows[0]
  const book = row?.book?.trim()
  if (!row || !book) return null
  return { recordId: row.id, book }
}

export async function assertLessonRecordBookProgression(
  prismaClient: PrismaLessonRecordClient,
  enrollmentId: string,
  newBook: string | null | undefined,
  options: {
    excludeRecordId?: string
    existingBookOnRecord?: string | null
    confirmBookAdvance?: boolean
  } = {}
): Promise<BookProgressionCheck> {
  const latest = await getLatestLessonRecordWithBook(prismaClient, enrollmentId)
  const reference = resolveBookProgressionReference({
    latestRecordBook: latest?.book,
    latestRecordId: latest?.recordId,
    editingRecordId: options.excludeRecordId,
    editingOriginalBook: options.existingBookOnRecord,
  })
  return checkBookProgression(newBook, reference, options.confirmBookAdvance)
}

export function findLatestRecordBookFromList<
  T extends {
    id: string
    book: string | null
    lesson: { startAt: string; enrollment: { id: string } }
  },
>(records: T[], enrollmentId: string): { recordId: string; book: string } | null {
  const sorted = records
    .filter((r) => r.lesson.enrollment.id === enrollmentId && r.book?.trim())
    .sort((a, b) => new Date(b.lesson.startAt).getTime() - new Date(a.lesson.startAt).getTime())
  const top = sorted[0]
  if (!top?.book?.trim()) return null
  return { recordId: top.id, book: top.book.trim() }
}

export function isBookOptionBelowReference(
  bookName: string,
  referenceBook: string | null | undefined
): boolean {
  const refNum = parseBookNumberFromName(referenceBook)
  const optNum = parseBookNumberFromName(bookName)
  if (refNum == null || optNum == null) return false
  return optNum < refNum
}
