import { prisma } from '@/lib/prisma'
import {
  lessonRecordCompareFromDbRecord,
  type LessonRecordCompareInput,
} from '@/lib/lesson-record-diff-from-previous'

const NO_SHOW_BOOK_PLACEHOLDER = '0000'

export type PreviousLessonRecordRow = {
  presence: string
  lessonType: string
  book: string | null
  lastPage: string | null
  assignedHomework: string | null
  homeworkDone: string | null
  conversationDescription: string | null
  notes: string | null
  notesForStudent: string | null
  notesForParents: string | null
  gradeGrammar: number | null
  gradeSpeaking: number | null
  gradeListening: number | null
  gradeUnderstanding: number | null
  studentPresences?: { enrollmentId: string; presence: string }[]
}

function isPlaceholderRecord(record: { book: string | null }): boolean {
  const book = record.book?.trim()
  return book === NO_SHOW_BOOK_PLACEHOLDER
}

/** Último registro pedagógico da matrícula (ignora placeholders de falta automática). */
export async function getPreviousLessonRecordForEnrollment(
  enrollmentId: string,
  options?: { excludeLessonId?: string }
): Promise<PreviousLessonRecordRow | null> {
  const lessonRecord = (prisma as { lessonRecord?: { findMany: (args: unknown) => Promise<unknown[]> } })
    .lessonRecord
  if (!lessonRecord?.findMany) return null

  const excludeLessonId = options?.excludeLessonId
  const rows = (await lessonRecord.findMany({
    where: {
      lesson: {
        enrollmentId,
        ...(excludeLessonId ? { id: { not: excludeLessonId } } : {}),
      },
    },
    select: {
      presence: true,
      lessonType: true,
      book: true,
      lastPage: true,
      assignedHomework: true,
      homeworkDone: true,
      conversationDescription: true,
      notes: true,
      notesForStudent: true,
      notesForParents: true,
      gradeGrammar: true,
      gradeSpeaking: true,
      gradeListening: true,
      gradeUnderstanding: true,
      studentPresences: { select: { enrollmentId: true, presence: true } },
    },
    orderBy: { lesson: { startAt: 'desc' } },
    take: 15,
  })) as PreviousLessonRecordRow[]

  const meaningful = rows.find((r) => !isPlaceholderRecord(r))
  return meaningful ?? rows[0] ?? null
}

export async function getPreviousLessonRecordCompareInput(
  enrollmentId: string,
  excludeLessonId: string
): Promise<LessonRecordCompareInput | null> {
  const previous = await getPreviousLessonRecordForEnrollment(enrollmentId, { excludeLessonId })
  if (!previous) return null
  return lessonRecordCompareFromDbRecord(previous)
}
