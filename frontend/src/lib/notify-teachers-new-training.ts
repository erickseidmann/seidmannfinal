import type { Prisma } from '@prisma/client'

const ALERT_BATCH = 150

export async function notifyActiveTeachersNewTraining(
  tx: Prisma.TransactionClient,
  params: { title: string; createdById?: string | null }
): Promise<void> {
  const teachers = await tx.teacher.findMany({
    where: { status: 'ACTIVE' },
    select: { id: true },
  })

  const message = `Novo treinamento disponível: ${params.title.trim()}`

  for (let i = 0; i < teachers.length; i += ALERT_BATCH) {
    const slice = teachers.slice(i, i + ALERT_BATCH)
    if (slice.length === 0) continue
    await tx.teacherAlert.createMany({
      data: slice.map((t) => ({
        teacherId: t.id,
        message,
        type: 'NEW_TRAINING',
        level: 'INFO',
        createdById: params.createdById ?? null,
      })),
    })
  }
}
