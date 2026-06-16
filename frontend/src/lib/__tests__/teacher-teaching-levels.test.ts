import {
  studentLevelVariantsForTeacherMatch,
  teacherCanTeachStudentLevel,
} from '@/lib/teacher-teaching-levels'

const ALL_TEACHER_LEVELS = ['A1', 'A2', 'B1.1', 'B1.2', 'B2.1', 'B2.2', 'C1.1', 'C1.2']

describe('teacher-teaching-levels', () => {
  describe('studentLevelVariantsForTeacherMatch', () => {
    it('mapeia nível do catálogo B1 para fases do professor', () => {
      expect(studentLevelVariantsForTeacherMatch('B1')).toEqual(['B1.1', 'B1.2'])
    })

    it('mantém fase decimal do livro Book N', () => {
      expect(studentLevelVariantsForTeacherMatch('B1.1')).toEqual(['B1.1'])
    })
  })

  describe('teacherCanTeachStudentLevel', () => {
    it('professor com todos os níveis aceita aluno em B1 (catálogo)', () => {
      expect(teacherCanTeachStudentLevel(ALL_TEACHER_LEVELS, 'B1')).toBe(true)
    })

    it('professor com B1.1 e B1.2 aceita aluno em B1 (catálogo)', () => {
      expect(teacherCanTeachStudentLevel(['B1.1', 'B1.2'], 'B1')).toBe(true)
    })

    it('professor só com B1.1 não aceita aluno em B2 (catálogo)', () => {
      expect(teacherCanTeachStudentLevel(['B1.1'], 'B2')).toBe(false)
    })

    it('professor sem níveis cadastrados não bloqueia (legado)', () => {
      expect(teacherCanTeachStudentLevel([], 'B1')).toBe(true)
      expect(teacherCanTeachStudentLevel(null, 'C1')).toBe(true)
    })

    it('aluno sem nível definido não bloqueia', () => {
      expect(teacherCanTeachStudentLevel(['A1'], null)).toBe(true)
      expect(teacherCanTeachStudentLevel(['A1'], 'não definido')).toBe(true)
    })
  })
})
