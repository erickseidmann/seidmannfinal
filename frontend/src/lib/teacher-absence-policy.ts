import type { TeacherAbsenceReportType } from '@prisma/client'

/**
 * Regra operacional: professor ausente confirmado → aluno tem direito à reposição;
 * a gestão cancela a aula (CANCELLED_BY_TEACHER) e reagenda no calendário (REPOSICAO).
 * Atraso do professor é tratado caso a caso, sem reposição automática.
 */
export const TEACHER_ABSENCE_REPLACEMENT_RULE =
  'Professor ausente confirmado: a aula é cancelada pelo professor e a gestão deve agendar uma reposição para o aluno.'

export const TEACHER_LATE_REPORT_RULE =
  'Atraso do professor: registrar e acompanhar; reposição só se a aula não puder ser realizada.'

export function teacherAbsenceReportEntitlesReplacement(
  reportType: TeacherAbsenceReportType
): boolean {
  return reportType === 'ABSENT'
}

export function appendTeacherAbsenceConfirmedNote(
  notesAtuais: string | null,
  params: { adminName: string; studentName: string; lessonWhen: Date }
): string {
  const when = params.lessonWhen.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
  const line = `[${new Date().toLocaleString('pt-BR')}] Professor ausente confirmado por ${params.adminName} (reporte de ${params.studentName}, aula de ${when}). Cancelada para reposição.`
  if (notesAtuais?.trim()) return `${notesAtuais.trim()}\n${line}`
  return line
}
