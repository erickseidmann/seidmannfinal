/**
 * Texto da notificação «Novo aluno» para o professor:
 * livro/página do último registro antes da primeira aula com ele; senão nível da matrícula; senão aviso fixo.
 */

import type { PrismaClient } from '@prisma/client'

export type BuildNewStudentAlertParams = {
  teacherId: string
  enrollmentId: string
  /** Início da primeira aula com este professor (evita ambiguidade se várias forem criadas no mesmo POST) */
  firstLessonStartAt?: Date
}

export async function buildNewStudentTeacherAlertMessage(
  prisma: PrismaClient,
  params: BuildNewStudentAlertParams
): Promise<string> {
  const enr = await prisma.enrollment.findUnique({
    where: { id: params.enrollmentId },
    select: { nome: true, nivel: true },
  })
  const nome = enr?.nome?.trim() || 'Aluno'
  const nivelCadastro = enr?.nivel?.trim() ?? ''

  let firstStart = params.firstLessonStartAt ?? null
  if (!firstStart) {
    const first = await prisma.lesson.findFirst({
      where: { teacherId: params.teacherId, enrollmentId: params.enrollmentId },
      orderBy: { startAt: 'asc' },
      select: { startAt: true },
    })
    firstStart = first?.startAt ?? null
  }

  if (!firstStart) {
    if (nivelCadastro) {
      return `Tem um novo aluno: ${nome}. Nível: ${nivelCadastro}.`
    }
    return `Tem um novo aluno: ${nome}. Aluno novo não tem nível definido ainda.`
  }

  const lastMaterial = await prisma.lessonRecord.findFirst({
    where: {
      lesson: {
        enrollmentId: params.enrollmentId,
        startAt: { lt: firstStart },
      },
    },
    orderBy: { lesson: { startAt: 'desc' } },
    select: { book: true, lastPage: true },
  })
  const book = lastMaterial?.book?.trim() ?? ''
  const page = lastMaterial?.lastPage?.trim() ?? ''

  let suffix: string
  if (book || page) {
    const parts: string[] = []
    if (book) parts.push(`Livro: ${book}`)
    if (page) parts.push(`Página: ${page}`)
    suffix = ` ${parts.join(' · ')}.`
  } else if (nivelCadastro) {
    suffix = ` Nível: ${nivelCadastro}.`
  } else {
    suffix = ' Aluno novo não tem nível definido ainda.'
  }

  return `Tem um novo aluno: ${nome}.${suffix}`
}

export async function enrichNewStudentTeacherAlertRow<T extends { type: string | null; enrollmentId: string | null; message: string }>(
  prisma: PrismaClient,
  teacherId: string,
  row: T
): Promise<T> {
  if (row.type !== 'NEW_STUDENT' || !row.enrollmentId) return row
  const message = await buildNewStudentTeacherAlertMessage(prisma, {
    teacherId,
    enrollmentId: row.enrollmentId,
  })
  return { ...row, message }
}
