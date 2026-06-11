import { parseYoutubeVideoId } from '@/lib/youtube-id'

export type TrainingQuestionInput = {
  prompt: string
  options: { text: string; isCorrect: boolean }[]
}

export type TrainingPayloadInput = {
  title?: string
  description?: string | null
  contentType?: string
  youtubeId?: string | null
  contentText?: string | null
  active?: boolean
  questions?: TrainingQuestionInput[]
}

export type ValidatedTrainingPayload = {
  title: string
  description: string | null
  contentType: 'VIDEO' | 'TEXT'
  youtubeId: string | null
  contentText: string | null
  active: boolean
  questions: TrainingQuestionInput[]
}

export function validateTrainingPayload(
  body: TrainingPayloadInput
): { ok: true; data: ValidatedTrainingPayload } | { ok: false; message: string } {
  const title = String(body.title ?? '').trim()
  if (!title) return { ok: false, message: 'Título é obrigatório' }

  const contentType = String(body.contentType ?? '').trim().toUpperCase()
  if (contentType !== 'VIDEO' && contentType !== 'TEXT') {
    return { ok: false, message: 'Tipo de conteúdo deve ser VIDEO ou TEXT' }
  }

  let youtubeId: string | null = null
  let contentText: string | null = null

  if (contentType === 'VIDEO') {
    youtubeId = parseYoutubeVideoId(String(body.youtubeId ?? ''))
    if (!youtubeId) {
      return {
        ok: false,
        message: 'Informe um link ou ID válido do YouTube para o vídeo',
      }
    }
  } else {
    contentText = String(body.contentText ?? '').trim()
    if (!contentText) {
      return { ok: false, message: 'Texto do treinamento é obrigatório' }
    }
  }

  const questions = Array.isArray(body.questions) ? body.questions : []
  if (questions.length === 0) {
    return { ok: false, message: 'Adicione pelo menos uma pergunta' }
  }

  for (let i = 0; i < questions.length; i++) {
    const q = questions[i]
    const prompt = String(q?.prompt ?? '').trim()
    if (!prompt) {
      return { ok: false, message: `Pergunta ${i + 1}: enunciado é obrigatório` }
    }
    const options = Array.isArray(q?.options) ? q.options : []
    if (options.length < 2) {
      return { ok: false, message: `Pergunta ${i + 1}: adicione pelo menos 2 opções` }
    }
    const correctCount = options.filter((o) => o?.isCorrect).length
    if (correctCount !== 1) {
      return {
        ok: false,
        message: `Pergunta ${i + 1}: marque exatamente uma resposta correta`,
      }
    }
    for (let j = 0; j < options.length; j++) {
      const text = String(options[j]?.text ?? '').trim()
      if (!text) {
        return { ok: false, message: `Pergunta ${i + 1}, opção ${j + 1}: texto é obrigatório` }
      }
    }
  }

  const description =
    body.description != null && String(body.description).trim() !== ''
      ? String(body.description).trim()
      : null

  return {
    ok: true,
    data: {
      title,
      description,
      contentType,
      youtubeId,
      contentText,
      active: body.active ?? true,
      questions: questions.map((q) => ({
        prompt: String(q.prompt).trim(),
        options: q.options.map((o) => ({
          text: String(o.text).trim(),
          isCorrect: Boolean(o.isCorrect),
        })),
      })),
    },
  }
}
