import { prisma } from '@/lib/prisma'

function formatarDataHoraSimples(dataHora: Date): string {
  return dataHora.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function appendReleaseNote(notesAtuais: string | null, adminName: string, dataHora: Date): string {
  const novaObs = `Registro liberado pelo admin (${adminName}) em ${formatarDataHoraSimples(dataHora)} — professor pode registrar a aula.`
  if (notesAtuais?.trim()) {
    return `${notesAtuais}\n${novaObs}`
  }
  return novaObs
}

export function isCancelledNoReplacementLessonRecord(record: {
  status: string
  lesson: { status?: string | null }
}): boolean {
  return (
    record.status === 'CANCELLED_NO_REPLACEMENT' ||
    record.lesson.status === 'CANCELLED_NO_REPLACEMENT'
  )
}

/** Libera aula cancelada sem reposição: reverte para CONFIRMED, remove registro automático e aprova unlock. */
export async function releaseCancelledNoReplacementLessonRecord(params: {
  recordId: string
  adminUserId: string
  adminName: string
}) {
  const existing = await prisma.lessonRecord.findUnique({
    where: { id: params.recordId },
    include: {
      lesson: {
        select: {
          id: true,
          status: true,
          notes: true,
          teacherId: true,
        },
      },
    },
  })

  if (!existing) {
    return { ok: false as const, status: 404, message: 'Registro não encontrado' }
  }

  if (!isCancelledNoReplacementLessonRecord(existing)) {
    return {
      ok: false as const,
      status: 400,
      message: 'Esta aula não está com status cancelada sem reposição.',
    }
  }

  if (!existing.lesson.teacherId) {
    return {
      ok: false as const,
      status: 400,
      message: 'Aula sem professor vinculado.',
    }
  }

  const teacherId = existing.lesson.teacherId

  const agora = new Date()
  const adminNotes =
    'Liberação de aula cancelada sem reposição — professor pode registrar e receber pela aula.'

  await prisma.$transaction(async (tx) => {
    await tx.lessonRecordStudent.deleteMany({ where: { lessonRecordId: existing.id } })
    await tx.lessonRecord.delete({ where: { id: existing.id } })

    if (existing.lesson.status === 'CANCELLED_NO_REPLACEMENT') {
      await tx.lesson.update({
        where: { id: existing.lesson.id },
        data: {
          status: 'CONFIRMED',
          notes: appendReleaseNote(existing.lesson.notes, params.adminName, agora),
        },
      })
    }

    const existingUnlock = await tx.lessonRecordUnlockRequest.findFirst({
      where: {
        lessonId: existing.lesson.id,
        teacherId,
      },
      orderBy: { criadoEm: 'desc' },
    })

    if (existingUnlock) {
      await tx.lessonRecordUnlockRequest.update({
        where: { id: existingUnlock.id },
        data: {
          status: 'APPROVED',
          adminNotes,
          processedById: params.adminUserId,
          processedAt: agora,
        },
      })
    } else {
      await tx.lessonRecordUnlockRequest.create({
        data: {
          lessonId: existing.lesson.id,
          teacherId,
          status: 'APPROVED',
          message: 'Liberação de aula cancelada sem reposição.',
          adminNotes,
          processedById: params.adminUserId,
          processedAt: agora,
        },
      })
    }
  })

  return {
    ok: true as const,
    message: 'Aula liberada. O professor já pode registrar esta aula.',
  }
}
