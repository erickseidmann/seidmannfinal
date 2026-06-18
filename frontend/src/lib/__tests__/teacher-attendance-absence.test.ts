import {
  TEACHER_ABSENCE_GRACE_MINUTES,
  isTeacherAbsentFromLesson,
} from '@/lib/lesson-attendance-summary'

describe('teacher absence grace period', () => {
  const start = new Date('2026-06-11T14:00:00.000Z')

  it('não marca ausência antes do prazo de tolerância', () => {
    const now = new Date(start.getTime() + (TEACHER_ABSENCE_GRACE_MINUTES - 1) * 60 * 1000)
    expect(
      isTeacherAbsentFromLesson({
        lessonStartAt: start,
        durationMinutes: 30,
        teacherTimeSeconds: 0,
        hasAnyAttendanceRow: false,
        now,
        mode: 'monitoring',
      })
    ).toBe(false)
  })

  it('marca ausência após o prazo de tolerância sem entrada do professor', () => {
    const now = new Date(start.getTime() + TEACHER_ABSENCE_GRACE_MINUTES * 60 * 1000)
    expect(
      isTeacherAbsentFromLesson({
        lessonStartAt: start,
        durationMinutes: 30,
        teacherTimeSeconds: 0,
        hasAnyAttendanceRow: false,
        now,
        mode: 'monitoring',
      })
    ).toBe(true)
  })

  it('não marca ausência se o professor entrou', () => {
    const now = new Date(start.getTime() + 10 * 60 * 1000)
    expect(
      isTeacherAbsentFromLesson({
        lessonStartAt: start,
        durationMinutes: 30,
        teacherTimeSeconds: 60,
        hasAnyAttendanceRow: true,
        now,
        mode: 'monitoring',
      })
    ).toBe(false)
  })
})
