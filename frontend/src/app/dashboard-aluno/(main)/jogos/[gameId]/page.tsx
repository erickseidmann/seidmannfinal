'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import {
  ArrowLeft,
  Check,
  ChevronLeft,
  Lightbulb,
  Loader2,
  Lock,
  RotateCcw,
  Trophy,
  Volume2,
} from 'lucide-react'
import Button from '@/components/ui/Button'
import {
  explainWrongPairMatch,
  GAME_META,
  GAME_SLUGS,
  type GameSlug,
  getBlankLevel,
  getMatchLevel,
  getOrderLevel,
  getQuizLevel,
  isValidGameSlug,
  LEVELS_PER_GAME,
} from '@/lib/english-games-content'
import {
  isSpeechSynthesisAvailable,
  playGentleWrongFeedback,
  speakEnglish,
  speakEnglishWords,
  speakPortuguese,
  speakSequentially,
  stopGameSpeech,
} from '@/lib/english-games-speech'

const STORAGE_KEY = 'seidmann_jogos_progress_v1'

function isLevelUnlocked(n: number, done: Set<number>): boolean {
  if (n <= 1) return true
  return done.has(n - 1)
}

function loadProgressMap(): Record<string, Set<number>> {
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

function saveLevelDone(slug: GameSlug, level: number) {
  const p = loadProgressMap()
  if (!p[slug]) p[slug] = new Set()
  p[slug].add(level)
  const serial: Record<string, number[]> = {}
  for (const s of GAME_SLUGS) {
    serial[s] = [...(p[s] || [])].sort((a, b) => a - b)
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(serial))
}

export default function JogoPorIdPage() {
  const params = useParams()
  const router = useRouter()
  const raw = params?.gameId
  const gameId = typeof raw === 'string' ? raw : Array.isArray(raw) ? raw[0] : ''

  const [mounted, setMounted] = useState(false)
  const [progress, setProgress] = useState<Record<string, Set<number>>>({})
  const [level, setLevel] = useState<number | null>(null)
  const [wonBanner, setWonBanner] = useState(false)

  useEffect(() => {
    setMounted(true)
    setProgress(loadProgressMap())
  }, [])

  useEffect(() => {
    if (!gameId || !isValidGameSlug(gameId)) {
      router.replace('/dashboard-aluno/jogos')
    }
  }, [gameId, router])

  const slug = isValidGameSlug(gameId) ? gameId : 'pares'
  const meta = GAME_META[slug]

  const refreshProgress = useCallback(() => {
    setProgress(loadProgressMap())
  }, [])

  const onWinLevel = useCallback(
    (lv: number) => {
      saveLevelDone(slug, lv)
      refreshProgress()
      setWonBanner(true)
    },
    [slug, refreshProgress]
  )

  const doneSet = progress[slug] ?? new Set<number>()

  if (!mounted || !gameId || !isValidGameSlug(gameId)) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="w-10 h-10 animate-spin text-brand-orange" />
      </div>
    )
  }

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      <div className="flex flex-wrap items-center gap-3">
        <Link
          href="/dashboard-aluno/jogos"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-600 hover:text-brand-orange"
        >
          <ArrowLeft className="w-4 h-4" />
          Todos os jogos
        </Link>
      </div>

      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-gray-900 flex items-center gap-2">
          <span aria-hidden>{meta.emoji}</span>
          {meta.title}
        </h1>
        <p className="text-gray-600 text-sm mt-1">{meta.description}</p>
      </div>

      {level === null ? (
        <>
          <p className="text-sm text-gray-500">
            Escolha um nível ({doneSet.size}/{LEVELS_PER_GAME} concluídos). Desbloqueie o próximo só depois de
            concluir o anterior.
          </p>
          <div className="grid grid-cols-5 sm:grid-cols-6 gap-2">
            {Array.from({ length: LEVELS_PER_GAME }, (_, i) => i + 1).map((n) => {
              const isDone = doneSet.has(n)
              const unlocked = isLevelUnlocked(n, doneSet)
              return (
                <button
                  key={n}
                  type="button"
                  disabled={!unlocked}
                  title={!unlocked ? `Conclua o nível ${n - 1} primeiro` : undefined}
                  onClick={() => {
                    if (!unlocked) return
                    stopGameSpeech()
                    setLevel(n)
                    setWonBanner(false)
                  }}
                  className={`min-h-[44px] rounded-xl text-sm font-semibold border transition-colors touch-manipulation flex flex-col items-center justify-center gap-0.5 ${
                    !unlocked
                      ? 'bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed opacity-80'
                      : isDone
                        ? 'bg-green-50 text-green-800 border-green-200 hover:bg-green-100'
                        : 'bg-white text-gray-800 border-gray-200 hover:border-brand-orange/50 hover:bg-brand-orange/5'
                  }`}
                >
                  {!unlocked && <Lock className="w-3.5 h-3.5" aria-hidden />}
                  <span>{n}</span>
                </button>
              )
            })}
          </div>
        </>
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                stopGameSpeech()
                setLevel(null)
                setWonBanner(false)
              }}
            >
              <ChevronLeft className="w-4 h-4 mr-1" />
              Níveis
            </Button>
            <span className="text-sm font-medium text-gray-700">
              Nível {level} / {LEVELS_PER_GAME}
            </span>
          </div>

          {wonBanner && (
            <div className="flex items-center gap-2 rounded-xl bg-green-50 border border-green-200 px-3 py-2 text-green-800 text-sm">
              <Trophy className="w-5 h-5 shrink-0" />
              Nível concluído! Escolha outro na lista ou avance.
            </div>
          )}

          {slug === 'pares' && (
            <GameMatch key={level} level={level} onWin={() => onWinLevel(level)} />
          )}
          {slug === 'complete' && (
            <GameBlank key={level} level={level} onWin={() => onWinLevel(level)} />
          )}
          {slug === 'quiz' && (
            <GameQuiz key={level} level={level} onWin={() => onWinLevel(level)} />
          )}
          {slug === 'ordene' && (
            <GameOrder key={level} level={level} onWin={() => onWinLevel(level)} />
          )}
        </div>
      )}
    </div>
  )
}

type WrongHintBox = { tier: 'soft' | 'hard'; text: string }

function GameMatch({ level, onWin }: { level: number; onWin: () => void }) {
  const data = useMemo(() => getMatchLevel(level), [level])
  const [matched, setMatched] = useState<Set<string>>(new Set())
  const [sel, setSel] = useState<{ side: 'en' | 'pt'; id: string } | null>(null)
  const [wrong, setWrong] = useState(false)
  const [wrongHint, setWrongHint] = useState<WrongHintBox | null>(null)
  const wonRef = useRef(false)
  const wrongStreakRef = useRef(0)
  const speechOk = isSpeechSynthesisAvailable()

  useEffect(() => {
    return () => stopGameSpeech()
  }, [])

  useEffect(() => {
    setMatched(new Set())
    setSel(null)
    setWrong(false)
    setWrongHint(null)
    wonRef.current = false
    wrongStreakRef.current = 0
    stopGameSpeech()
  }, [level])

  useEffect(() => {
    if (matched.size === data.pairs.length && data.pairs.length > 0 && !wonRef.current) {
      wonRef.current = true
      onWin()
    }
  }, [matched.size, data.pairs.length, onWin])

  const tap = (side: 'en' | 'pt', id: string) => {
    if (matched.has(id)) return
    setWrongHint(null)
    if (!sel) {
      setSel({ side, id })
      const row = data.pairs.find((p) => p.id === id)
      if (row) {
        if (side === 'en') speakEnglish(row.en)
        else speakPortuguese(row.pt)
      }
      return
    }
    if (sel.side === side) {
      setSel({ side, id })
      const row = data.pairs.find((p) => p.id === id)
      if (row) {
        if (side === 'en') speakEnglish(row.en)
        else speakPortuguese(row.pt)
      }
      return
    }
    if (sel.id === id) {
      const row = data.pairs.find((p) => p.id === id)
      if (row) speakEnglish(row.en)
      wrongStreakRef.current = 0
      setMatched((m) => new Set(m).add(id))
      setSel(null)
      setWrong(false)
      setWrongHint(null)
    } else {
      wrongStreakRef.current += 1
      const tier = wrongStreakRef.current >= 2 ? 'hard' : 'soft'
      if (tier === 'soft') {
        setWrongHint({
          tier: 'soft',
          text: 'Esse par não combina. Respire, olhe o tabuleiro de novo e tente outra junção.',
        })
        playGentleWrongFeedback()
      } else {
        setWrongHint({
          tier: 'hard',
          text: explainWrongPairMatch(data.pairs, sel.id, id),
        })
      }
      setWrong(true)
      setTimeout(() => {
        setSel(null)
        setWrong(false)
      }, 600)
    }
  }

  const hearAllEnglish = () => {
    speakEnglishWords(data.pairs.map((p) => p.en))
  }

  return (
    <div className={`rounded-2xl border border-gray-200 bg-white p-4 ${wrong ? 'ring-2 ring-red-200' : ''}`}>
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <p className="text-sm text-gray-600">Toque em um inglês e depois no português correspondente.</p>
        {speechOk && (
          <button
            type="button"
            onClick={hearAllEnglish}
            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-gray-50 px-2.5 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-100 touch-manipulation"
          >
            <Volume2 className="w-3.5 h-3.5" aria-hidden />
            Ouvir palavras (EN)
          </button>
        )}
      </div>
      {wrongHint?.tier === 'soft' && (
        <div className="mb-3 rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-700">
          <p>{wrongHint.text}</p>
        </div>
      )}
      {wrongHint?.tier === 'hard' && (
        <div className="mb-3 flex gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
          <Lightbulb className="w-4 h-4 shrink-0 mt-0.5" aria-hidden />
          <p>{wrongHint.text}</p>
        </div>
      )}
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <p className="text-xs font-semibold text-gray-500 uppercase">English</p>
          {data.enSide.map((c) => (
            <button
              key={`en-${c.id}`}
              type="button"
              disabled={matched.has(c.id)}
              onClick={() => tap('en', c.id)}
              className={`w-full min-h-[48px] rounded-xl border px-3 py-2 text-left text-sm font-medium transition-colors touch-manipulation ${
                matched.has(c.id)
                  ? 'bg-green-50 border-green-300 text-green-800 line-through opacity-70'
                  : sel?.side === 'en' && sel.id === c.id
                    ? 'bg-brand-orange/15 border-brand-orange text-brand-orange'
                    : 'bg-gray-50 border-gray-200 hover:bg-gray-100'
              }`}
            >
              {c.text}
            </button>
          ))}
        </div>
        <div className="space-y-2">
          <p className="text-xs font-semibold text-gray-500 uppercase">Português</p>
          {data.ptSide.map((c) => (
            <button
              key={`pt-${c.id}`}
              type="button"
              disabled={matched.has(c.id)}
              onClick={() => tap('pt', c.id)}
              className={`w-full min-h-[48px] rounded-xl border px-3 py-2 text-left text-sm font-medium transition-colors touch-manipulation ${
                matched.has(c.id)
                  ? 'bg-green-50 border-green-300 text-green-800 line-through opacity-70'
                  : sel?.side === 'pt' && sel.id === c.id
                    ? 'bg-brand-orange/15 border-brand-orange text-brand-orange'
                    : 'bg-gray-50 border-gray-200 hover:bg-gray-100'
              }`}
            >
              {c.text}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

function GameBlank({ level, onWin }: { level: number; onWin: () => void }) {
  const data = useMemo(() => getBlankLevel(level), [level])
  const [picked, setPicked] = useState<string | null>(null)
  const [ok, setOk] = useState(false)
  const [wrongHint, setWrongHint] = useState<WrongHintBox | null>(null)
  const wrongStreakRef = useRef(0)
  const speechOk = isSpeechSynthesisAvailable()

  useEffect(() => {
    return () => stopGameSpeech()
  }, [])

  useEffect(() => {
    setPicked(null)
    setOk(false)
    setWrongHint(null)
    wrongStreakRef.current = 0
    stopGameSpeech()
  }, [level])

  const fullSentenceEn = (word: string) => data.sentence.split('___').join(word)

  const hearSentence = (word: string) => {
    speakEnglish(fullSentenceEn(word))
  }

  const check = (opt: string) => {
    setPicked(opt)
    setWrongHint(null)
    if (opt === data.correct) {
      wrongStreakRef.current = 0
      setOk(true)
      speakEnglish(fullSentenceEn(opt))
      onWin()
      return
    }
    wrongStreakRef.current += 1
    if (wrongStreakRef.current === 1) {
      setWrongHint({
        tier: 'soft',
        text: 'Ainda não é essa. Relia a frase com calma antes de escolher de novo.',
      })
      playGentleWrongFeedback()
      return
    }
    const why =
      data.wrongHints[opt] ??
      'Essa opção não encaixa na lacuna gramatical. Compare com a forma correta na dica abaixo.'
    setWrongHint({ tier: 'hard', text: `${why} ${data.tipPt}` })
  }

  const parts = data.sentence.split('___')

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-4 space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <p className="text-base sm:text-lg text-gray-900 leading-relaxed flex-1 min-w-0">
          {parts[0]}
          <span className="mx-1 px-2 py-0.5 rounded bg-amber-100 text-brand-orange font-semibold">
            {picked ?? '___'}
          </span>
          {parts[1]}
        </p>
        {speechOk && (
          <button
            type="button"
            onClick={() => hearSentence(ok ? data.correct : picked ?? data.correct)}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-gray-200 bg-gray-50 px-2.5 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-100 touch-manipulation"
          >
            <Volume2 className="w-3.5 h-3.5" aria-hidden />
            Ouvir frase
          </button>
        )}
      </div>
      {wrongHint?.tier === 'soft' && (
        <div className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-700">
          <p>{wrongHint.text}</p>
        </div>
      )}
      {wrongHint?.tier === 'hard' && (
        <div className="flex gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
          <Lightbulb className="w-4 h-4 shrink-0 mt-0.5" aria-hidden />
          <p>{wrongHint.text}</p>
        </div>
      )}
      <div className="grid grid-cols-2 gap-2">
        {data.options.map((opt) => (
          <button
            key={opt}
            type="button"
            disabled={ok}
            onClick={() => check(opt)}
            className={`min-h-[48px] rounded-xl border px-3 text-sm font-medium touch-manipulation ${
              ok && opt === data.correct
                ? 'bg-green-50 border-green-400 text-green-800'
                : picked === opt && opt !== data.correct
                  ? 'bg-red-50 border-red-300 text-red-800'
                  : 'bg-gray-50 border-gray-200 hover:bg-gray-100'
            }`}
          >
            {opt}
          </button>
        ))}
      </div>
      {ok && (
        <p className="text-sm text-green-700 flex items-center gap-1">
          <Check className="w-4 h-4" /> Correto!
        </p>
      )}
    </div>
  )
}

function quizOptionSoundsEnglish(opt: string): boolean {
  const t = opt.trim()
  if (t.length > 48) return false
  if (/[áàâãéêíóôõúçÁÀÂÃÉÊÍÓÔÕÚÇ]/.test(t)) return false
  if (/\b(substantivos|contáveis|incontáveis|ambos|futuro|obrigação|permissão|hábito)\b/i.test(t)) return false
  return /^[A-Za-z0-9\s,'’().—\-]+$/.test(t)
}

function GameQuiz({ level, onWin }: { level: number; onWin: () => void }) {
  const data = useMemo(() => getQuizLevel(level), [level])
  const [picked, setPicked] = useState<number | null>(null)
  const [ok, setOk] = useState(false)
  const [wrongHint, setWrongHint] = useState<WrongHintBox | null>(null)
  const wrongStreakRef = useRef(0)
  const speechOk = isSpeechSynthesisAvailable()

  useEffect(() => {
    return () => stopGameSpeech()
  }, [])

  useEffect(() => {
    setPicked(null)
    setOk(false)
    setWrongHint(null)
    wrongStreakRef.current = 0
    stopGameSpeech()
  }, [level])

  const check = (i: number) => {
    setPicked(i)
    setWrongHint(null)
    const opt = data.options[i]
    if (i === data.correct) {
      wrongStreakRef.current = 0
      setOk(true)
      if (quizOptionSoundsEnglish(opt)) speakEnglish(opt)
      else speakPortuguese(opt)
      onWin()
      return
    }
    wrongStreakRef.current += 1
    if (wrongStreakRef.current === 1) {
      setWrongHint({
        tier: 'soft',
        text: 'Não foi dessa vez. Releia a pergunta com atenção antes de marcar outra opção.',
      })
      playGentleWrongFeedback()
      return
    }
    const why =
      data.wrongHints[opt] ??
      'Essa alternativa não responde ao que a pergunta pede. Compare com a explicação abaixo.'
    setWrongHint({ tier: 'hard', text: why })
  }

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-4 space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <p className="font-medium text-gray-900 flex-1 min-w-0">{data.q}</p>
        {speechOk && (
          <button
            type="button"
            onClick={() => speakPortuguese(data.q)}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-gray-200 bg-gray-50 px-2.5 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-100 touch-manipulation"
          >
            <Volume2 className="w-3.5 h-3.5" aria-hidden />
            Ouvir pergunta
          </button>
        )}
      </div>
      {speechOk && (
        <button
          type="button"
          onClick={() =>
            speakSequentially(
              data.options.map((opt) => ({
                text: opt,
                lang: quizOptionSoundsEnglish(opt) ? 'en-US' : 'pt-BR',
              })),
            )
          }
          className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 touch-manipulation"
        >
          <Volume2 className="w-3.5 h-3.5" aria-hidden />
          Ouvir todas as opções
        </button>
      )}
      {wrongHint?.tier === 'soft' && (
        <div className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-700">
          <p>{wrongHint.text}</p>
        </div>
      )}
      {wrongHint?.tier === 'hard' && (
        <div className="flex gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
          <Lightbulb className="w-4 h-4 shrink-0 mt-0.5" aria-hidden />
          <p>{wrongHint.text}</p>
        </div>
      )}
      <div className="space-y-2">
        {data.options.map((opt, i) => (
          <button
            key={i}
            type="button"
            disabled={ok}
            onClick={() => check(i)}
            className={`w-full min-h-[48px] rounded-xl border px-3 text-left text-sm font-medium touch-manipulation ${
              ok && i === data.correct
                ? 'bg-green-50 border-green-400 text-green-800'
                : picked === i && i !== data.correct
                  ? 'bg-red-50 border-red-300'
                  : 'bg-gray-50 border-gray-200 hover:bg-gray-100'
            }`}
          >
            {opt}
          </button>
        ))}
      </div>
    </div>
  )
}

function GameOrder({ level, onWin }: { level: number; onWin: () => void }) {
  const { words, correctOrder, hintPt, fullEn } = useMemo(() => getOrderLevel(level), [level])
  const [pool, setPool] = useState<string[]>([])
  const [built, setBuilt] = useState<string[]>([])
  const [done, setDone] = useState(false)
  const [busy, setBusy] = useState(false)
  const [wrongHint, setWrongHint] = useState<WrongHintBox | null>(null)
  const wrongStreakRef = useRef(0)
  const speechOk = isSpeechSynthesisAvailable()

  useEffect(() => {
    return () => stopGameSpeech()
  }, [])

  useEffect(() => {
    setPool([...words])
    setBuilt([])
    setDone(false)
    setBusy(false)
    setWrongHint(null)
    wrongStreakRef.current = 0
    stopGameSpeech()
  }, [level, words])

  const addWord = (w: string, idx: number) => {
    if (done || busy) return
    const newPool = pool.filter((_, i) => i !== idx)
    const newBuilt = [...built, w]
    if (newPool.length === 0) {
      const good = newBuilt.length === correctOrder.length && newBuilt.every((x, i) => x === correctOrder[i])
      if (good) {
        wrongStreakRef.current = 0
        setPool(newPool)
        setBuilt(newBuilt)
        setDone(true)
        speakEnglish(fullEn)
        onWin()
      } else {
        wrongStreakRef.current += 1
        const tier = wrongStreakRef.current >= 2 ? 'hard' : 'soft'
        setPool(newPool)
        setBuilt(newBuilt)
        setBusy(true)
        if (tier === 'soft') {
          setWrongHint({
            tier: 'soft',
            text: 'A ordem das palavras ainda não fecha a frase. Pense no sujeito e no verbo antes de montar de novo.',
          })
          playGentleWrongFeedback()
        } else {
          setWrongHint({
            tier: 'hard',
            text: `Ordem incorreta. ${hintPt} Frase correta: «${fullEn}».`,
          })
        }
        window.setTimeout(() => {
          setPool([...words])
          setBuilt([])
          setWrongHint(null)
          setBusy(false)
        }, tier === 'hard' ? 4200 : 2800)
      }
      return
    }
    setPool(newPool)
    setBuilt(newBuilt)
  }

  const undo = () => {
    if (done || busy) return
    const last = built[built.length - 1]
    if (!last) return
    setBuilt((b) => b.slice(0, -1))
    setPool((p) => [...p, last])
  }

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-4 space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <p className="text-sm text-gray-600 flex-1 min-w-0">
          Clique nas palavras na ordem correta. Use desfazer se errar antes de fechar a frase.
        </p>
        {speechOk && (
          <button
            type="button"
            onClick={() => speakEnglish(fullEn)}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-gray-200 bg-gray-50 px-2.5 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-100 touch-manipulation"
          >
            <Volume2 className="w-3.5 h-3.5" aria-hidden />
            Ouvir frase modelo
          </button>
        )}
      </div>
      {wrongHint?.tier === 'soft' && (
        <div className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-700">
          <p>{wrongHint.text}</p>
        </div>
      )}
      {wrongHint?.tier === 'hard' && (
        <div className="flex gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
          <Lightbulb className="w-4 h-4 shrink-0 mt-0.5" aria-hidden />
          <p>{wrongHint.text}</p>
        </div>
      )}
      <div className="min-h-[52px] rounded-xl border-2 border-dashed border-gray-200 bg-gray-50 px-3 py-2 flex flex-wrap gap-1.5 items-center">
        {built.length === 0 ? (
          <span className="text-gray-400 text-sm">Sua frase aparece aqui…</span>
        ) : (
          built.map((w, i) => (
            <span key={`${w}-${i}`} className="px-2 py-1 rounded-lg bg-white border border-gray-200 text-sm font-medium">
              {w}
            </span>
          ))
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        {pool.map((w, idx) => (
          <button
            key={`${w}-${idx}`}
            type="button"
            disabled={done || busy}
            onClick={() => addWord(w, idx)}
            className="min-h-[44px] px-3 rounded-xl border border-gray-200 bg-white text-sm font-medium hover:bg-brand-orange/5 touch-manipulation disabled:opacity-50"
          >
            {w}
          </button>
        ))}
      </div>
      <div className="flex gap-2">
        <Button type="button" variant="outline" size="sm" onClick={undo} disabled={done || busy || built.length === 0}>
          <RotateCcw className="w-4 h-4 mr-1" />
          Desfazer última
        </Button>
      </div>
      {done && (
        <p className="text-sm text-green-700 flex items-center gap-1">
          <Check className="w-4 h-4" /> Perfeito!
        </p>
      )}
    </div>
  )
}
