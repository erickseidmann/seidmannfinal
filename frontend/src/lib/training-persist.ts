import type { Prisma } from '@prisma/client'
import type { TrainingQuestionInput } from '@/lib/training-validation'

export async function replaceTrainingQuestions(
  tx: Prisma.TransactionClient,
  trainingId: string,
  questions: TrainingQuestionInput[]
): Promise<void> {
  await tx.trainingQuestion.deleteMany({ where: { trainingId } })

  for (let qi = 0; qi < questions.length; qi++) {
    const q = questions[qi]
    const created = await tx.trainingQuestion.create({
      data: {
        trainingId,
        prompt: q.prompt,
        sortOrder: qi,
      },
    })
    for (let oi = 0; oi < q.options.length; oi++) {
      const o = q.options[oi]
      await tx.trainingQuestionOption.create({
        data: {
          questionId: created.id,
          text: o.text,
          isCorrect: o.isCorrect,
          sortOrder: oi,
        },
      })
    }
  }
}
