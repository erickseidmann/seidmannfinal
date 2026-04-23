'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import AdminLayout from '@/components/admin/AdminLayout'
import { ChevronLeft, Loader2, Music } from 'lucide-react'
import { emptyKaraokeForm, KaraokeSongFields, type KaraokeFormState } from '../KaraokeSongFields'

export default function AdminKaraokeNovoPage() {
  const router = useRouter()
  const [form, setForm] = useState<KaraokeFormState>(emptyKaraokeForm)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const validate = (): string | null => {
    if (!form.title.trim()) return 'Título é obrigatório'
    if (!form.artist.trim()) return 'Artista é obrigatório'
    if (!form.youtubeId.trim()) return 'YouTube ID é obrigatório'
    if (!form.level.trim()) return 'Nível é obrigatório'
    if (!form.difficulty.trim()) return 'Dificuldade é obrigatória'
    if (!form.lyrics.trim()) return 'Letra é obrigatória'
    return null
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const v = validate()
    if (v) {
      setError(v)
      return
    }
    setError(null)
    setSaving(true)
    try {
      const res = await fetch('/api/admin/karaoke', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: form.title.trim(),
          artist: form.artist.trim(),
          youtubeId: form.youtubeId.trim(),
          level: form.level,
          difficulty: form.difficulty,
          emoji: form.emoji.trim() || null,
          lyrics: form.lyrics,
          startOffsetSec: form.startOffsetSec,
          active: form.active,
        }),
      })
      const json = await res.json()
      if (!json.ok) {
        setError(json.message || 'Erro ao salvar')
        return
      }
      router.push('/admin/karaoke')
    } catch {
      setError('Erro de rede')
    } finally {
      setSaving(false)
    }
  }

  return (
    <AdminLayout>
      <div className="max-w-4xl mx-auto px-4 py-8">
        <Link
          href="/admin/karaoke"
          className="inline-flex items-center gap-1 text-sm font-medium text-slate-600 hover:text-orange-600 mb-6"
        >
          <ChevronLeft className="w-4 h-4" />
          Voltar à lista
        </Link>
        <div className="flex items-center gap-3 mb-8">
          <Music className="w-8 h-8 text-orange-500" />
          <h1 className="text-2xl font-bold text-slate-800">Nova música</h1>
        </div>

        <form onSubmit={handleSubmit} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-md">
          {error && (
            <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">{error}</p>
          )}
          <KaraokeSongFields form={form} setForm={setForm} idPrefix="novo" />
          <div className="mt-8 flex flex-wrap gap-3">
            <button
              type="submit"
              disabled={saving}
              className="inline-flex h-12 min-w-[140px] items-center justify-center rounded-xl bg-gradient-to-r from-green-600 to-emerald-500 px-6 font-semibold text-white shadow-lg hover:from-green-700 hover:to-emerald-600 disabled:opacity-60"
            >
              {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Salvar'}
            </button>
            <Link
              href="/admin/karaoke"
              className="inline-flex h-12 items-center justify-center rounded-xl border border-slate-300 px-6 font-semibold text-slate-700 hover:bg-slate-50"
            >
              Cancelar
            </Link>
          </div>
        </form>
      </div>
    </AdminLayout>
  )
}
