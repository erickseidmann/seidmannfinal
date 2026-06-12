/**
 * Aulas em grupo ficam na matrícula de um integrante; todos do mesmo nomeGrupo
 * devem ver e entrar na mesma sala virtual.
 */

import { prisma } from '@/lib/prisma'

type EnrollmentGroupInfo = {
  id: string
  tipoAula: string | null
  nomeGrupo: string | null
}

function groupSlotKey(parts: {
  tipoAula: string | null
  nomeGrupo: string | null
  teacherId: string | null
  startAt: Date | string
}): string | null {
  if (parts.tipoAula !== 'GRUPO' || !parts.nomeGrupo?.trim()) return null
  const start =
    parts.startAt instanceof Date ? parts.startAt.toISOString() : String(parts.startAt)
  return `${parts.nomeGrupo.trim()}|${parts.teacherId ?? ''}|${start}`
}

/** Inclui matrículas de todos os integrantes dos grupos do aluno. */
export async function expandEnrollmentIdsForGroupLessons(
  studentEnrollmentIds: string[]
): Promise<string[]> {
  if (studentEnrollmentIds.length === 0) return []

  const enrollments = await prisma.enrollment.findMany({
    where: { id: { in: studentEnrollmentIds } },
    select: { id: true, tipoAula: true, nomeGrupo: true },
  })

  const groupNames = [
    ...new Set(
      enrollments
        .filter((e) => e.tipoAula === 'GRUPO' && e.nomeGrupo?.trim())
        .map((e) => e.nomeGrupo!.trim())
    ),
  ]

  if (groupNames.length === 0) return studentEnrollmentIds

  const siblings = await prisma.enrollment.findMany({
    where: { tipoAula: 'GRUPO', nomeGrupo: { in: groupNames } },
    select: { id: true },
  })

  return [...new Set([...studentEnrollmentIds, ...siblings.map((s) => s.id)])]
}

/** Matrícula do aluno logado que corresponde à aula (direta ou pelo mesmo grupo). */
export async function resolveStudentEnrollmentForLesson(
  studentEnrollmentIds: string[],
  lessonEnrollmentId: string
): Promise<string | null> {
  if (studentEnrollmentIds.includes(lessonEnrollmentId)) {
    return lessonEnrollmentId
  }

  const lessonEnrollment = await prisma.enrollment.findUnique({
    where: { id: lessonEnrollmentId },
    select: { tipoAula: true, nomeGrupo: true },
  })

  if (lessonEnrollment?.tipoAula !== 'GRUPO' || !lessonEnrollment.nomeGrupo?.trim()) {
    return null
  }

  const groupName = lessonEnrollment.nomeGrupo.trim()
  const studentEnrollment = await prisma.enrollment.findFirst({
    where: {
      id: { in: studentEnrollmentIds },
      tipoAula: 'GRUPO',
      nomeGrupo: groupName,
    },
    select: { id: true },
  })

  return studentEnrollment?.id ?? null
}

export async function studentCanAccessLesson(
  studentEnrollmentIds: string[],
  lessonEnrollmentId: string
): Promise<boolean> {
  const resolved = await resolveStudentEnrollmentForLesson(
    studentEnrollmentIds,
    lessonEnrollmentId
  )
  return resolved != null
}

/** Uma aula por slot de grupo (mesmo nomeGrupo + professor + horário), id estável para a sala Jitsi. */
export function dedupeGroupLessonsForStudent<
  T extends {
    id: string
    enrollmentId: string
    teacherId: string | null
    startAt: Date | string
    enrollment: EnrollmentGroupInfo | null
  }
>(lessons: T[]): T[] {
  const bySlot = new Map<string, T>()

  for (const lesson of lessons) {
    const enr = lesson.enrollment
    const slotKey = groupSlotKey({
      tipoAula: enr?.tipoAula ?? null,
      nomeGrupo: enr?.nomeGrupo ?? null,
      teacherId: lesson.teacherId,
      startAt: lesson.startAt,
    })

    if (!slotKey) {
      bySlot.set(`lesson:${lesson.id}`, lesson)
      continue
    }

    const existing = bySlot.get(slotKey)
    if (!existing || lesson.id < existing.id) {
      bySlot.set(slotKey, lesson)
    }
  }

  return Array.from(bySlot.values()).sort((a, b) => {
    const ta = new Date(a.startAt).getTime()
    const tb = new Date(b.startAt).getTime()
    return ta - tb
  })
}
