import type { Training, TrainingQuestion, TrainingQuestionOption, TrainingCompletion } from '@prisma/client'

type TrainingWithRelations = Training & {
  questions: (TrainingQuestion & { options: TrainingQuestionOption[] })[]
  completions?: TrainingCompletion[]
}

export function serializeTrainingForAdmin(training: TrainingWithRelations) {
  return {
    id: training.id,
    title: training.title,
    description: training.description,
    contentType: training.contentType,
    youtubeId: training.youtubeId,
    contentText: training.contentText,
    active: training.active,
    publishedAt: training.publishedAt.toISOString(),
    criadoEm: training.criadoEm.toISOString(),
    atualizadoEm: training.atualizadoEm.toISOString(),
    questions: training.questions
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((q) => ({
        id: q.id,
        prompt: q.prompt,
        sortOrder: q.sortOrder,
        options: q.options
          .sort((a, b) => a.sortOrder - b.sortOrder)
          .map((o) => ({
            id: o.id,
            text: o.text,
            isCorrect: o.isCorrect,
            sortOrder: o.sortOrder,
          })),
      })),
  }
}

export function serializeTrainingForProfessor(
  training: TrainingWithRelations,
  completion: TrainingCompletion | null
) {
  return {
    id: training.id,
    title: training.title,
    description: training.description,
    contentType: training.contentType,
    youtubeId: training.youtubeId,
    contentText: training.contentText,
    publishedAt: training.publishedAt.toISOString(),
    questions: training.questions
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((q) => ({
        id: q.id,
        prompt: q.prompt,
        options: q.options
          .sort((a, b) => a.sortOrder - b.sortOrder)
          .map((o) => ({
            id: o.id,
            text: o.text,
          })),
      })),
    completion: completion
      ? {
          scorePercent: completion.scorePercent,
          passed: completion.passed,
          completedAt: completion.completedAt.toISOString(),
        }
      : null,
  }
}
