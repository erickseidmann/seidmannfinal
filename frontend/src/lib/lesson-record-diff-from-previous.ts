/**
 * Valida que um novo registro de aula difere do último registro da matrícula.
 * Impede salvar cópia idêntica (ex.: após "Preencher com dados da última aula").
 */

export const LESSON_RECORD_MUST_DIFFER_MESSAGE =
  'Altere pelo menos um campo em relação à última aula (ex.: página, presença ou observações) antes de salvar.'

export type LessonRecordCompareInput = {
  presence?: string | null
  lessonType?: string | null
  book?: string | null
  lastPage?: string | null
  assignedHomework?: string | null
  homeworkDone?: string | null
  conversationDescription?: string | null
  notes?: string | null
  notesForStudent?: string | null
  notesForParents?: string | null
  gradeGrammar?: number | string | null
  gradeSpeaking?: number | string | null
  gradeListening?: number | string | null
  gradeUnderstanding?: number | string | null
  studentsPresence?: { enrollmentId: string; presence: string }[] | null
}

function normText(value: unknown): string {
  if (value == null) return ''
  return String(value).trim()
}

function normGrade(value: unknown): string {
  if (value == null || value === '') return ''
  const n = Number(value)
  return Number.isNaN(n) ? normText(value) : String(n)
}

function normStudentsPresence(
  rows: { enrollmentId: string; presence: string }[] | null | undefined
): string {
  if (!rows?.length) return ''
  return [...rows]
    .sort((a, b) => a.enrollmentId.localeCompare(b.enrollmentId))
    .map((s) => `${s.enrollmentId}:${s.presence}`)
    .join('|')
}

/** Retorna true se todos os campos pedagógicos comparáveis são iguais. */
export function lessonRecordMatchesPrevious(
  incoming: LessonRecordCompareInput,
  previous: LessonRecordCompareInput
): boolean {
  return (
    normText(incoming.presence) === normText(previous.presence) &&
    normText(incoming.lessonType) === normText(previous.lessonType) &&
    normText(incoming.book) === normText(previous.book) &&
    normText(incoming.lastPage) === normText(previous.lastPage) &&
    normText(incoming.assignedHomework) === normText(previous.assignedHomework) &&
    normText(incoming.homeworkDone) === normText(previous.homeworkDone) &&
    normText(incoming.conversationDescription) === normText(previous.conversationDescription) &&
    normText(incoming.notes) === normText(previous.notes) &&
    normText(incoming.notesForStudent) === normText(previous.notesForStudent) &&
    normText(incoming.notesForParents) === normText(previous.notesForParents) &&
    normGrade(incoming.gradeGrammar) === normGrade(previous.gradeGrammar) &&
    normGrade(incoming.gradeSpeaking) === normGrade(previous.gradeSpeaking) &&
    normGrade(incoming.gradeListening) === normGrade(previous.gradeListening) &&
    normGrade(incoming.gradeUnderstanding) === normGrade(previous.gradeUnderstanding) &&
    normStudentsPresence(incoming.studentsPresence) ===
      normStudentsPresence(previous.studentsPresence)
  )
}

export function assertLessonRecordDiffersFromPrevious(
  incoming: LessonRecordCompareInput,
  previous: LessonRecordCompareInput | null | undefined
): { ok: true } | { ok: false; message: string } {
  if (!previous) return { ok: true }
  if (lessonRecordMatchesPrevious(incoming, previous)) {
    return { ok: false, message: LESSON_RECORD_MUST_DIFFER_MESSAGE }
  }
  return { ok: true }
}

export function lessonRecordCompareFromApiBody(body: {
  presence?: string | null
  lessonType?: string | null
  book?: string | null
  lastPage?: string | null
  assignedHomework?: string | null
  homeworkDone?: string | null
  conversationDescription?: string | null
  notes?: string | null
  notesForStudent?: string | null
  notesForParents?: string | null
  gradeGrammar?: number | string | null
  gradeSpeaking?: number | string | null
  gradeListening?: number | string | null
  gradeUnderstanding?: number | string | null
  studentsPresence?: { enrollmentId: string; presence: string }[] | null
}): LessonRecordCompareInput {
  return {
    presence: body.presence,
    lessonType: body.lessonType,
    book: body.book,
    lastPage: body.lastPage,
    assignedHomework: body.assignedHomework,
    homeworkDone: body.homeworkDone,
    conversationDescription: body.conversationDescription,
    notes: body.notes,
    notesForStudent: body.notesForStudent,
    notesForParents: body.notesForParents,
    gradeGrammar: body.gradeGrammar,
    gradeSpeaking: body.gradeSpeaking,
    gradeListening: body.gradeListening,
    gradeUnderstanding: body.gradeUnderstanding,
    studentsPresence: body.studentsPresence,
  }
}

type DbPreviousRecord = {
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

export function lessonRecordCompareFromProfessorForm(
  form: {
    presence: string
    lessonType: string
    book: string
    lastPage: string
    assignedHomework: string
    homeworkDone: string
    conversationDescription: string
    notes: string
    notesForStudent: string
    notesForParents: string
    gradeGrammar: string | number
    gradeSpeaking: string | number
    gradeListening: string | number
    gradeUnderstanding: string | number
  },
  options?: {
    studentsPresence?: { enrollmentId: string; presence: string }[]
    lessonType?: string
  }
): LessonRecordCompareInput {
  const lessonType = options?.lessonType ?? form.lessonType
  return {
    presence: form.presence,
    lessonType,
    book: form.book || null,
    lastPage: form.lastPage || null,
    assignedHomework: form.assignedHomework || null,
    homeworkDone: form.homeworkDone || null,
    conversationDescription:
      lessonType === 'CONVERSAÇÃO' ? form.conversationDescription || null : null,
    notes: form.notes || null,
    notesForStudent: form.notesForStudent || null,
    notesForParents: form.notesForParents || null,
    gradeGrammar:
      lessonType === 'AVALIACAO' && form.gradeGrammar !== '' ? form.gradeGrammar : null,
    gradeSpeaking:
      lessonType === 'AVALIACAO' && form.gradeSpeaking !== '' ? form.gradeSpeaking : null,
    gradeListening:
      lessonType === 'AVALIACAO' && form.gradeListening !== '' ? form.gradeListening : null,
    gradeUnderstanding:
      lessonType === 'AVALIACAO' && form.gradeUnderstanding !== '' ? form.gradeUnderstanding : null,
    studentsPresence: options?.studentsPresence,
  }
}

export function lessonRecordCompareFromUltimaRecord(record: {
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
}): LessonRecordCompareInput {
  return lessonRecordCompareFromDbRecord(record)
}

export function lessonRecordCompareFromDbRecord(record: DbPreviousRecord): LessonRecordCompareInput {
  return {
    presence: record.presence,
    lessonType: record.lessonType,
    book: record.book,
    lastPage: record.lastPage,
    assignedHomework: record.assignedHomework,
    homeworkDone: record.homeworkDone,
    conversationDescription: record.conversationDescription,
    notes: record.notes,
    notesForStudent: record.notesForStudent,
    notesForParents: record.notesForParents,
    gradeGrammar: record.gradeGrammar,
    gradeSpeaking: record.gradeSpeaking,
    gradeListening: record.gradeListening,
    gradeUnderstanding: record.gradeUnderstanding,
    studentsPresence: record.studentPresences?.map((s) => ({
      enrollmentId: s.enrollmentId,
      presence: s.presence,
    })),
  }
}
