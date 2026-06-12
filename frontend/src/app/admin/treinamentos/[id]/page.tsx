'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import AdminLayout from '@/components/admin/AdminLayout'
import { ChevronLeft, GraduationCap, Loader2 } from 'lucide-react'
import { emptyTrainingForm, TrainingFields, type TrainingFormState } from '../TrainingFields'
import SeidmannLoading from '@/components/ui/SeidmannLoading'

export default function AdminTreinamentoEditPage({ params }: { params: { id: string } }) {
  const router = useRouter()
  const [form, setForm] = useState<TrainingFormState | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/admin/trainings/${params.id}`, { credentials: 'include' })
      const json = await res.json()
      if (!json.ok) {
        setError(json.message || 'Erro ao carregar')
        setForm(null)
        return
      }
      const d = json.data
      setForm({
        title: d.title,
        description: d.description ?? '',
        contentType: d.contentType,
        youtubeId: d.youtubeId ?? '',
        contentText: d.contentText ?? '',
        active: d.active,
        questions: d.questions.map((q: { prompt: string; options: { text: string; isCorrect: boolean }[] }) => ({
          prompt: q.prompt,
          options: q.options.map((o: { text: string; isCorrect: boolean }) => ({
            text: o.text,
            isCorrect: o.isCorrect,
          })),
        })),
      })
    } catch {
      setError('Erro de rede')
      setForm(null)
    } finally {
      setLoading(false)
    }
  }, [params.id])

  useEffect(() => {
    void load()
  }, [load])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form) return
    setError(null)
    setSaving(true)
    try {
      const res = await fetch(`/api/admin/trainings/${params.id}`, {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: form.title,
          description: form.description || null,
          contentType: form.contentType,
          youtubeId: form.contentType === 'VIDEO' ? form.youtubeId : null,
          contentText: form.contentType === 'TEXT' ? form.contentText : null,
          active: form.active,
          questions: form.questions,
        }),
      })
      const json = await res.json()
      if (!json.ok) {
        setError(json.message || 'Erro ao salvar')
        return
      }
      router.push('/admin/treinamentos')
    } catch {
      setError('Erro de rede')
    } finally {
      setSaving(false)
    }
  }

  return (
    <AdminLayout>
      <div className="max-w-3xl mx-auto px-4 py-8">
        <Link
          href="/admin/treinamentos"
          className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-brand-orange mb-4"
        >
          <ChevronLeft className="w-4 h-4" />
          Voltar
        </Link>
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2 mb-6">
          <GraduationCap className="w-7 h-7 text-brand-orange" />
          Editar treinamento
        </h1>

        {loading ? (
          <SeidmannLoading variant="section" className="py-16" />
        ) : !form ? (
          <p className="text-red-600">{error || 'Treinamento não encontrado'}</p>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-6">
            <TrainingFields form={form} setForm={setForm} />
            {error && <p className="text-red-600 text-sm">{error}</p>}
            <div className="flex gap-3">
              <button
                type="submit"
                disabled={saving}
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-brand-orange text-white rounded-xl font-medium hover:bg-orange-600 disabled:opacity-60"
              >
                {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                Salvar alterações
              </button>
              <Link
                href="/admin/treinamentos"
                className="px-5 py-2.5 border border-gray-200 rounded-xl text-gray-700 hover:bg-gray-50"
              >
                Cancelar
              </Link>
            </div>
          </form>
        )}
      </div>
    </AdminLayout>
  )
}
