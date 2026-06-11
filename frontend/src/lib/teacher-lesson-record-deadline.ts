import { getTimeInTZ, toDateKeyInTZ } from '@/lib/datetime'

/** Dias após a aula para registrar (aulas a partir da data de vigência da regra). */
export const TEACHER_LESSON_RECORD_DEADLINE_DAYS = 3

/**
 * Data em que a regra de 3 dias passou a valer (fuso Brasil, YYYY-MM-DD).
 * Aulas anteriores a esta data, ainda sem registro, permanecem liberadas (backlog).
 */
export const TEACHER_LESSON_RECORD_POLICY_EFFECTIVE_DATE_KEY = '2026-06-04'

export const TEACHER_LESSON_RECORD_DEADLINE_EXPIRED_MESSAGE =
  'O prazo de 3 dias para registrar esta aula expirou. Entre em contato com a administração se precisar registrar com atraso.'

function addDaysToDateKey(dateKey: string, deltaDays: number): string {
  const [y, m, d] = dateKey.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d, 12, 0, 0))
  dt.setUTCDate(dt.getUTCDate() + deltaDays)
  return toDateKeyInTZ(dt)
}

export function isTeacherLessonRecordGrandfathered(lessonStartAt: string | Date): boolean {
  const lessonKey = toDateKeyInTZ(new Date(lessonStartAt))
  return lessonKey < TEACHER_LESSON_RECORD_POLICY_EFFECTIVE_DATE_KEY
}

export function getTeacherLessonRecordDeadlineDateKey(lessonStartAt: string | Date): string {
  const lessonKey = toDateKeyInTZ(new Date(lessonStartAt))
  return addDaysToDateKey(lessonKey, TEACHER_LESSON_RECORD_DEADLINE_DAYS)
}

export function isTeacherLessonRecordDeadlineExpired(
  lessonStartAt: string | Date,
  now: Date = new Date()
): boolean {
  if (isTeacherLessonRecordGrandfathered(lessonStartAt)) return false
  const todayKey = toDateKeyInTZ(now)
  const deadlineKey = getTeacherLessonRecordDeadlineDateKey(lessonStartAt)
  return todayKey > deadlineKey
}

/** Aula ainda não começou (dia futuro ou horário de hoje ainda não passou). */
export function isLessonStartNotYetRegisterable(
  lessonStartAt: string | Date,
  now: Date = new Date()
): boolean {
  const lessonKey = toDateKeyInTZ(new Date(lessonStartAt))
  const todayKey = toDateKeyInTZ(now)
  if (lessonKey > todayKey) return true
  if (lessonKey < todayKey) return false
  const lessonTime = getTimeInTZ(new Date(lessonStartAt).toISOString())
  const nowTime = getTimeInTZ(now.toISOString())
  const lessonMinutes = lessonTime.hour * 60 + lessonTime.minute
  const nowMinutes = nowTime.hour * 60 + nowTime.minute
  return nowMinutes <= lessonMinutes
}

export function canTeacherCreateLessonRecordByDeadline(
  lessonStartAt: string | Date,
  now: Date = new Date()
): boolean {
  if (isTeacherLessonRecordGrandfathered(lessonStartAt)) return true
  const todayKey = toDateKeyInTZ(now)
  const deadlineKey = getTeacherLessonRecordDeadlineDateKey(lessonStartAt)
  return todayKey <= deadlineKey
}

export function assertTeacherCanCreateLessonRecord(
  lessonStartAt: Date,
  now: Date = new Date(),
  options?: { unlockApproved?: boolean }
): { ok: true } | { ok: false; message: string } {
  if (isLessonStartNotYetRegisterable(lessonStartAt, now)) {
    return { ok: false, message: 'Não é possível realizar o registro de aulas futuras.' }
  }
  if (!options?.unlockApproved && !canTeacherCreateLessonRecordByDeadline(lessonStartAt, now)) {
    return { ok: false, message: TEACHER_LESSON_RECORD_DEADLINE_EXPIRED_MESSAGE }
  }
  return { ok: true }
}

export function canTeacherRegisterLessonConsideringUnlock(
  lessonStartAt: string | Date,
  unlockApproved: boolean,
  now: Date = new Date()
): boolean {
  if (isLessonStartNotYetRegisterable(lessonStartAt, now)) return false
  if (unlockApproved) return true
  return canTeacherCreateLessonRecordByDeadline(lessonStartAt, now)
}

export function formatTeacherRecordDeadlineLabel(
  lessonStartAt: string | Date,
  locale = 'pt-BR'
): string {
  const deadlineKey = getTeacherLessonRecordDeadlineDateKey(lessonStartAt)
  const [y, m, d] = deadlineKey.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d, 12, 0, 0)).toLocaleDateString(locale, {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}
