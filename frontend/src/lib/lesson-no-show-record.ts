import { prisma } from '@/lib/prisma'
import { getPreviousLessonRecordForEnrollment } from '@/lib/lesson-record-previous'

export const NO_SHOW_PLACEHOLDER = '0000'

export function getCancelamentoAntecedenciaHoras(
  escolaMatricula: string | null | undefined,
  cancelamentoAntecedenciaHoras: number | null | undefined
): number {
  const isYoubecome = escolaMatricula === 'YOUBECOME'
  if (
    cancelamentoAntecedenciaHoras != null &&
    typeof cancelamentoAntecedenciaHoras === 'number' &&
    !Number.isNaN(cancelamentoAntecedenciaHoras)
  ) {
    return cancelamentoAntecedenciaHoras
  }
  return isYoubecome ? 24 : 6
}

/** Cancelamento dentro do prazo mínimo de antecedência (em cima da hora). */
export function isLessonCancelamentoTardio(
  lessonStartAt: Date | string,
  escolaMatricula: string | null | undefined,
  cancelamentoAntecedenciaHoras: number | null | undefined,
  now = new Date()
): boolean {
  const lessonDate = typeof lessonStartAt === 'string' ? new Date(lessonStartAt) : lessonStartAt
  if (Number.isNaN(lessonDate.getTime())) return false
  const horas = getCancelamentoAntecedenciaHoras(escolaMatricula, cancelamentoAntecedenciaHoras)
  const diffHoras = (lessonDate.getTime() - now.getTime()) / (1000 * 60 * 60)
  return diffHoras < horas
}

const AUTO_NO_SHOW_NOTES =
  'Registro automático: aluno não compareceu (cancelamento em cima da hora sem reposição).'

/** Cria registro automático de não comparecimento se ainda não existir. */
export async function createNoShowLessonRecordIfMissing(lessonId: string): Promise<boolean> {
  const lessonRecord = (prisma as { lessonRecord?: { findUnique: (args: unknown) => Promise<unknown>; create: (args: unknown) => Promise<unknown> } })
    .lessonRecord
  if (!lessonRecord?.create || !lessonRecord.findUnique) return false

  const existing = await lessonRecord.findUnique({ where: { lessonId } })
  if (existing) return false

  const lesson = await prisma.lesson.findUnique({
    where: { id: lessonId },
    include: {
      enrollment: {
        select: { id: true, curso: true, tipoAula: true, nomeGrupo: true },
      },
    },
  })
  if (!lesson) return false

  const enrollmentId = lesson.enrollmentId
  const curso = (lesson.enrollment as { curso?: string | null })?.curso ?? null
  const tempo = lesson.durationMinutes ?? 60

  const lastRecord = await getPreviousLessonRecordForEnrollment(enrollmentId, { excludeLessonId: lessonId })

  const book =
    lastRecord?.book?.trim() && lastRecord.book.trim() !== NO_SHOW_PLACEHOLDER
      ? lastRecord.book.trim()
      : null
  const lastPage =
    lastRecord?.lastPage?.trim() && lastRecord.lastPage.trim() !== NO_SHOW_PLACEHOLDER
      ? lastRecord.lastPage.trim()
      : null
  const lessonType = lastRecord?.lessonType ?? 'NORMAL'
  const recordCurso = lastRecord?.curso ?? curso

  await lessonRecord.create({
    data: {
      lessonId,
      status: 'CANCELLED_NO_REPLACEMENT',
      presence: 'NAO_COMPARECEU',
      lessonType,
      curso: recordCurso,
      tempoAulaMinutos: tempo,
      book,
      lastPage,
      assignedHomework: null,
      homeworkDone: 'NAO',
      conversationDescription: null,
      notes: AUTO_NO_SHOW_NOTES,
      notesForStudent: null,
      notesForParents: null,
      gradeGrammar: null,
      gradeSpeaking: null,
      gradeListening: null,
      gradeUnderstanding: null,
    },
  })

  return true
}
