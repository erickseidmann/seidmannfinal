'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { ChevronLeft, GraduationCap, Loader2, CheckCircle2, XCircle } from 'lucide-react'
import MaterialSubNav from '@/components/professor/MaterialSubNav'
import { useTranslation } from '@/contexts/LanguageContext'
import SeidmannLoading from '@/components/ui/SeidmannLoading'

type TrainingDetail = {
  id: string
  title: string
  description: string | null
  contentType: string
  youtubeId: string | null
  contentText: string | null
  questions: {
    id: string
    prompt: string
    options: { id: string; text: string }[]
  }[]
  completion: {
    scorePercent: number
    passed: boolean
    completedAt: string
  } | null
}

type SubmitResult = {
  scorePercent: number
  passed: boolean
  results: {
    questionId: string
    selectedOptionId: string
    correctOptionId: string | null
    isCorrect: boolean
  }[]
}

export default function ProfessorTreinamentoDetailPage({ params }: { params: { id: string } }) {
  const { t } = useTranslation()
  const [training, setTraining] = useState<TrainingDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [result, setResult] = useState<SubmitResult | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/professor/trainings/${params.id}`, { credentials: 'include' })
      const json = await res.json()
      if (!json.ok) {
        setError(json.message || 'Erro ao carregar')
        setTraining(null)
        return
      }
      setTraining(json.data)
      if (json.data.completion) {
        setResult({
          scorePercent: json.data.completion.scorePercent,
          passed: json.data.completion.passed,
          results: [],
        })
      }
    } catch {
      setError('Erro de conexão')
      setTraining(null)
    } finally {
      setLoading(false)
    }
  }, [params.id])

  useEffect(() => {
    void load()
  }, [load])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!training) return
    setSubmitError(null)
    setSubmitting(true)
    try {
      const res = await fetch(`/api/professor/trainings/${params.id}/submit`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ answers }),
      })
      const json = await res.json()
      if (!json.ok) {
        setSubmitError(json.message || 'Erro ao enviar')
        return
      }
      setResult(json.data)
      await load()
    } catch {
      setSubmitError('Erro de conexão')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <Link
        href="/dashboard-professores/treinamentos"
        className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-brand-orange"
      >
        <ChevronLeft className="w-4 h-4" />
        {t('professor.material.backToTrainings')}
      </Link>

      <MaterialSubNav />

      {loading ? (
        <SeidmannLoading variant="section" className="py-16" />
      ) : error || !training ? (
        <p className="text-red-600">{error || 'Treinamento não encontrado'}</p>
      ) : (
        <>
          <div>
            <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
              <GraduationCap className="w-7 h-7 text-brand-orange" />
              {training.title}
            </h1>
            {training.description && <p className="text-gray-500 mt-2">{training.description}</p>}
          </div>

          {training.contentType === 'VIDEO' && training.youtubeId && (
            <div className="aspect-video rounded-xl overflow-hidden bg-black shadow-sm">
              <iframe
                title={training.title}
                src={`https://www.youtube.com/embed/${training.youtubeId}`}
                className="w-full h-full"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              />
            </div>
          )}

          {training.contentType === 'TEXT' && training.contentText && (
            <div className="rounded-xl border border-gray-200 bg-white p-6 prose prose-sm max-w-none whitespace-pre-wrap text-gray-800">
              {training.contentText}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-6">
            <h2 className="text-lg font-semibold text-gray-900">{t('professor.material.quizTitle')}</h2>

            {training.questions.map((q, qi) => {
              const questionResult = result?.results.find((r) => r.questionId === q.id)
              return (
                <fieldset
                  key={q.id}
                  className={`rounded-xl border p-4 space-y-3 ${
                    questionResult
                      ? questionResult.isCorrect
                        ? 'border-green-200 bg-green-50/40'
                        : 'border-red-200 bg-red-50/40'
                      : 'border-gray-200 bg-white'
                  }`}
                >
                  <legend className="text-sm font-medium text-gray-900 px-1">
                    {qi + 1}. {q.prompt}
                  </legend>
                  {q.options.map((opt) => {
                    const isSelected = answers[q.id] === opt.id
                    const isCorrectAnswer = questionResult?.correctOptionId === opt.id
                    const showFeedback = result != null && result.results.length > 0
                    return (
                      <label
                        key={opt.id}
                        className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                          showFeedback && isCorrectAnswer
                            ? 'border-green-400 bg-green-50'
                            : showFeedback && isSelected && !questionResult?.isCorrect
                              ? 'border-red-400 bg-red-50'
                              : isSelected
                                ? 'border-orange-400 bg-orange-50'
                                : 'border-gray-100 hover:bg-gray-50'
                        } ${showFeedback ? 'pointer-events-none opacity-90' : ''}`}
                      >
                        <input
                          type="radio"
                          name={`q-${q.id}`}
                          value={opt.id}
                          checked={isSelected}
                          disabled={showFeedback}
                          onChange={() => setAnswers((a) => ({ ...a, [q.id]: opt.id }))}
                        />
                        <span className="text-sm text-gray-800 flex-1">{opt.text}</span>
                        {showFeedback && isCorrectAnswer && (
                          <CheckCircle2 className="w-4 h-4 text-green-600 shrink-0" />
                        )}
                        {showFeedback && isSelected && !questionResult?.isCorrect && (
                          <XCircle className="w-4 h-4 text-red-600 shrink-0" />
                        )}
                      </label>
                    )
                  })}
                </fieldset>
              )
            })}

            {result && (
              <div
                className={`rounded-xl p-4 text-sm font-medium ${
                  result.passed ? 'bg-green-100 text-green-800' : 'bg-amber-100 text-amber-800'
                }`}
              >
                {result.passed
                  ? t('professor.material.quizPassed').replace('{n}', String(result.scorePercent))
                  : t('professor.material.quizScore').replace('{n}', String(result.scorePercent))}
              </div>
            )}

            {submitError && <p className="text-red-600 text-sm">{submitError}</p>}

            {!(result && result.results.length > 0) && (
              <button
                type="submit"
                disabled={submitting}
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-brand-orange text-white rounded-xl font-medium hover:bg-orange-600 disabled:opacity-60"
              >
                {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
                {training.completion
                  ? t('professor.material.retakeQuiz')
                  : t('professor.material.submitQuiz')}
              </button>
            )}
          </form>
        </>
      )}
    </div>
  )
}
