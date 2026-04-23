'use client'

import type { Dispatch, SetStateAction } from 'react'
import { parseYoutubeVideoId } from '@/lib/youtube-id'

export type KaraokeFormState = {
  title: string
  artist: string
  youtubeId: string
  level: string
  difficulty: string
  emoji: string
  lyrics: string
  /** Segundos de intro antes de alinhar a 1.ª linha (ex. 4) */
  startOffsetSec: number
  active: boolean
}

export function emptyKaraokeForm(): KaraokeFormState {
  return {
    title: '',
    artist: '',
    youtubeId: '',
    level: 'A1',
    difficulty: 'easy',
    emoji: '',
    lyrics: '',
    startOffsetSec: 0,
    active: true,
  }
}

export function KaraokeSongFields({
  form,
  setForm,
  idPrefix = '',
}: {
  form: KaraokeFormState
  setForm: Dispatch<SetStateAction<KaraokeFormState>>
  idPrefix?: string
}) {
  const pid = (s: string) => (idPrefix ? `${idPrefix}-${s}` : s)
  const previewId = parseYoutubeVideoId(form.youtubeId)
  const rawYoutube = form.youtubeId.trim()

  return (
    <div className="space-y-5">
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
        <label htmlFor={pid('artist')} className="block text-sm font-medium text-slate-700 mb-1">
          Artista
        </label>
        <input
          id={pid('artist')}
          type="text"
          value={form.artist}
          onChange={(e) => setForm((f) => ({ ...f, artist: e.target.value }))}
          className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-slate-900 focus:ring-2 focus:ring-orange-400/40 focus:border-orange-400"
        />
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <div>
          <label htmlFor={pid('youtube')} className="block text-sm font-medium text-slate-700 mb-1">
            YouTube ID
          </label>
          <input
            id={pid('youtube')}
            type="text"
            value={form.youtubeId}
            onChange={(e) => setForm((f) => ({ ...f, youtubeId: e.target.value }))}
            placeholder="dQw4w9WgXcQ"
            className="w-full rounded-xl border border-slate-200 px-4 py-2.5 font-mono text-sm text-slate-900 focus:ring-2 focus:ring-orange-400/40 focus:border-orange-400"
          />
          <p className="mt-1 text-xs text-slate-500">
            Pode colar só o ID (ex. <code className="rounded bg-slate-100 px-1">4Oc6PTtcthA</code>) ou o link inteiro do YouTube — o sistema extrai o ID.
          </p>
        </div>
        <div>
          <span className="block text-sm font-medium text-slate-700 mb-1">Pré-visualização</span>
          <div className="aspect-video w-full overflow-hidden rounded-xl border border-slate-200 bg-slate-100 shadow-inner">
            {previewId ? (
              <iframe
                title="YouTube preview"
                src={`https://www.youtube.com/embed/${encodeURIComponent(previewId)}`}
                className="h-full w-full"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              />
            ) : rawYoutube ? (
              <div className="flex h-full items-center justify-center px-2 text-center text-sm text-amber-800">
                Não foi possível extrair o ID. Cole o link do YouTube ou só o ID após v=.
              </div>
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-slate-400">Cole o link ou o ID para ver o vídeo</div>
            )}
          </div>
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor={pid('level')} className="block text-sm font-medium text-slate-700 mb-1">
            Nível
          </label>
          <select
            id={pid('level')}
            value={form.level}
            onChange={(e) => setForm((f) => ({ ...f, level: e.target.value }))}
            className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-slate-900 focus:ring-2 focus:ring-orange-400/40 focus:border-orange-400"
          >
            {['A1', 'A2', 'B1', 'B2'].map((l) => (
              <option key={l} value={l}>
                {l}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor={pid('difficulty')} className="block text-sm font-medium text-slate-700 mb-1">
            Dificuldade
          </label>
          <select
            id={pid('difficulty')}
            value={form.difficulty}
            onChange={(e) => setForm((f) => ({ ...f, difficulty: e.target.value }))}
            className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-slate-900 focus:ring-2 focus:ring-orange-400/40 focus:border-orange-400"
          >
            <option value="easy">easy</option>
            <option value="medium">medium</option>
            <option value="hard">hard</option>
          </select>
        </div>
      </div>
      <div>
        <label htmlFor={pid('emoji')} className="block text-sm font-medium text-slate-700 mb-1">
          Emoji <span className="font-normal text-slate-400">(opcional)</span>
        </label>
        <input
          id={pid('emoji')}
          type="text"
          value={form.emoji}
          onChange={(e) => setForm((f) => ({ ...f, emoji: e.target.value }))}
          className="w-full max-w-xs rounded-xl border border-slate-200 px-4 py-2.5 text-slate-900 focus:ring-2 focus:ring-orange-400/40 focus:border-orange-400"
        />
      </div>
      <div>
        <label htmlFor={pid('startOffset')} className="block text-sm font-medium text-slate-700 mb-1">
          Início da letra (segundos)
        </label>
        <input
          id={pid('startOffset')}
          type="number"
          min={0}
          max={600}
          step={0.5}
          value={Number.isFinite(form.startOffsetSec) ? form.startOffsetSec : 0}
          onChange={(e) => {
            const v = parseFloat(e.target.value)
            setForm((f) => ({ ...f, startOffsetSec: Number.isFinite(v) ? Math.max(0, v) : 0 }))
          }}
          className="w-full max-w-xs rounded-xl border border-slate-200 px-4 py-2.5 text-slate-900 focus:ring-2 focus:ring-orange-400/40 focus:border-orange-400"
        />
        <p className="mt-1 text-xs text-slate-500">
          Tempo no início do vídeo (intro) antes de a primeira linha começar. Ex.: <strong>4</strong> se a voz só entra
          depois de 4s.
        </p>
      </div>
      <div>
        <label htmlFor={pid('lyrics')} className="block text-sm font-medium text-slate-700 mb-1">
          Letra
        </label>
        <textarea
          id={pid('lyrics')}
          value={form.lyrics}
          onChange={(e) => setForm((f) => ({ ...f, lyrics: e.target.value }))}
          rows={14}
          placeholder="Uma linha por verso..."
          className="w-full rounded-xl border border-slate-200 px-4 py-3 font-mono text-sm text-slate-900 focus:ring-2 focus:ring-orange-400/40 focus:border-orange-400"
        />
      </div>
      <div className="flex items-center gap-3">
        <button
          type="button"
          role="switch"
          aria-checked={form.active}
          onClick={() => setForm((f) => ({ ...f, active: !f.active }))}
          className={`relative inline-flex h-8 w-14 items-center rounded-full transition-colors ${
            form.active ? 'bg-emerald-500' : 'bg-slate-300'
          }`}
        >
          <span
            className={`inline-block h-6 w-6 transform rounded-full bg-white shadow transition-transform ${
              form.active ? 'translate-x-7' : 'translate-x-1'
            }`}
          />
        </button>
        <span className="text-sm font-medium text-slate-700">Ativo</span>
      </div>
    </div>
  )
}
