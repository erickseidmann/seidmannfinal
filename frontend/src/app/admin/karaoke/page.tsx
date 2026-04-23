'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import AdminLayout from '@/components/admin/AdminLayout'
import { Loader2, Music, Pencil, Plus, Trash2 } from 'lucide-react'

type KaraokeSongRow = {
  id: string
  title: string
  artist: string
  youtubeId: string
  level: string
  difficulty: string
  emoji: string | null
  lyrics: string
  startOffsetSec: number
  active: boolean
}

function difficultyClass(d: string) {
  const x = d.toLowerCase()
  if (x === 'easy') return 'bg-green-100 text-green-700'
  if (x === 'medium') return 'bg-yellow-100 text-yellow-700'
  if (x === 'hard') return 'bg-red-100 text-red-700'
  return 'bg-gray-100 text-gray-700'
}

export default function AdminKaraokeListPage() {
  const [songs, setSongs] = useState<KaraokeSongRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [togglingId, setTogglingId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/admin/karaoke', { credentials: 'include' })
      const json = await res.json()
      if (!json.ok) {
        setError(json.message || 'Erro ao carregar')
        setSongs([])
        return
      }
      setSongs(json.data || [])
    } catch {
      setError('Erro de rede')
      setSongs([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const toggleActive = async (song: KaraokeSongRow) => {
    setTogglingId(song.id)
    try {
      const res = await fetch(`/api/admin/karaoke/${song.id}`, {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: song.title,
          artist: song.artist,
          youtubeId: song.youtubeId,
          level: song.level,
          difficulty: song.difficulty,
          emoji: song.emoji,
          lyrics: song.lyrics,
          startOffsetSec: song.startOffsetSec ?? 0,
          active: !song.active,
        }),
      })
      const json = await res.json()
      if (!json.ok) {
        alert(json.message || 'Erro ao atualizar')
        return
      }
      await load()
    } finally {
      setTogglingId(null)
    }
  }

  const deleteSong = async (song: KaraokeSongRow) => {
    if (!confirm(`Excluir "${song.title}"? Esta ação não pode ser desfeita.`)) return
    try {
      const res = await fetch(`/api/admin/karaoke/${song.id}`, {
        method: 'DELETE',
        credentials: 'include',
      })
      const json = await res.json()
      if (!json.ok) {
        alert(json.message || 'Erro ao excluir')
        return
      }
      await load()
    } catch {
      alert('Erro ao excluir')
    }
  }

  return (
    <AdminLayout>
      <div className="max-w-6xl mx-auto px-4 py-8">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
          <div className="flex items-center gap-3">
            <Music className="w-8 h-8 text-orange-500" />
            <h1 className="text-2xl font-bold text-slate-800">Karaokê — músicas</h1>
          </div>
          <Link
            href="/admin/karaoke/novo"
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-orange-500 to-amber-400 px-5 py-3 text-white font-semibold shadow-lg hover:from-orange-600 hover:to-amber-500 transition-all"
          >
            <Plus className="w-5 h-5" />
            Nova música
          </Link>
        </div>

        {error && (
          <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-red-700 text-sm">{error}</p>
        )}

        {loading ? (
          <div className="flex justify-center py-16 text-slate-500">
            <Loader2 className="w-8 h-8 animate-spin" />
          </div>
        ) : songs.length === 0 ? (
          <p className="text-slate-600">Nenhuma música cadastrada.</p>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-md">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-left text-slate-600">
                  <th className="px-4 py-3 font-semibold">Emoji</th>
                  <th className="px-4 py-3 font-semibold">Título</th>
                  <th className="px-4 py-3 font-semibold">Artista</th>
                  <th className="px-4 py-3 font-semibold">Nível</th>
                  <th className="px-4 py-3 font-semibold">Dificuldade</th>
                  <th className="px-4 py-3 font-semibold">Ativo</th>
                  <th className="px-4 py-3 font-semibold text-right">Ações</th>
                </tr>
              </thead>
              <tbody>
                {songs.map((s) => (
                  <tr key={s.id} className="border-b border-slate-100 hover:bg-slate-50/80">
                    <td className="px-4 py-3 text-2xl">{s.emoji || '—'}</td>
                    <td className="px-4 py-3 font-medium text-slate-800">{s.title}</td>
                    <td className="px-4 py-3 text-slate-600">{s.artist}</td>
                    <td className="px-4 py-3">
                      <span className="rounded-full bg-orange-100 px-2.5 py-0.5 text-xs font-semibold text-orange-800">
                        {s.level}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${difficultyClass(s.difficulty)}`}>
                        {s.difficulty}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        disabled={togglingId === s.id}
                        onClick={() => void toggleActive(s)}
                        className={`relative inline-flex h-7 w-12 items-center rounded-full transition-colors ${
                          s.active ? 'bg-emerald-500' : 'bg-slate-300'
                        } ${togglingId === s.id ? 'opacity-60' : ''}`}
                        aria-label={s.active ? 'Desativar' : 'Ativar'}
                      >
                        <span
                          className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${
                            s.active ? 'translate-x-6' : 'translate-x-1'
                          }`}
                        />
                      </button>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex justify-end gap-2">
                        <Link
                          href={`/admin/karaoke/${s.id}`}
                          className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 text-slate-700 hover:bg-slate-100"
                        >
                          <Pencil className="w-4 h-4" />
                          Editar
                        </Link>
                        <button
                          type="button"
                          onClick={() => void deleteSong(s)}
                          className="inline-flex items-center gap-1 rounded-lg border border-red-200 px-3 py-1.5 text-red-700 hover:bg-red-50"
                        >
                          <Trash2 className="w-4 h-4" />
                          Excluir
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </AdminLayout>
  )
}
