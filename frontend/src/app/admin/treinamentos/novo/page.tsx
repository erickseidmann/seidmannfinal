'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import AdminLayout from '@/components/admin/AdminLayout'
import { ChevronLeft, GraduationCap, Loader2 } from 'lucide-react'
import { emptyTrainingForm, TrainingFields, type TrainingFormState } from '../TrainingFields'

export default function AdminTreinamentoNovoPage() {
  const router = useRouter()
  const [form, setForm] = useState<TrainingFormState>(emptyTrainingForm)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setSaving(true)
    try {
      const res = await fetch('/api/admin/trainings', {
        method: 'POST',
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
          Novo treinamento
        </h1>

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
              Salvar
            </button>
            <Link
              href="/admin/treinamentos"
              className="px-5 py-2.5 border border-gray-200 rounded-xl text-gray-700 hover:bg-gray-50"
            >
              Cancelar
            </Link>
          </div>
        </form>
      </div>
    </AdminLayout>
  )
}
