import {
  dedupeGroupLessonsForStudent,
} from '@/lib/student-group-lesson-access'

describe('dedupeGroupLessonsForStudent', () => {
  it('mantém uma aula por slot de grupo com id estável', () => {
    const lessons = [
      {
        id: 'lesson-b',
        enrollmentId: 'enr-b',
        teacherId: 't1',
        startAt: '2026-06-12T12:00:00.000Z',
        enrollment: { id: 'enr-b', tipoAula: 'GRUPO', nomeGrupo: 'Turma A' },
      },
      {
        id: 'lesson-a',
        enrollmentId: 'enr-a',
        teacherId: 't1',
        startAt: '2026-06-12T12:00:00.000Z',
        enrollment: { id: 'enr-a', tipoAula: 'GRUPO', nomeGrupo: 'Turma A' },
      },
    ]

    const result = dedupeGroupLessonsForStudent(lessons)
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('lesson-a')
  })

  it('não deduplica aulas particulares', () => {
    const lessons = [
      {
        id: 'lesson-1',
        enrollmentId: 'enr-1',
        teacherId: 't1',
        startAt: '2026-06-12T12:00:00.000Z',
        enrollment: { id: 'enr-1', tipoAula: 'PARTICULAR', nomeGrupo: null },
      },
      {
        id: 'lesson-2',
        enrollmentId: 'enr-2',
        teacherId: 't1',
        startAt: '2026-06-12T13:00:00.000Z',
        enrollment: { id: 'enr-2', tipoAula: 'PARTICULAR', nomeGrupo: null },
      },
    ]

    expect(dedupeGroupLessonsForStudent(lessons)).toHaveLength(2)
  })
})
