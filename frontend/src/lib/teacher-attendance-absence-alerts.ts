import { prisma } from '@/lib/prisma'
import { isLessonCancelledFamily, isLessonScheduledStatus } from '@/lib/lesson-status'
import {
  LESSON_ATTENDANCE_TRACKING_SINCE,
  TEACHER_ABSENCE_GRACE_MINUTES,
  attendanceSessionDurationSeconds,
  isTeacherAbsentFromLesson,
} from '@/lib/lesson-attendance-summary'
import { createTeacherAbsenceReportWithTodo } from '@/lib/teacher-absence-report'

function formatLessonDateTime(d: Date): string {
  return d.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function buildAttendanceTeacherAbsenceTodoText(params: {
  studentName: string
  teacherName: string
  lessonStart: Date
}): string {
  const when = formatLessonDateTime(params.lessonStart)
  return `Professor ${params.teacherName} não entrou na videochamada da aula de ${params.studentName} (${when}) — detectado após ${TEACHER_ABSENCE_GRACE_MINUTES} min sem entrada`
}

/**
 * Cria alertas no dashboard (TeacherAbsenceReport + todo) para aulas em que o professor
 * não entrou na chamada dentro do prazo de tolerância.
 */
export async function syncTeacherAttendanceAbsenceReports(now = new Date()): Promise<number> {
  const graceMs = TEACHER_ABSENCE_GRACE_MINUTES * 60 * 1000
  const latestStart = new Date(now.getTime() - graceMs)

  const lessons = await prisma.lesson.findMany({
    where: {
      startAt: { gte: LESSON_ATTENDANCE_TRACKING_SINCE, lte: latestStart },
    },
    select: {
      id: true,
      startAt: true,
      durationMinutes: true,
      status: true,
      enrollmentId: true,
      teacherId: true,
      enrollment: { select: { nome: true } },
      teacher: { select: { id: true, nome: true } },
      lessonAttendances: {
        select: { role: true, joinedAt: true, leftAt: true, lastSeen: true, status: true },
      },
      teacherAbsenceReports: {
        where: { reportType: 'ABSENT' },
        select: { id: true },
        take: 1,
      },
    },
  })

  let created = 0

  for (const lesson of lessons) {
    if (!lesson.teacherId || !lesson.teacher) continue
    if (!isLessonScheduledStatus(lesson.status)) continue
    if (isLessonCancelledFamily(lesson.status)) continue
    if (lesson.teacherAbsenceReports.length > 0) continue

    const teacherTimeSeconds = lesson.lessonAttendances
      .filter((r) => r.role === 'TEACHER')
      .reduce(
        (sum, r) =>
          sum + attendanceSessionDurationSeconds(r.joinedAt, r.leftAt, r.lastSeen, r.status, now),
        0
      )

    const absent = isTeacherAbsentFromLesson({
      lessonStartAt: lesson.startAt,
      durationMinutes: lesson.durationMinutes ?? 60,
      teacherTimeSeconds,
      hasAnyAttendanceRow: lesson.lessonAttendances.length > 0,
      now,
      mode: 'monitoring',
    })

    if (!absent) continue

    try {
      await createTeacherAbsenceReportWithTodo({
        lessonId: lesson.id,
        enrollmentId: lesson.enrollmentId,
        teacherId: lesson.teacherId,
        studentName: lesson.enrollment.nome,
        teacherName: lesson.teacher.nome,
        lessonStart: lesson.startAt,
        reportType: 'ABSENT',
        todoText: buildAttendanceTeacherAbsenceTodoText({
          studentName: lesson.enrollment.nome,
          teacherName: lesson.teacher.nome,
          lessonStart: lesson.startAt,
        }),
      })
      created++
    } catch (err) {
      console.warn('[syncTeacherAttendanceAbsenceReports] lesson', lesson.id, err)
    }
  }

  return created
}
