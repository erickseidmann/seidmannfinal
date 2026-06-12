import { prisma } from '@/lib/prisma'
import { getPreviousLessonRecordForEnrollment } from '@/lib/lesson-record-previous'

export const NO_SHOW_PLACEHOLDER = '0000'

export function getCancelamentoAntecedenciaHoras(
  escolaMatricula: string | null | undefined,
  cancelamentoAntecedenciaHoras: number | null | undefined
): number {
  const isYoubecome = escolaMatricula === 'YOUBECOME'
  if (
    cancelamentoAntecedenciaHoras != null &&
    typeof cancelamentoAntecedenciaHoras === 'number' &&
    !Number.isNaN(cancelamentoAntecedenciaHoras)
  ) {
    return cancelamentoAntecedenciaHoras
  }
  return isYoubecome ? 24 : 6
}

type EnrollmentAntecedencia = {
  id: string
  tipoAula?: string | null
  nomeGrupo?: string | null
  escolaMatricula?: string | null
  cancelamentoAntecedenciaHoras?: number | null
}

/** Horas de antecedência exibidas na UI (menor entre integrantes em grupo). */
export function getLessonCancelamentoAntecedenciaHoras(
  enrollmentId: string,
  enrollments: EnrollmentAntecedencia[]
): number {
  const enr = enrollments.find((e) => e.id === enrollmentId)
  if (!enr) return 6

  if (enr.tipoAula === 'GRUPO' && enr.nomeGrupo?.trim()) {
    const members = enrollments.filter(
      (e) => e.tipoAula === 'GRUPO' && e.nomeGrupo?.trim() === enr.nomeGrupo!.trim()
    )
    if (members.length === 0) {
      return getCancelamentoAntecedenciaHoras(enr.escolaMatricula, enr.cancelamentoAntecedenciaHoras)
    }
    return Math.min(
      ...members.map((m) =>
        getCancelamentoAntecedenciaHoras(m.escolaMatricula, m.cancelamentoAntecedenciaHoras)
      )
    )
  }

  return getCancelamentoAntecedenciaHoras(enr.escolaMatricula, enr.cancelamentoAntecedenciaHoras)
}

/** Versão síncrona para o calendário admin (lista de matrículas já carregada). */
export function isLessonCancelamentoTardioForEnrollments(
  lessonStartAt: Date | string,
  enrollmentId: string,
  enrollments: EnrollmentAntecedencia[],
  now = new Date()
): boolean {
  const enr = enrollments.find((e) => e.id === enrollmentId)
  if (!enr) return false

  if (enr.tipoAula === 'GRUPO' && enr.nomeGrupo?.trim()) {
    const members = enrollments.filter(
      (e) => e.tipoAula === 'GRUPO' && e.nomeGrupo?.trim() === enr.nomeGrupo!.trim()
    )
    return members.some((m) =>
      isLessonCancelamentoTardio(
        lessonStartAt,
        m.escolaMatricula,
        m.cancelamentoAntecedenciaHoras,
        now
      )
    )
  }

  return isLessonCancelamentoTardio(
    lessonStartAt,
    enr.escolaMatricula,
    enr.cancelamentoAntecedenciaHoras,
    now
  )
}

/** Cancelamento dentro do prazo mínimo de antecedência (em cima da hora). */
export function isLessonCancelamentoTardio(
  lessonStartAt: Date | string,
  escolaMatricula: string | null | undefined,
  cancelamentoAntecedenciaHoras: number | null | undefined,
  now = new Date()
): boolean {
  const lessonDate = typeof lessonStartAt === 'string' ? new Date(lessonStartAt) : lessonStartAt
  if (Number.isNaN(lessonDate.getTime())) return false
  const horas = getCancelamentoAntecedenciaHoras(escolaMatricula, cancelamentoAntecedenciaHoras)
  const diffHoras = (lessonDate.getTime() - now.getTime()) / (1000 * 60 * 60)
  return diffHoras < horas
}

const AUTO_NO_SHOW_NOTES =
  'Registro automático: aluno não compareceu (cancelamento em cima da hora sem reposição).'

/** Cancelamento tardio considerando regra de cada integrante em aula de grupo. */
export async function resolveLessonCancelamentoTardio(
  lesson: { startAt: Date; enrollmentId: string },
  now = new Date()
): Promise<boolean> {
  const enrollment = await prisma.enrollment.findUnique({
    where: { id: lesson.enrollmentId },
    select: {
      escolaMatricula: true,
      cancelamentoAntecedenciaHoras: true,
      tipoAula: true,
      nomeGrupo: true,
    },
  })
  if (!enrollment) return false

  if (enrollment.tipoAula === 'GRUPO' && enrollment.nomeGrupo?.trim()) {
    const members = await prisma.enrollment.findMany({
      where: { tipoAula: 'GRUPO', nomeGrupo: enrollment.nomeGrupo.trim() },
      select: { escolaMatricula: true, cancelamentoAntecedenciaHoras: true },
    })
    return members.some((m) =>
      isLessonCancelamentoTardio(lesson.startAt, m.escolaMatricula, m.cancelamentoAntecedenciaHoras, now)
    )
  }

  return isLessonCancelamentoTardio(
    lesson.startAt,
    enrollment.escolaMatricula,
    enrollment.cancelamentoAntecedenciaHoras,
    now
  )
}

/** Outras aulas do mesmo grupo, professor e horário (matrícula diferente). */
export async function findGroupSlotSiblingLessonIds(lessonId: string): Promise<string[]> {
  const lesson = await prisma.lesson.findUnique({
    where: { id: lessonId },
    include: {
      enrollment: { select: { tipoAula: true, nomeGrupo: true } },
    },
  })
  if (!lesson?.teacherId) return [lessonId]

  const enr = lesson.enrollment
  if (enr?.tipoAula !== 'GRUPO' || !enr.nomeGrupo?.trim()) return [lessonId]

  const groupEnrollmentIds = (
    await prisma.enrollment.findMany({
      where: { tipoAula: 'GRUPO', nomeGrupo: enr.nomeGrupo.trim() },
      select: { id: true },
    })
  ).map((e) => e.id)

  if (groupEnrollmentIds.length === 0) return [lessonId]

  const siblings = await prisma.lesson.findMany({
    where: {
      teacherId: lesson.teacherId,
      startAt: lesson.startAt,
      enrollmentId: { in: groupEnrollmentIds },
    },
    select: { id: true },
  })

  return [...new Set(siblings.map((s) => s.id))]
}

/** Cria registro automático de não comparecimento se ainda não existir. */
export async function createNoShowLessonRecordIfMissing(lessonId: string): Promise<boolean> {
  const lessonRecord = (prisma as { lessonRecord?: { findUnique: (args: unknown) => Promise<unknown>; create: (args: unknown) => Promise<unknown> } })
    .lessonRecord
  if (!lessonRecord?.create || !lessonRecord.findUnique) return false

  const existing = await lessonRecord.findUnique({ where: { lessonId } })
  if (existing) return false

  const lesson = await prisma.lesson.findUnique({
    where: { id: lessonId },
    include: {
      enrollment: {
        select: { id: true, curso: true, tipoAula: true, nomeGrupo: true },
      },
    },
  })
  if (!lesson) return false

  const enrollmentId = lesson.enrollmentId
  const curso = (lesson.enrollment as { curso?: string | null })?.curso ?? null
  const tempo = lesson.durationMinutes ?? 60

  const lastRecord = await getPreviousLessonRecordForEnrollment(enrollmentId, { excludeLessonId: lessonId })

  const book =
    lastRecord?.book?.trim() && lastRecord.book.trim() !== NO_SHOW_PLACEHOLDER
      ? lastRecord.book.trim()
      : null
  const lastPage =
    lastRecord?.lastPage?.trim() && lastRecord.lastPage.trim() !== NO_SHOW_PLACEHOLDER
      ? lastRecord.lastPage.trim()
      : null
  const lessonType = lastRecord?.lessonType ?? 'NORMAL'
  const recordCurso = lastRecord?.curso ?? curso

  const created = await lessonRecord.create({
    data: {
      lessonId,
      status: 'CANCELLED_NO_REPLACEMENT',
      presence: 'NAO_COMPARECEU',
      lessonType,
      curso: recordCurso,
      tempoAulaMinutos: tempo,
      book,
      lastPage,
      assignedHomework: null,
      homeworkDone: 'NAO',
      conversationDescription: null,
      notes: AUTO_NO_SHOW_NOTES,
      notesForStudent: null,
      notesForParents: null,
      gradeGrammar: null,
      gradeSpeaking: null,
      gradeListening: null,
      gradeUnderstanding: null,
    },
  })

  const enr = lesson.enrollment as {
    tipoAula?: string | null
    nomeGrupo?: string | null
  }
  const isGroup = enr?.tipoAula === 'GRUPO' && enr?.nomeGrupo?.trim()
  if (isGroup) {
    const LessonRecordStudent = (prisma as { lessonRecordStudent?: { createMany: (args: unknown) => Promise<unknown> } })
      .lessonRecordStudent
    const nomeGrupo = enr.nomeGrupo!.trim()
    if (LessonRecordStudent?.createMany) {
      const groupMembers = await prisma.enrollment.findMany({
        where: { tipoAula: 'GRUPO', nomeGrupo },
        select: { id: true },
      })
      if (groupMembers.length > 0) {
        await LessonRecordStudent.createMany({
          data: groupMembers.map((m) => ({
            lessonRecordId: (created as { id: string }).id,
            enrollmentId: m.id,
            presence: 'NAO_COMPARECEU',
          })),
        })
      }
    }
  }

  return true
}
