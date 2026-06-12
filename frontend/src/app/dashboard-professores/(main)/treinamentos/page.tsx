'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { GraduationCap, Loader2, CheckCircle2, Circle } from 'lucide-react'
import MaterialSubNav from '@/components/professor/MaterialSubNav'
import { useTranslation } from '@/contexts/LanguageContext'
import SeidmannLoading from '@/components/ui/SeidmannLoading'

type TrainingListItem = {
  id: string
  title: string
  description: string | null
  contentType: string
  publishedAt: string
  questionCount: number
  completed: boolean
  scorePercent: number | null
  passed: boolean | null
}

export default function ProfessorTreinamentosPage() {
  const { t } = useTranslation()
  const [rows, setRows] = useState<TrainingListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/professor/trainings', { credentials: 'include' })
      const json = await res.json()
      if (!json.ok) {
        setError(json.message || 'Erro ao carregar')
        setRows([])
        return
      }
      setRows(json.data || [])
    } catch {
      setError('Erro de conexão')
      setRows([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <GraduationCap className="w-7 h-7 text-brand-orange" />
          {t('professor.material.title')}
        </h1>
        <p className="text-gray-500 mt-1">{t('professor.material.trainingsDesc')}</p>
      </div>

      <MaterialSubNav />

      {loading ? (
        <SeidmannLoading variant="section" className="py-16" />
      ) : error ? (
        <p className="text-red-600">{error}</p>
      ) : rows.length === 0 ? (
        <p className="text-gray-500 py-8">{t('professor.material.noTrainings')}</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {rows.map((row) => (
            <Link
              key={row.id}
              href={`/dashboard-professores/treinamentos/${row.id}`}
              className="block rounded-xl border border-gray-200 bg-white p-5 hover:border-orange-300 hover:shadow-sm transition-all"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="font-semibold text-gray-900 truncate">{row.title}</h2>
                  {row.description && (
                    <p className="text-sm text-gray-500 mt-1 line-clamp-2">{row.description}</p>
                  )}
                  <p className="text-xs text-gray-400 mt-2">
                    {row.contentType === 'TEXT' ? t('professor.material.typeText') : t('professor.material.typeVideo')}
                    {' · '}
                    {row.questionCount} {t('professor.material.questions')}
                    {' · '}
                    {new Date(row.publishedAt).toLocaleDateString('pt-BR')}
                  </p>
                </div>
                {row.completed ? (
                  <span
                    className={`shrink-0 inline-flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-full ${
                      row.passed ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'
                    }`}
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    {row.scorePercent}%
                  </span>
                ) : (
                  <span className="shrink-0 inline-flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-full bg-gray-100 text-gray-600">
                    <Circle className="w-3.5 h-3.5" />
                    {t('professor.material.pending')}
                  </span>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
