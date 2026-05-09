/**
 * GET /api/professor/lesson-records/ultima?enrollmentId=xxx
 *
 * Retorna o último registro de aula para a matrícula (enrollment), considerando
 * QUALQUER professor que já tenha dado aula para esse aluno/grupo. O professor
 * autenticado precisa estar entre os que já deram aula nessa matrícula OU ser
 * o professor atual (para que possa consultar o histórico antes da aula).
 *
 * Não há limite temporal: traz o último registro existente, mesmo que de muito
 * tempo atrás, para que o professor atual veja o histórico pedagógico (livro,
 * página, dever, observações etc.) antes de iniciar a aula.
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireTeacher } from '@/lib/auth'

export async function GET(request: NextRequest) {
  try {
    const auth = await requireTeacher(request)
    if (!auth.authorized || !auth.session) {
      return NextResponse.json(
        { ok: false, message: auth.message || 'Não autorizado' },
        { status: auth.message?.includes('Não autenticado') ? 401 : 403 }
      )
    }

    const teacher = await prisma.teacher.findFirst({
      where: { userId: auth.session.userId },
      select: { id: true },
    })
    if (!teacher) {
      return NextResponse.json(
        { ok: false, message: 'Professor não encontrado' },
        { status: 404 }
      )
    }

    const { searchParams } = new URL(request.url)
    const enrollmentId = searchParams.get('enrollmentId')?.trim()
    if (!enrollmentId) {
      return NextResponse.json(
        { ok: false, message: 'enrollmentId é obrigatório' },
        { status: 400 }
      )
    }

    type LessonRecordDelegate = { findFirst: (args: unknown) => Promise<unknown>; findMany: (args: unknown) => Promise<unknown> }
    const lessonRecord = (prisma as { lessonRecord?: LessonRecordDelegate }).lessonRecord
    if (!lessonRecord || typeof lessonRecord.findFirst !== 'function') {
      return NextResponse.json(
        { ok: false, message: 'Modelo LessonRecord não disponível' },
        { status: 503 }
      )
    }

    // Autorização leve: o professor autenticado precisa ter alguma vinculação
    // com a matrícula — ou já deu aula para ela, ou tem aula futura/atual
    // designada (a aula clicada no calendário). Isso evita que professores
    // consultem registros de alunos com os quais nunca tiveram contato.
    const linkExiste = await prisma.lesson.count({
      where: {
        enrollmentId,
        teacherId: teacher.id,
      },
    })
    if (linkExiste === 0) {
      return NextResponse.json(
        { ok: false, message: 'Você não tem aula com esta matrícula.' },
        { status: 403 }
      )
    }

    // Última aula do aluno/grupo, independente de qual professor ministrou.
    const records = await (prisma as any).lessonRecord.findMany({
      where: {
        lesson: { enrollmentId },
      },
      include: {
        studentPresences: {
          include: { enrollment: { select: { id: true, nome: true } } },
        },
        lesson: {
          include: {
            enrollment: { select: { id: true, nome: true, tipoAula: true, nomeGrupo: true } },
            teacher: { select: { id: true, nome: true } },
          },
        },
      },
      orderBy: { lesson: { startAt: 'desc' } },
      take: 1,
    })

    const record = records[0] ?? null
    return NextResponse.json({
      ok: true,
      data: {
        record,
        // Indica se o último registro foi de outro professor (UI sinaliza isso).
        registradoPorOutroProfessor:
          record?.lesson?.teacher && record.lesson.teacher.id !== teacher.id ? true : false,
      },
    })
  } catch (error) {
    console.error('[api/professor/lesson-records/ultima GET]', error)
    return NextResponse.json(
      { ok: false, message: 'Erro ao buscar última aula' },
      { status: 500 }
    )
  }
}
