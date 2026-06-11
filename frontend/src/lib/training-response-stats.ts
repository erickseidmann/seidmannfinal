type QuestionForStats = {
  id: string
  options: { id: string; isCorrect: boolean }[]
}

export function computeCompletionStats(
  questions: QuestionForStats[],
  answersJson: string
): { correctCount: number; wrongCount: number; total: number } {
  const total = questions.length
  let answers: Record<string, string> = {}
  try {
    const parsed = JSON.parse(answersJson)
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      answers = parsed as Record<string, string>
    }
  } catch {
    return { correctCount: 0, wrongCount: total, total }
  }

  let correct = 0
  for (const q of questions) {
    const selected = answers[q.id]
    if (!selected) continue
    const correctOption = q.options.find((o) => o.isCorrect)
    if (correctOption?.id === selected) correct++
  }

  return { correctCount: correct, wrongCount: total - correct, total }
}
