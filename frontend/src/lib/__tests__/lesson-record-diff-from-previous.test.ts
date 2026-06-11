import {
  assertLessonRecordDiffersFromPrevious,
  lessonRecordMatchesPrevious,
} from '@/lib/lesson-record-diff-from-previous'

const basePrevious = {
  presence: 'PRESENTE',
  lessonType: 'NORMAL',
  book: 'Book 2',
  lastPage: '45',
  assignedHomework: 'Ex. 1-5',
  homeworkDone: 'SIM',
  conversationDescription: null,
  notes: 'Boa aula',
  notesForStudent: null,
  notesForParents: null,
  gradeGrammar: null,
  gradeSpeaking: null,
  gradeListening: null,
  gradeUnderstanding: null,
  studentsPresence: null,
}

describe('lessonRecordMatchesPrevious', () => {
  it('detecta payload idêntico ao anterior', () => {
    expect(lessonRecordMatchesPrevious({ ...basePrevious }, { ...basePrevious })).toBe(true)
  })

  it('permite salvar quando notes mudou', () => {
    expect(
      lessonRecordMatchesPrevious({ ...basePrevious, notes: 'Aluno faltou hoje' }, { ...basePrevious })
    ).toBe(false)
  })

  it('permite salvar quando lastPage mudou', () => {
    expect(
      lessonRecordMatchesPrevious({ ...basePrevious, lastPage: '46' }, { ...basePrevious })
    ).toBe(false)
  })

  it('permite salvar quando presença mudou', () => {
    expect(
      lessonRecordMatchesPrevious({ ...basePrevious, presence: 'NAO_COMPARECEU' }, { ...basePrevious })
    ).toBe(false)
  })

  it('normaliza strings vazias e null', () => {
    expect(
      lessonRecordMatchesPrevious(
        { ...basePrevious, notesForStudent: '' },
        { ...basePrevious, notesForStudent: null }
      )
    ).toBe(true)
  })

  it('compara presenças de grupo', () => {
    const group = [
      { enrollmentId: 'a', presence: 'PRESENTE' },
      { enrollmentId: 'b', presence: 'NAO_COMPARECEU' },
    ]
    expect(
      lessonRecordMatchesPrevious(
        { ...basePrevious, studentsPresence: [...group].reverse() },
        { ...basePrevious, studentsPresence: group }
      )
    ).toBe(true)
    expect(
      lessonRecordMatchesPrevious(
        { ...basePrevious, studentsPresence: [{ enrollmentId: 'a', presence: 'ATRASADO' }] },
        { ...basePrevious, studentsPresence: group }
      )
    ).toBe(false)
  })
})

describe('assertLessonRecordDiffersFromPrevious', () => {
  it('ok quando não há registro anterior', () => {
    expect(assertLessonRecordDiffersFromPrevious(basePrevious, null)).toEqual({ ok: true })
  })

  it('bloqueia quando igual ao anterior', () => {
    const result = assertLessonRecordDiffersFromPrevious(basePrevious, basePrevious)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.message).toContain('Altere pelo menos um campo')
    }
  })
})
