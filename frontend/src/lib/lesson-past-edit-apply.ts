import { prisma } from '@/lib/prisma'
import { isLessonCancelledFamily } from '@/lib/lesson-status'

export type LessonPastEditPayload = {
  enrollmentId?: string
  teacherId?: string | null
  status?: string
  startAt?: string
  durationMinutes?: number
  notes?: string | null
  createdByName?: string | null
  applyToFuture?: boolean
}

function formatarDataHoraSimples(d: Date): string {
  return d.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function adicionarObservacaoCancelamento(
  notesAtuais: string | null,
  quemCancelou: string,
  dataHora: Date
): string {
  const novaObs = `Aula foi cancelada pelo ${quemCancelou} às ${formatarDataHoraSimples(dataHora)}`
  if (notesAtuais?.trim()) return `${notesAtuais}\n${novaObs}`
  return novaObs
}

function adicionarObservacaoReagendamento(
  notesAtuais: string | null,
  quemReagendou: string,
  dataHora: Date
): string {
  const novaObs = `Aula foi reagendada pelo ${quemReagendou} às ${formatarDataHoraSimples(dataHora)}`
  if (notesAtuais?.trim()) return `${notesAtuais}\n${novaObs}`
  return novaObs
}

/** Aplica alterações aprovadas em uma aula de dia anterior. */
export async function applyApprovedLessonPastEdit(
  lessonId: string,
  payload: LessonPastEditPayload,
  processorName: string
) {
  const lessonBefore = await prisma.lesson.findUnique({ where: { id: lessonId } })
  if (!lessonBefore) {
    return { ok: false as const, status: 404, message: 'Aula não encontrada' }
  }

  const updateData: {
    enrollmentId?: string
    teacherId?: string | null
    status?: 'CONFIRMED' | 'CANCELLED' | 'CANCELLED_BY_TEACHER' | 'CANCELLED_NO_REPLACEMENT' | 'REPOSICAO'
    startAt?: Date
    durationMinutes?: number
    notes?: string | null
    createdByName?: string | null
  } = {}

  if (payload.enrollmentId != null) updateData.enrollmentId = payload.enrollmentId
  if ('teacherId' in payload) updateData.teacherId = payload.teacherId ?? null
  const validStatuses = [
    'CONFIRMED',
    'CANCELLED',
    'CANCELLED_BY_TEACHER',
    'CANCELLED_NO_REPLACEMENT',
    'REPOSICAO',
  ] as const
  if (payload.status && validStatuses.includes(payload.status as (typeof validStatuses)[number])) {
    updateData.status = payload.status as (typeof validStatuses)[number]
  }
  if (payload.startAt) {
    const d = new Date(payload.startAt)
    if (!Number.isNaN(d.getTime())) updateData.startAt = d
  }
  if (payload.durationMinutes != null) updateData.durationMinutes = Number(payload.durationMinutes) || 60
  if (payload.notes !== undefined) updateData.notes = payload.notes?.trim() || null
  if (payload.createdByName !== undefined) updateData.createdByName = payload.createdByName?.trim() || null

  const oldStatus = lessonBefore.status
  const newStatus = (updateData.status ?? oldStatus) as string
  const statusChanged = updateData.status != null && String(oldStatus) !== String(newStatus)

  if (statusChanged) {
    const agora = new Date()
    const notesAtuais =
      updateData.notes !== undefined ? updateData.notes : lessonBefore.notes
    if (isLessonCancelledFamily(newStatus)) {
      updateData.notes = adicionarObservacaoCancelamento(notesAtuais, processorName, agora)
    } else if (newStatus === 'REPOSICAO') {
      updateData.notes = adicionarObservacaoReagendamento(notesAtuais, processorName, agora)
    }
  }

  const lesson = await prisma.lesson.update({
    where: { id: lessonId },
    data: updateData,
    include: {
      enrollment: { select: { id: true, nome: true } },
      teacher: { select: { id: true, nome: true } },
    },
  })

  return { ok: true as const, lesson }
}
