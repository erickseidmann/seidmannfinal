/**
 * Bloco de notas no admin — post-its por usuário admin (API + banco), máx. 20.
 */

'use client'

import { useState, useEffect, useCallback } from 'react'
import AdminLayout from '@/components/admin/AdminLayout'
import Modal from '@/components/admin/Modal'
import { useTranslation } from '@/contexts/LanguageContext'
import { StickyNote, Plus, Trash2, Maximize2 } from 'lucide-react'
import Button from '@/components/ui/Button'

const MAX_POSTITS = 20

type PostItHue = 0 | 1 | 2 | 3 | 4 | 5

interface PostItNote {
  id: string
  text: string
  hue: PostItHue
}

const POSTIT_HEX = ['#fff8dc', '#ffe4ec', '#e0f2fe', '#ecfccb', '#ede9fe', '#ffedd5'] as const

const POSTIT_PALETTE: { bg: string; border: string; shadow: string; accent: string }[] = [
  { bg: 'bg-[#fff8dc]', border: 'border-amber-200/90', shadow: 'shadow-amber-200/40', accent: 'text-amber-800/70' },
  { bg: 'bg-[#ffe4ec]', border: 'border-rose-200/90', shadow: 'shadow-rose-200/40', accent: 'text-rose-800/70' },
  { bg: 'bg-[#e0f2fe]', border: 'border-sky-200/90', shadow: 'shadow-sky-200/40', accent: 'text-sky-900/60' },
  { bg: 'bg-[#ecfccb]', border: 'border-lime-200/90', shadow: 'shadow-lime-200/35', accent: 'text-lime-900/55' },
  { bg: 'bg-[#ede9fe]', border: 'border-violet-200/90', shadow: 'shadow-violet-200/40', accent: 'text-violet-900/60' },
  { bg: 'bg-[#ffedd5]', border: 'border-orange-200/90', shadow: 'shadow-orange-200/40', accent: 'text-orange-900/60' },
]

const COLOR_LABELS = ['Amarelo', 'Rosa', 'Azul claro', 'Verde lima', 'Lilás', 'Laranja'] as const

function newId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID()
  return `n-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

function normalizeNotesFromApi(list: unknown[]): PostItNote[] {
  return list
    .filter((n): n is Record<string, unknown> => !!n && typeof n === 'object')
    .map((n) => ({
      id: typeof n.id === 'string' && n.id.length > 0 ? n.id : newId(),
      text: typeof n.text === 'string' ? n.text : '',
      hue: (typeof n.hue === 'number' && n.hue >= 0 && n.hue < POSTIT_PALETTE.length ? n.hue : 0) as PostItHue,
    }))
    .slice(0, MAX_POSTITS)
}

function tearDurationMs(): number {
  if (typeof window === 'undefined') return 720
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 160 : 720
}

export default function BlocoDeNotasPage() {
  const { t } = useTranslation()
  const [notes, setNotes] = useState<PostItNote[]>([])
  const [initialLoading, setInitialLoading] = useState(true)
  const [boardReady, setBoardReady] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [reloadToken, setReloadToken] = useState(0)
  const [removingId, setRemovingId] = useState<string | null>(null)
  const [colorPickerOpen, setColorPickerOpen] = useState(false)
  const [limitModalOpen, setLimitModalOpen] = useState(false)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const retryLoad = useCallback(() => setReloadToken((x) => x + 1), [])

  useEffect(() => {
    let cancelled = false
    setInitialLoading(true)
    setLoadError(null)
    fetch('/api/admin/post-its', { credentials: 'include' })
      .then(async (res) => {
        const json = (await res.json().catch(() => ({}))) as { ok?: boolean; message?: string; data?: { notes?: unknown } }
        if (cancelled) return
        if (!res.ok || !json.ok) {
          throw new Error(json.message || 'Não foi possível carregar seus post-its.')
        }
        const list = json.data?.notes
        if (!Array.isArray(list)) {
          throw new Error('Resposta inválida do servidor.')
        }
        setNotes(normalizeNotesFromApi(list))
        setBoardReady(true)
        setSaveError(null)
      })
      .catch((e: unknown) => {
        if (cancelled) return
        setLoadError(e instanceof Error ? e.message : 'Erro ao carregar.')
        setNotes([{ id: newId(), text: '', hue: 0 }])
        setBoardReady(false)
      })
      .finally(() => {
        if (!cancelled) setInitialLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [reloadToken])

  useEffect(() => {
    if (!boardReady) return
    const timer = window.setTimeout(() => {
      fetch('/api/admin/post-its', {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          notes: notes.map((n) => ({ id: n.id, text: n.text, hue: n.hue })),
        }),
      })
        .then(async (res) => {
          const json = (await res.json().catch(() => ({}))) as { ok?: boolean; message?: string }
          if (!res.ok || !json.ok) {
            throw new Error(json.message || 'Não foi possível salvar.')
          }
          setSaveError(null)
        })
        .catch((e: unknown) => {
          setSaveError(e instanceof Error ? e.message : 'Erro ao salvar.')
        })
    }, 450)
    return () => clearTimeout(timer)
  }, [notes, boardReady])

  useEffect(() => {
    if (!removingId) return
    const ms = tearDurationMs()
    const t = window.setTimeout(() => {
      setNotes((prev) => {
        const next = prev.filter((n) => n.id !== removingId)
        return next.length === 0 ? [{ id: newId(), text: '', hue: 0 }] : next
      })
      setRemovingId(null)
    }, ms)
    return () => clearTimeout(t)
  }, [removingId])

  useEffect(() => {
    if (removingId && expandedId === removingId) setExpandedId(null)
  }, [removingId, expandedId])

  const openNewPostIt = useCallback(() => {
    if (!boardReady) return
    if (notes.length >= MAX_POSTITS) {
      setLimitModalOpen(true)
      return
    }
    setColorPickerOpen(true)
  }, [notes.length, boardReady])

  const confirmColorAndCreate = useCallback((hue: PostItHue) => {
    setNotes((prev) => {
      if (prev.length >= MAX_POSTITS) return prev
      return [...prev, { id: newId(), text: '', hue }]
    })
    setColorPickerOpen(false)
  }, [])

  const updateText = useCallback((id: string, text: string) => {
    setNotes((prev) => prev.map((n) => (n.id === id ? { ...n, text } : n)))
  }, [])

  const startRemove = useCallback(
    (id: string) => {
      if (removingId) return
      setRemovingId(id)
    },
    [removingId]
  )

  const busy = removingId !== null
  const canEdit = boardReady && !busy

  const expandedNote = expandedId ? notes.find((n) => n.id === expandedId) : undefined
  const expandedPal = expandedNote ? POSTIT_PALETTE[expandedNote.hue % POSTIT_PALETTE.length] : null
  const expandedHex = expandedNote ? POSTIT_HEX[expandedNote.hue % POSTIT_HEX.length] : null

  return (
    <AdminLayout>
      <div className="rounded-2xl border border-slate-200/80 bg-gradient-to-b from-slate-100/80 to-slate-200/40 p-6 md:p-8 shadow-lg min-h-[min(70vh,640px)]">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-6">
          <div className="flex items-start gap-3 min-w-0">
            <div className="rounded-lg bg-white/90 p-2 text-amber-600 shadow-sm border border-amber-100 shrink-0">
              <StickyNote className="w-6 h-6" aria-hidden />
            </div>
            <div className="min-w-0">
              <h1 className="text-2xl font-semibold text-slate-800">{t('admin.notesPad')}</h1>
              <p className="text-sm text-slate-600 mt-1 max-w-xl">
                Até {MAX_POSTITS} post-its <strong>por usuário admin</strong> (vinculados à sua conta). Outros admins não
                veem os seus.{' '}
                <span className="text-slate-500">
                  Clique na fita ou na borda do bloquinho, no botão &quot;Ampliar&quot;, ou dê <strong>duplo clique</strong> no texto
                  para ver tudo em tela grande.
                </span>
              </p>
              <p className="text-xs text-slate-500 mt-1">
                {!initialLoading && boardReady ? (
                  <>
                    {notes.length}/{MAX_POSTITS} post-its
                  </>
                ) : null}
              </p>
            </div>
          </div>
          <Button
            type="button"
            variant="primary"
            size="sm"
            onClick={openNewPostIt}
            disabled={!canEdit}
            className="shrink-0 inline-flex items-center gap-2"
          >
            <Plus className="w-4 h-4" aria-hidden />
            Novo post-it
          </Button>
        </div>

        {saveError && boardReady ? (
          <p className="text-sm text-red-600 mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2" role="alert">
            {saveError}
          </p>
        ) : null}

        <Modal
          isOpen={colorPickerOpen}
          onClose={() => setColorPickerOpen(false)}
          title="Escolha a cor do post-it"
          size="sm"
          footer={
            <Button type="button" variant="outline" size="sm" onClick={() => setColorPickerOpen(false)}>
              Cancelar
            </Button>
          }
        >
          <p className="text-sm text-gray-600 mb-4">Toque em uma cor para criar um novo bloquinho.</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {POSTIT_PALETTE.map((pal, idx) => {
              const hex = POSTIT_HEX[idx]
              return (
                <button
                  key={idx}
                  type="button"
                  onClick={() => confirmColorAndCreate(idx as PostItHue)}
                  className={`flex flex-col items-center gap-2 rounded-xl border-2 border-transparent p-3 transition-transform hover:scale-[1.03] focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-orange focus-visible:ring-offset-2 ${pal.bg} shadow-md hover:shadow-lg`}
                  style={{ borderColor: 'rgba(0,0,0,0.06)' }}
                  aria-label={`Criar post-it ${COLOR_LABELS[idx]}`}
                >
                  <span
                    className="h-10 w-full rounded-md shadow-inner border border-black/[0.08]"
                    style={{ backgroundColor: hex }}
                  />
                  <span className="text-xs font-semibold text-slate-800">{COLOR_LABELS[idx]}</span>
                </button>
              )
            })}
          </div>
        </Modal>

        <Modal
          isOpen={limitModalOpen}
          onClose={() => setLimitModalOpen(false)}
          title="Limite de post-its"
          footer={
            <Button type="button" variant="primary" size="sm" onClick={() => setLimitModalOpen(false)}>
              Entendi
            </Button>
          }
        >
          <p className="text-sm text-gray-700">
            Você já tem <strong>{MAX_POSTITS} post-its</strong>, que é o máximo por usuário. Exclua um post-it (ele será
            &quot;rasgado&quot; na animação) e depois crie outro.
          </p>
        </Modal>

        <Modal
          isOpen={!!expandedNote}
          onClose={() => setExpandedId(null)}
          title="Post-it ampliado"
          size="lg"
          footer={
            <Button type="button" variant="primary" size="sm" onClick={() => setExpandedId(null)}>
              Fechar
            </Button>
          }
        >
          {expandedNote && expandedHex ? (
            <div
              className={`rounded-xl border-2 border-black/10 p-4 sm:p-5 shadow-inner ${expandedPal?.border ?? ''}`}
              style={{
                backgroundColor: expandedHex,
                minHeight: 'min(55vh, 420px)',
              }}
            >
              <p className="text-xs font-semibold text-slate-700/80 mb-2">
                Cor: {COLOR_LABELS[expandedNote.hue % COLOR_LABELS.length]}
              </p>
              <textarea
                value={expandedNote.text}
                onChange={(e) => updateText(expandedNote.id, e.target.value)}
                placeholder="Sua anotação…"
                spellCheck
                disabled={!boardReady}
                className="w-full min-h-[min(48vh,360px)] rounded-lg border border-black/10 bg-white/40 px-4 py-3 text-base leading-relaxed text-slate-900 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-brand-orange/50 resize-y disabled:opacity-60"
                style={{ fontFamily: 'ui-sans-serif, system-ui, sans-serif' }}
              />
            </div>
          ) : null}
        </Modal>

        {initialLoading ? (
          <p className="text-sm text-slate-500">Carregando seus post-its…</p>
        ) : loadError ? (
          <div className="rounded-xl border border-amber-200 bg-amber-50/80 px-4 py-4 text-sm text-amber-950 space-y-3">
            <p>{loadError}</p>
            <Button type="button" variant="primary" size="sm" onClick={retryLoad}>
              Tentar novamente
            </Button>
          </div>
        ) : (
          <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 sm:gap-8 list-none p-0 m-0 items-start">
            {notes.map((note, index) => {
              const pal = POSTIT_PALETTE[note.hue % POSTIT_PALETTE.length]
              const hex = POSTIT_HEX[note.hue % POSTIT_HEX.length]
              const tilt = index % 3 === 0 ? '-rotate-1' : index % 3 === 1 ? 'rotate-1' : 'rotate-0'
              const isTearing = removingId === note.id

              return (
                <li
                  key={note.id}
                  className={`relative ${tilt} transition-transform ${isTearing ? '' : 'hover:rotate-0 hover:z-10'} duration-200`}
                >
                  <div className="relative min-h-[168px]">
                    {!isTearing ? (
                      <div
                        role="presentation"
                        onClick={(e) => {
                          if (!canEdit) return
                          const t = e.target as HTMLElement
                          if (t.closest('textarea') || t.closest('button')) return
                          setExpandedId(note.id)
                        }}
                        className={`rounded-sm border ${pal.bg} ${pal.border} border-b-4 shadow-lg ${pal.shadow} pt-7 pb-3 px-3 min-h-[168px] flex flex-col ${canEdit ? 'cursor-pointer' : 'cursor-default opacity-80'}`}
                      >
                        <span
                          className="absolute top-2 left-1/2 -translate-x-1/2 w-10 h-2.5 rounded-full bg-white/55 border border-black/[0.06] shadow-inner pointer-events-none"
                          aria-hidden
                        />
                        <div className="absolute top-2 right-2 flex items-center gap-0.5">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation()
                              if (canEdit) setExpandedId(note.id)
                            }}
                            disabled={!canEdit}
                            className={`p-1.5 rounded-md ${pal.accent} hover:bg-black/5 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-orange disabled:opacity-40 disabled:pointer-events-none`}
                            aria-label="Ampliar post-it"
                            title="Ampliar"
                          >
                            <Maximize2 className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation()
                              startRemove(note.id)
                            }}
                            disabled={!canEdit}
                            className={`p-1.5 rounded-md ${pal.accent} hover:bg-black/5 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-orange disabled:opacity-40 disabled:pointer-events-none`}
                            aria-label="Remover post-it"
                            title="Excluir"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                        <textarea
                          value={note.text}
                          onChange={(e) => updateText(note.id, e.target.value)}
                          onClick={(e) => e.stopPropagation()}
                          onDoubleClick={(e) => {
                            e.stopPropagation()
                            if (canEdit) setExpandedId(note.id)
                          }}
                          placeholder="Anotação…"
                          title="Duplo clique para ampliar"
                          rows={5}
                          spellCheck
                          disabled={!canEdit}
                          className={`w-full flex-1 resize-none bg-transparent text-sm leading-relaxed text-slate-900 placeholder:text-slate-500/60 focus:outline-none font-medium cursor-text ${pal.accent}`}
                          style={{ fontFamily: 'ui-sans-serif, system-ui, sans-serif' }}
                        />
                      </div>
                    ) : (
                      <div
                        className="absolute inset-0 z-20 flex overflow-visible pointer-events-none select-none"
                        aria-hidden
                      >
                        <div className="w-1/2 h-full overflow-hidden rounded-l-sm border-y border-l border-black/10 shadow-md origin-right">
                          <div
                            className="h-full w-[200%] rounded-l-sm border-y border-l pt-6 px-2 pb-2 postit-animate-tear-left"
                            style={{
                              backgroundColor: hex,
                              boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.35)',
                            }}
                          >
                            <div className="mx-auto mb-2 h-2 w-9 rounded-full bg-white/50 border border-black/[0.06]" />
                          </div>
                        </div>
                        <div
                          className="w-px shrink-0 bg-gradient-to-b from-transparent via-black/20 to-transparent opacity-70"
                          style={{
                            backgroundImage: `repeating-linear-gradient(
                              to bottom,
                              rgba(0,0,0,0.2) 0px,
                              rgba(0,0,0,0.2) 2px,
                              transparent 2px,
                              transparent 5px
                            )`,
                          }}
                        />
                        <div className="w-1/2 h-full overflow-hidden rounded-r-sm border-y border-r border-black/10 shadow-md origin-left">
                          <div
                            className="h-full w-[200%] ml-[-100%] rounded-r-sm border-y border-r pt-6 px-2 pb-2 postit-animate-tear-right"
                            style={{
                              backgroundColor: hex,
                              boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.35)',
                            }}
                          >
                            <div className="mx-auto mb-2 h-2 w-9 rounded-full bg-white/50 border border-black/[0.06]" />
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </AdminLayout>
  )
}
