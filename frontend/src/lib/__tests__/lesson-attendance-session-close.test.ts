import {
  LESSON_ATTENDANCE_TOLERANCE_MINUTES,
  lessonAttendanceWindowEndAt,
} from '@/lib/lesson-attendance-service'
import { attendanceSessionDurationSeconds } from '@/lib/lesson-attendance-summary'

describe('lesson attendance session close', () => {
  const start = new Date('2026-06-11T10:00:00.000Z')
  const durationMinutes = 30

  it('window end inclui tolerância após a duração da aula', () => {
    const end = lessonAttendanceWindowEndAt(start, durationMinutes)
    const expected = new Date(
      start.getTime() + (durationMinutes + LESSON_ATTENDANCE_TOLERANCE_MINUTES) * 60 * 1000
    )
    expect(end.getTime()).toBe(expected.getTime())
  })

  it('limita duração exibida ao fim da janela mesmo com sessão ACTIVE', () => {
    const joinedAt = new Date('2026-06-11T10:00:00.000Z')
    const windowEnd = lessonAttendanceWindowEndAt(start, durationMinutes)
    const now = new Date('2026-06-11T14:00:00.000Z')

    const seconds = attendanceSessionDurationSeconds(
      joinedAt,
      null,
      now,
      'ACTIVE',
      now,
      windowEnd
    )

    expect(seconds).toBe((durationMinutes + LESSON_ATTENDANCE_TOLERANCE_MINUTES) * 60)
  })

  it('usa saída registrada quando menor que o teto da janela', () => {
    const joinedAt = new Date('2026-06-11T10:00:00.000Z')
    const leftAt = new Date('2026-06-11T10:29:00.000Z')
    const windowEnd = lessonAttendanceWindowEndAt(start, durationMinutes)
    const now = new Date('2026-06-11T14:00:00.000Z')

    const seconds = attendanceSessionDurationSeconds(
      joinedAt,
      leftAt,
      now,
      'ENDED',
      now,
      windowEnd
    )

    expect(seconds).toBe(29 * 60)
  })
})
