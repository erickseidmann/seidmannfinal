'use client'

import type { Dispatch, SetStateAction } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { parseYoutubeVideoId } from '@/lib/youtube-id'

export type TrainingOptionForm = {
  text: string
  isCorrect: boolean
}

export type TrainingQuestionForm = {
  prompt: string
  options: TrainingOptionForm[]
}

export type TrainingFormState = {
  title: string
  description: string
  contentType: 'VIDEO' | 'TEXT'
  youtubeId: string
  contentText: string
  active: boolean
  questions: TrainingQuestionForm[]
}

export function emptyTrainingForm(): TrainingFormState {
  return {
    title: '',
    description: '',
    contentType: 'VIDEO',
    youtubeId: '',
    contentText: '',
    active: true,
    questions: [emptyQuestion()],
  }
}

function emptyQuestion(): TrainingQuestionForm {
  return {
    prompt: '',
    options: [
      { text: '', isCorrect: true },
      { text: '', isCorrect: false },
    ],
  }
}

export function TrainingFields({
  form,
  setForm,
  idPrefix = '',
}: {
  form: TrainingFormState
  setForm: Dispatch<SetStateAction<TrainingFormState>>
  idPrefix?: string
}) {
  const pid = (s: string) => (idPrefix ? `${idPrefix}-${s}` : s)
  const previewId = parseYoutubeVideoId(form.youtubeId)

  const addQuestion = () => {
    setForm((f) => ({ ...f, questions: [...f.questions, emptyQuestion()] }))
  }

  const removeQuestion = (index: number) => {
    setForm((f) => ({
      ...f,
      questions: f.questions.length <= 1 ? f.questions : f.questions.filter((_, i) => i !== index),
    }))
  }

  const updateQuestion = (index: number, patch: Partial<TrainingQuestionForm>) => {
    setForm((f) => ({
      ...f,
      questions: f.questions.map((q, i) => (i === index ? { ...q, ...patch } : q)),
    }))
  }

  const addOption = (qIndex: number) => {
    setForm((f) => ({
      ...f,
      questions: f.questions.map((q, i) =>
        i === qIndex ? { ...q, options: [...q.options, { text: '', isCorrect: false }] } : q
      ),
    }))
  }

  const removeOption = (qIndex: number, oIndex: number) => {
    setForm((f) => ({
      ...f,
      questions: f.questions.map((q, i) => {
        if (i !== qIndex) return q
        if (q.options.length <= 2) return q
        const next = q.options.filter((_, j) => j !== oIndex)
        if (!next.some((o) => o.isCorrect) && next.length > 0) {
          next[0] = { ...next[0], isCorrect: true }
        }
        return { ...q, options: next }
      }),
    }))
  }

  const setCorrectOption = (qIndex: number, oIndex: number) => {
    setForm((f) => ({
      ...f,
      questions: f.questions.map((q, i) =>
        i === qIndex
          ? {
              ...q,
              options: q.options.map((o, j) => ({ ...o, isCorrect: j === oIndex })),
            }
          : q
      ),
    }))
  }

  return (
    <div className="space-y-6">
      <div>
        <label htmlFor={pid('title')} className="block text-sm font-medium text-slate-700 mb-1">
          Título
        </label>
        <input
          id={pid('title')}
          type="text"
          value={form.title}
          onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
          className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-slate-900 focus:ring-2 focus:ring-orange-400/40 focus:border-orange-400"
        />
      </div>

      <div>
        <label htmlFor={pid('description')} className="block text-sm font-medium text-slate-700 mb-1">
          Descrição (opcional)
        </label>
        <textarea
          id={pid('description')}
          rows={2}
          value={form.description}
          onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
          className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-slate-900 focus:ring-2 focus:ring-orange-400/40 focus:border-orange-400"
        />
      </div>

      <div>
        <span className="block text-sm font-medium text-slate-700 mb-2">Tipo de conteúdo</span>
        <div className="flex gap-4">
          <label className="inline-flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              name={pid('contentType')}
              checked={form.contentType === 'VIDEO'}
              onChange={() => setForm((f) => ({ ...f, contentType: 'VIDEO' }))}
            />
            <span>Vídeo (YouTube)</span>
          </label>
          <label className="inline-flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              name={pid('contentType')}
              checked={form.contentType === 'TEXT'}
              onChange={() => setForm((f) => ({ ...f, contentType: 'TEXT' }))}
            />
            <span>Texto</span>
          </label>
        </div>
      </div>

      {form.contentType === 'VIDEO' ? (
        <div className="grid gap-6 lg:grid-cols-2">
          <div>
            <label htmlFor={pid('youtube')} className="block text-sm font-medium text-slate-700 mb-1">
              Link ou ID do YouTube
            </label>
            <input
              id={pid('youtube')}
              type="text"
              value={form.youtubeId}
              onChange={(e) => setForm((f) => ({ ...f, youtubeId: e.target.value }))}
              placeholder="https://www.youtube.com/watch?v=..."
              className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-slate-900 focus:ring-2 focus:ring-orange-400/40 focus:border-orange-400"
            />
          </div>
          {previewId && (
            <div className="aspect-video rounded-xl overflow-hidden bg-black">
              <iframe
                title="Prévia do vídeo"
                src={`https://www.youtube.com/embed/${previewId}`}
                className="w-full h-full"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              />
            </div>
          )}
        </div>
      ) : (
        <div>
          <label htmlFor={pid('contentText')} className="block text-sm font-medium text-slate-700 mb-1">
            Texto do treinamento
          </label>
          <textarea
            id={pid('contentText')}
            rows={10}
            value={form.contentText}
            onChange={(e) => setForm((f) => ({ ...f, contentText: e.target.value }))}
            className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-slate-900 font-mono text-sm focus:ring-2 focus:ring-orange-400/40 focus:border-orange-400"
          />
        </div>
      )}

      <div className="border-t border-slate-200 pt-6 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-semibold text-slate-800">Perguntas sobre o conteúdo</h3>
          <button
            type="button"
            onClick={addQuestion}
            className="inline-flex items-center gap-1.5 text-sm font-medium text-orange-600 hover:text-orange-700"
          >
            <Plus className="w-4 h-4" />
            Adicionar pergunta
          </button>
        </div>

        {form.questions.map((q, qi) => (
          <div key={qi} className="rounded-xl border border-slate-200 p-4 space-y-3 bg-slate-50/50">
            <div className="flex items-start justify-between gap-2">
              <label className="text-sm font-medium text-slate-700">Pergunta {qi + 1}</label>
              {form.questions.length > 1 && (
                <button
                  type="button"
                  onClick={() => removeQuestion(qi)}
                  className="text-red-500 hover:text-red-600 p-1"
                  title="Remover pergunta"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </div>
            <textarea
              rows={2}
              value={q.prompt}
              onChange={(e) => updateQuestion(qi, { prompt: e.target.value })}
              placeholder="Enunciado da pergunta"
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-slate-900 focus:ring-2 focus:ring-orange-400/40 focus:border-orange-400"
            />
            <div className="space-y-2">
              <p className="text-xs text-slate-500">Marque a resposta correta</p>
              {q.options.map((opt, oi) => (
                <div key={oi} className="flex items-center gap-2">
                  <input
                    type="radio"
                    name={pid(`q-${qi}-correct`)}
                    checked={opt.isCorrect}
                    onChange={() => setCorrectOption(qi, oi)}
                    title="Resposta correta"
                  />
                  <input
                    type="text"
                    value={opt.text}
                    onChange={(e) => {
                      const text = e.target.value
                      setForm((f) => ({
                        ...f,
                        questions: f.questions.map((qq, i) =>
                          i === qi
                            ? {
                                ...qq,
                                options: qq.options.map((oo, j) =>
                                  j === oi ? { ...oo, text } : oo
                                ),
                              }
                            : qq
                        ),
                      }))
                    }}
                    placeholder={`Opção ${oi + 1}`}
                    className="flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm focus:ring-2 focus:ring-orange-400/40 focus:border-orange-400"
                  />
                  {q.options.length > 2 && (
                    <button
                      type="button"
                      onClick={() => removeOption(qi, oi)}
                      className="text-slate-400 hover:text-red-500 p-1"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              ))}
              <button
                type="button"
                onClick={() => addOption(qi)}
                className="text-sm text-orange-600 hover:text-orange-700"
              >
                + Opção
              </button>
            </div>
          </div>
        ))}
      </div>

      <label className="inline-flex items-center gap-2 cursor-pointer">
        <input
          type="checkbox"
          checked={form.active}
          onChange={(e) => setForm((f) => ({ ...f, active: e.target.checked }))}
        />
        <span className="text-sm text-slate-700">Publicado (visível para professores)</span>
      </label>
    </div>
  )
}
