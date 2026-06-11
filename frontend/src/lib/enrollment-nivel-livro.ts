import {
  cefrLevelFromBookName,
  NIVEL_LIVRO_NAO_DEFINIDO,
  pickHighestBookName,
} from '@/lib/student-book-level'
import {
  teacherCanTeachStudentLevel,
  teacherStudentLevelMismatchMessage,
  normalizeTeacherNiveisEnsina,
} from '@/lib/teacher-teaching-levels'

type PrismaLessonRecordClient = {
  lessonRecord: {
    findMany: (args: unknown) => Promise<Array<{ id: string; book: string | null }>>
  }
  bookRelease?: {
    findMany: (args: unknown) => Promise<
      Array<{
        book?: { nome: string | null } | null
        bookCode: string
      }>
    >
  }
}

/** Nível CEFR efetivo do aluno com base em registros de aula e liberações de livro. */
export async function getEnrollmentNivelLivro(
  prismaClient: PrismaLessonRecordClient & {
    enrollment: {
      findUnique: (args: unknown) => Promise<{
        userId: string | null
        nivel: string | null
      } | null>
    }
  },
  enrollmentId: string
): Promise<string | null> {
  let livroAtual: string | null = null

  try {
    const records = await prismaClient.lessonRecord.findMany({
      where: {
        lesson: { enrollmentId },
        AND: [{ book: { not: null } }, { NOT: { book: '' } }],
      },
      select: { id: true, book: true },
      orderBy: { lesson: { startAt: 'desc' } },
      take: 1,
    })
    livroAtual = records[0]?.book?.trim() || null
  } catch {
    // ignora
  }

  if (!livroAtual) {
    const enrollment = await prismaClient.enrollment.findUnique({
      where: { id: enrollmentId },
      select: { userId: true },
    })
    if (enrollment?.userId && prismaClient.bookRelease) {
      try {
        const releases = await prismaClient.bookRelease.findMany({
          where: { userId: enrollment.userId },
          include: { book: { select: { nome: true } } },
        })
        const names = releases.map((r) => r.book?.nome?.trim() || r.bookCode?.trim())
        livroAtual = pickHighestBookName(names)
      } catch {
        // ignora
      }
    }
  }

  if (livroAtual) {
    const nivel = cefrLevelFromBookName(livroAtual)
    return nivel !== NIVEL_LIVRO_NAO_DEFINIDO ? nivel : null
  }

  return null
}

export async function assertTeacherTeachesEnrollmentLevel(
  prismaClient: Parameters<typeof getEnrollmentNivelLivro>[0],
  enrollmentId: string,
  teacher: { niveisEnsina?: unknown; nome?: string | null }
): Promise<{ ok: true } | { ok: false; message: string }> {
  const studentNivel = await getEnrollmentNivelLivro(prismaClient, enrollmentId)
  if (!studentNivel) return { ok: true }

  const niveis = normalizeTeacherNiveisEnsina(teacher.niveisEnsina)
  if (!teacherCanTeachStudentLevel(niveis, studentNivel)) {
    return {
      ok: false,
      message: teacherStudentLevelMismatchMessage(studentNivel, teacher.nome ?? undefined),
    }
  }
  return { ok: true }
}
