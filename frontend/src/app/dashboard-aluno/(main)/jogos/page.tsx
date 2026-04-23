/**
 * Hub dos mini-jogos de inglês (4 jogos × 30 níveis + Karaoke).
 */

'use client'

import Link from 'next/link'
import { Gamepad2 } from 'lucide-react'
import { GAME_META, GAME_SLUGS, LEVELS_PER_GAME } from '@/lib/english-games-content'
import { useEffect, useState } from 'react'

const STORAGE_KEY = 'seidmann_jogos_progress_v1'

function loadProgress(): Record<string, Set<number>> {
  if (typeof window === 'undefined') return {}
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    const o = JSON.parse(raw) as Record<string, number[]>
    const out: Record<string, Set<number>> = {}
    for (const slug of GAME_SLUGS) {
      out[slug] = new Set(o[slug] || [])
    }
    return out
  } catch {
    return {}
  }
}

export default function JogosHubPage() {
  const [progress, setProgress] = useState<Record<string, Set<number>>>({})

  useEffect(() => {
    setProgress(loadProgress())
  }, [])

  const completedCount = (slug: string) => progress[slug]?.size ?? 0

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <Gamepad2 className="w-8 h-8 text-brand-orange" />
          Jogos
        </h1>
        <p className="text-gray-600 mt-1 max-w-2xl">
          Pratique inglês com quatro desafios em níveis (cada um com {LEVELS_PER_GAME} fases) e o <strong>Karaokê</strong> pra
          se divertir: vídeo, letra sincronizada e desafio entre colegas. Nos jogos por nível, o próximo só libera
          depois que você concluir o anterior. O progresso dos jogos por nível fica salvo neste aparelho.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Link
          href="/dashboard-aluno/jogos/karaoke"
          className="group rounded-2xl border border-gray-200 bg-white p-5 shadow-sm hover:shadow-md hover:border-brand-orange/40 transition-all"
        >
          <div className="flex items-start gap-3">
            <span className="text-3xl" aria-hidden>
              🎤
            </span>
            <div className="min-w-0 flex-1">
              <h2 className="font-semibold text-gray-900 group-hover:text-brand-orange transition-colors">Karaokê</h2>
              <p className="text-sm text-gray-500 mt-0.5">🎤 Cante junto, se divirta e desafie seus colegas</p>
              <p className="text-xs text-gray-600 mt-2 leading-relaxed">
                Músicas da escola, vídeo e letra no ritmo. Use fones e compartilhe o desafio com a galera.
              </p>
              <div className="mt-3 flex items-center justify-between gap-2">
                <span className="text-xs font-medium text-brand-orange">Músicas e desafios</span>
                <span className="text-xs text-gray-400 group-hover:text-brand-orange/80">Abrir →</span>
              </div>
            </div>
          </div>
        </Link>
        {GAME_SLUGS.map((slug) => {
          const meta = GAME_META[slug]
          const done = completedCount(slug)
          return (
            <Link
              key={slug}
              href={`/dashboard-aluno/jogos/${slug}`}
              className="group rounded-2xl border border-gray-200 bg-white p-5 shadow-sm hover:shadow-md hover:border-brand-orange/40 transition-all"
            >
              <div className="flex items-start gap-3">
                <span className="text-3xl" aria-hidden>
                  {meta.emoji}
                </span>
                <div className="min-w-0 flex-1">
                  <h2 className="font-semibold text-gray-900 group-hover:text-brand-orange transition-colors">
                    {meta.title}
                  </h2>
                  <p className="text-sm text-gray-500 mt-0.5">{meta.short}</p>
                  <p className="text-xs text-gray-600 mt-2 leading-relaxed">{meta.description}</p>
                  <div className="mt-3 flex items-center justify-between gap-2">
                    <span className="text-xs font-medium text-brand-orange">
                      {done}/{LEVELS_PER_GAME} níveis concluídos
                    </span>
                    <span className="text-xs text-gray-400 group-hover:text-brand-orange/80">Abrir →</span>
                  </div>
                  <div className="mt-2 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-brand-orange rounded-full transition-all"
                      style={{ width: `${(done / LEVELS_PER_GAME) * 100}%` }}
                    />
                  </div>
                </div>
              </div>
            </Link>
          )
        })}
      </div>
    </div>
  )
}
