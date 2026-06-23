import { prisma } from '@/lib/prisma'
import {
  canAdminEditLessonOnDate,
  isLessonOnPastCalendarDay,
} from '@/lib/lesson-past-edit'

/** Aula com solicitação liberada aguardando reagendamento por qualquer admin. */
export async function lessonHasReleasedPastEditRequest(lessonId: string): Promise<boolean> {
  const released = await prisma.lessonPastEditRequest.findFirst({
    where: { lessonId, status: 'RELEASED' },
    select: { id: true },
  })
  return !!released
}

/** Permite editar aula passada se for admin autorizado ou se a remarcação foi liberada. */
export async function canAdminEditLessonConsideringReleasedRequest(
  lessonId: string,
  lessonStartAt: Date | string,
  adminEmail: string | undefined | null,
  canApproveLateLessonEdits: boolean
): Promise<boolean> {
  if (
    canAdminEditLessonOnDate(lessonStartAt, adminEmail, {
      canApproveLateLessonEdits,
    })
  ) {
    return true
  }
  if (!isLessonOnPastCalendarDay(lessonStartAt)) return true
  return lessonHasReleasedPastEditRequest(lessonId)
}
