import { toDateKeyInTZ } from '@/lib/datetime'

function addDaysToDateKey(dateKey: string, deltaDays: number): string {
  const [y, m, d] = dateKey.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d, 12, 0, 0))
  dt.setUTCDate(dt.getUTCDate() + deltaDays)
  return toDateKeyInTZ(dt)
}

export function formatInactiveDateLabel(inactiveAtIso: string): string {
  return new Date(inactiveAtIso).toLocaleDateString('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}

/** Aula nos N dias civis anteriores à data de inativação do aluno (fuso Brasil). */
export function isLessonInInactivationWarningWindow(
  lessonStartAt: string,
  inactiveAtIso: string | null | undefined,
  daysBefore = 10
): boolean {
  if (!inactiveAtIso) return false
  const inactiveKey = toDateKeyInTZ(new Date(inactiveAtIso))
  const lessonKey = toDateKeyInTZ(new Date(lessonStartAt))
  const windowStartKey = addDaysToDateKey(inactiveKey, -daysBefore)
  return lessonKey >= windowStartKey && lessonKey < inactiveKey
}
