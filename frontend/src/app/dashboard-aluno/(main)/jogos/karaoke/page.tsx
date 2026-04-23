'use client'

import { Suspense, useCallback, useEffect, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import {
  AlertCircle,
  Check,
  ChevronLeft,
  Flame,
  RotateCcw,
  Share2,
  Square,
  Star,
  Volume2,
  X,
} from 'lucide-react'
import { effectiveKaraokeTimeSec, getLyricWindowSec } from '@/lib/karaoke-timing'

declare global {
  interface Window {
    YT: {
      Player: new (id: string, options: Record<string, unknown>) => {
        destroy: () => void
        pauseVideo: () => void
        getCurrentTime: () => number
      }
    }
    onYouTubeIframeAPIReady: (() => void) | undefined
  }
}

type Song = {
  id: string
  title: string
  artist: string
  youtubeId: string
  level: 'A1' | 'A2' | 'B1' | 'B2'
  difficulty: 'easy' | 'medium' | 'hard'
  emoji: string | null
  lyrics: string
  /** Segundos de intro no vídeo antes da 1.ª linha (admin) */
  startOffsetSec?: number
}

type Phase = 'select' | 'mic-check' | 'ready' | 'playing' | 'result'
type Challenge = { fromName: string; songId: string; targetScore: number }

const VOLUME_THRESHOLD = 0.025
const LINE_PASS_RATIO = 0.4

function difficultyBadgeClass(d: string) {
  const x = d.toLowerCase()
  if (x === 'easy') return 'bg-green-100 text-green-700'
  if (x === 'medium') return 'bg-yellow-100 text-yellow-700'
  if (x === 'hard') return 'bg-red-100 text-red-700'
  return 'bg-gray-100 text-gray-700'
}

function scoreMessageLines(score: number): string {
  if (score >= 90) return '🌟 Show de bola! Você mandou ver!'
  if (score >= 71) return '🔥 Que performance! Mandou muito bem!'
  if (score >= 41) return '🎵 Boa! Continue cantando pra ficar ainda melhor!'
  return '💪 Valeu a tentativa! Agora chama a galera pra desafiar!'
}

function KaraokeInner() {
  const router = useRouter()
  const searchParams = useSearchParams()

  const [phase, setPhase] = useState<Phase>('select')
  const [songs, setSongs] = useState<Song[]>([])
  const [songsLoading, setSongsLoading] = useState(true)
  const [selectedSong, setSelectedSong] = useState<Song | null>(null)
  const [challenge, setChallenge] = useState<Challenge | null>(null)

  const [micPermission, setMicPermission] = useState<'unknown' | 'granted' | 'denied'>('unknown')
  const [micError, setMicError] = useState<string | null>(null)
  const [volumeLevel, setVolumeLevel] = useState(0)

  const [ytReady, setYtReady] = useState(false)
  const playerRef = useRef<InstanceType<Window['YT']['Player']> | null>(null)
  const [playerReady, setPlayerReady] = useState(false)
  const [totalDuration, setTotalDuration] = useState(0)

  const [currentLineIndex, setCurrentLineIndex] = useState(0)
  const [lineProgress, setLineProgress] = useState(0)
  const [lineResults, setLineResults] = useState<boolean[]>([])
  const [finalScore, setFinalScore] = useState(0)
  const [shareFeedback, setShareFeedback] = useState<string | null>(null)
  const [userName, setUserName] = useState<string | null>(null)

  const phaseRef = useRef<Phase>('select')
  const selectedSongRef = useRef<Song | null>(null)
  const totalDurationRef = useRef(0)
  const lastTickRef = useRef<number | null>(null)
  const lineSingingTimeRef = useRef<number[]>([])
  const finishedRef = useRef(false)

  const audioContextRef = useRef<AudioContext | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const rafRef = useRef<number | null>(null)

  useEffect(() => {
    phaseRef.current = phase
  }, [phase])
  useEffect(() => {
    selectedSongRef.current = selectedSong
  }, [selectedSong])
  useEffect(() => {
    totalDurationRef.current = totalDuration
  }, [totalDuration])

  useEffect(() => {
    fetch('/api/student/me', { credentials: 'include' })
      .then((res) => res.json())
      .then((json) => {
        if (json.ok && json.data?.aluno?.nome) setUserName(String(json.data.aluno.nome))
      })
      .catch(() => {})
  }, [])

  useEffect(() => {
    setSongsLoading(true)
    fetch('/api/karaoke/songs', { credentials: 'include' })
      .then((res) => res.json())
      .then((json) => {
        if (json.ok && Array.isArray(json.data)) {
          setSongs(json.data as Song[])
        } else {
          setSongs([])
        }
      })
      .catch(() => setSongs([]))
      .finally(() => setSongsLoading(false))
  }, [])

  useEffect(() => {
    const encoded = searchParams.get('challenge')
    if (!encoded) return
    try {
      const c = JSON.parse(atob(encoded)) as Challenge
      if (c.songId && c.targetScore != null) setChallenge(c)
    } catch {
      /* ignore */
    }
  }, [searchParams])

  useEffect(() => {
    if (!challenge || songs.length === 0) return
    const song = songs.find((s) => s.id === challenge.songId)
    if (song) {
      setSelectedSong(song)
      setPhase('mic-check')
    }
  }, [challenge, songs])

  useEffect(() => {
    if (typeof window === 'undefined') return

    if (window.YT?.Player) {
      setYtReady(true)
      return
    }

    let script = document.querySelector(
      'script[src="https://www.youtube.com/iframe_api"]'
    ) as HTMLScriptElement | null
    if (!script) {
      script = document.createElement('script')
      script.src = 'https://www.youtube.com/iframe_api'
      document.head.appendChild(script)
    }

    const prev = window.onYouTubeIframeAPIReady
    window.onYouTubeIframeAPIReady = () => {
      if (typeof prev === 'function') prev()
      setYtReady(true)
    }
  }, [])

  const stopVolumeLoop = useCallback(() => {
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = null
    }
  }, [])

  const startVolumeLoop = useCallback(() => {
    stopVolumeLoop()
    const tick = () => {
      const analyser = analyserRef.current
      if (!analyser) return

      const buffer = new Uint8Array(analyser.fftSize)
      analyser.getByteTimeDomainData(buffer)
      let sum = 0
      for (let i = 0; i < buffer.length; i++) {
        const v = (buffer[i] - 128) / 128
        sum += v * v
      }
      const rms = Math.sqrt(sum / buffer.length)
      setVolumeLevel(rms)

      if (phaseRef.current === 'playing' && playerRef.current && totalDurationRef.current > 0) {
        const song = selectedSongRef.current
        if (song) {
          const lines = song.lyrics.split('\n').filter((l) => l.trim())
          if (lines.length > 0) {
            const currentTime = playerRef.current.getCurrentTime?.() ?? 0
            const off = Math.max(0, song.startOffsetSec ?? 0)
            const lyricWindow = getLyricWindowSec(totalDurationRef.current, off)
            const eff = effectiveKaraokeTimeSec(currentTime, off)
            const durationPerLine = lyricWindow / lines.length
            const lineIdx = Math.min(Math.floor(eff / durationPerLine), lines.length - 1)
            const progressInLine = durationPerLine > 0 ? (eff % durationPerLine) / durationPerLine : 0

            setCurrentLineIndex(lineIdx)
            setLineProgress(progressInLine)

            const now = performance.now()
            const dt = (now - (lastTickRef.current ?? now)) / 1000
            lastTickRef.current = now
            if (rms > VOLUME_THRESHOLD && lineIdx >= 0) {
              lineSingingTimeRef.current[lineIdx] = (lineSingingTimeRef.current[lineIdx] || 0) + dt
            }
          }
        }
      }

      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
  }, [stopVolumeLoop])

  async function setupMic() {
    try {
      setMicError(null)
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      })
      streamRef.current = stream
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
      const ctx = new AC()
      const source = ctx.createMediaStreamSource(stream)
      const analyser = ctx.createAnalyser()
      analyser.fftSize = 512
      source.connect(analyser)
      audioContextRef.current = ctx
      analyserRef.current = analyser
      setMicPermission('granted')
      startVolumeLoop()
    } catch (err: unknown) {
      console.error('[Karaokê] mic error:', err)
      setMicPermission('denied')
      const name = err && typeof err === 'object' && 'name' in err ? String((err as { name: string }).name) : ''
      setMicError(
        name === 'NotAllowedError'
          ? 'Permissão do microfone negada. Libere no cadeado da URL.'
          : 'Não foi possível acessar o microfone.'
      )
    }
  }

  const finishSong = useCallback(() => {
    if (finishedRef.current) return
    const song = selectedSongRef.current
    if (!song) return
    const lines = song.lyrics.split('\n').filter((l) => l.trim())
    finishedRef.current = true

    if (lines.length === 0) {
      setLineResults([])
      setFinalScore(0)
      setPhase('result')
      if (playerRef.current?.pauseVideo) {
        try {
          playerRef.current.pauseVideo()
        } catch {
          /* */
        }
      }
      return
    }

    const off = Math.max(0, song.startOffsetSec ?? 0)
    const lyricWindow = getLyricWindowSec(totalDurationRef.current, off)
    const durationPerLine = lyricWindow / lines.length
    const results = lines.map((_, i) => {
      const sung = lineSingingTimeRef.current[i] || 0
      return durationPerLine > 0 && sung / durationPerLine >= LINE_PASS_RATIO
    })
    const score = Math.round((results.filter(Boolean).length / results.length) * 100)
    setLineResults(results)
    setFinalScore(score)
    setPhase('result')

    if (playerRef.current?.pauseVideo) {
      try {
        playerRef.current.pauseVideo()
      } catch {
        /* */
      }
    }
  }, [])

  useEffect(() => {
    if (phase !== 'ready') return
    const t = window.setTimeout(() => setPhase('playing'), 2000)
    return () => clearTimeout(t)
  }, [phase])

  useEffect(() => {
    if (phase !== 'playing' || !ytReady || !selectedSong) return
    if (playerRef.current) return

    finishedRef.current = false
    setPlayerReady(false)
    setTotalDuration(0)
    setCurrentLineIndex(0)
    setLineProgress(0)
    lineSingingTimeRef.current = []

    playerRef.current = new window.YT.Player('yt-player', {
      videoId: selectedSong.youtubeId,
      playerVars: {
        autoplay: 1,
        controls: 0,
        modestbranding: 1,
        rel: 0,
        playsinline: 1,
      },
      events: {
        onReady: (e: { target: { getDuration: () => number; playVideo: () => void } }) => {
          const dur = e.target.getDuration()
          setTotalDuration(dur)
          totalDurationRef.current = dur
          setPlayerReady(true)
          e.target.playVideo()
          lastTickRef.current = performance.now()
          lineSingingTimeRef.current = []
        },
        onStateChange: (e: { data: number }) => {
          if (e.data === 0) finishSong()
        },
      },
    })

    return () => {
      if (playerRef.current?.destroy) {
        try {
          playerRef.current.destroy()
        } catch {
          /* */
        }
        playerRef.current = null
      }
    }
  }, [phase, ytReady, selectedSong, finishSong])

  useEffect(() => {
    return () => {
      stopVolumeLoop()
      streamRef.current?.getTracks().forEach((t) => t.stop())
      void audioContextRef.current?.close().catch(() => {})
      if (playerRef.current?.destroy) {
        try {
          playerRef.current.destroy()
        } catch {
          /* */
        }
      }
    }
  }, [stopVolumeLoop])

  /** Fogos de artifício / confete ao fechar 100% */
  useEffect(() => {
    if (phase !== 'result' || finalScore !== 100) return

    const timeouts: number[] = []
    let interval: ReturnType<typeof setInterval> | null = null
    let cancelled = false

    void import('canvas-confetti').then(({ default: confetti }) => {
      if (cancelled) return
      const warm = ['#ff5200', '#ffaa00', '#fbbf24', '#fde68a', '#f97316']
      const cool = ['#22c55e', '#38bdf8', '#a855f7', '#f472b6', '#ec4899']
      const base = {
        ticks: 130,
        zIndex: 3000,
        disableForReducedMotion: true,
        gravity: 0.85,
      } as const

      const burst = (x: number, y: number, n: number, colors: string[]) => {
        if (cancelled) return
        void confetti({
          ...base,
          particleCount: n,
          spread: 78,
          startVelocity: 46,
          origin: { x, y },
          colors,
          scalar: 1.05,
        })
      }

      timeouts.push(
        window.setTimeout(() => burst(0.18, 0.32, 85, warm), 0),
        window.setTimeout(() => burst(0.5, 0.24, 110, warm), 60),
        window.setTimeout(() => burst(0.82, 0.32, 85, warm), 120),
        window.setTimeout(() => {
          burst(0.36, 0.36, 70, cool)
          burst(0.64, 0.36, 70, cool)
        }, 320)
      )

      const end = Date.now() + 2800
      const shootEdges = () => {
        if (cancelled || Date.now() > end) {
          if (interval) {
            clearInterval(interval)
            interval = null
          }
          return
        }
        void confetti({
          ...base,
          particleCount: 4,
          angle: 60,
          spread: 52,
          startVelocity: 44,
          origin: { x: 0, y: 0.78 },
          colors: warm,
        })
        void confetti({
          ...base,
          particleCount: 4,
          angle: 120,
          spread: 52,
          startVelocity: 44,
          origin: { x: 1, y: 0.78 },
          colors: cool,
        })
      }
      shootEdges()
      interval = setInterval(shootEdges, 180)
    })

    return () => {
      cancelled = true
      timeouts.forEach((id) => clearTimeout(id))
      if (interval) clearInterval(interval)
    }
  }, [phase, finalScore])

  const challengeSongTitle = challenge ? songs.find((s) => s.id === challenge.songId)?.title : null

  const goSelect = () => {
    setSelectedSong(null)
    setPhase('select')
    setLineResults([])
    setFinalScore(0)
    setShareFeedback(null)
    router.replace('/dashboard-aluno/jogos/karaoke')
  }

  const tryAgain = () => {
    finishedRef.current = false
    lineSingingTimeRef.current = []
    setLineResults([])
    setFinalScore(0)
    setCurrentLineIndex(0)
    setLineProgress(0)
    setPlayerReady(false)
    setTotalDuration(0)
    setPhase('ready')
  }

  async function shareChallenge() {
    if (!selectedSong) return
    const payload: Challenge = {
      fromName: userName || 'Um colega',
      songId: selectedSong.id,
      targetScore: finalScore,
    }
    const encoded = btoa(JSON.stringify(payload))
    const url = `${window.location.origin}${window.location.pathname}?challenge=${encoded}`
    const text = `🎤 Consegue bater ${finalScore}% no karaokê do Seidmann cantando "${selectedSong.title}"? Bora tentar! ${url}`

    if (navigator.share) {
      try {
        await navigator.share({ title: 'Karaokê Seidmann', text, url })
      } catch {
        /* */
      }
    } else {
      await navigator.clipboard.writeText(text)
      setShareFeedback('Link copiado! 📋')
      window.setTimeout(() => setShareFeedback(null), 3000)
    }
  }

  const linesForSong = selectedSong ? selectedSong.lyrics.split('\n').filter((l) => l.trim()) : []
  const startOff = selectedSong ? Math.max(0, selectedSong.startOffsetSec ?? 0) : 0
  const lyricWindow =
    selectedSong && totalDuration > 0
      ? getLyricWindowSec(totalDuration, startOff)
      : 0
  const durationPerLine =
    selectedSong && lyricWindow > 0 && linesForSong.length > 0 ? lyricWindow / linesForSong.length : 0

  const prevIdx = currentLineIndex - 1
  const partialForLine = (idx: number) => {
    if (durationPerLine <= 0) return false
    const sung = lineSingingTimeRef.current[idx] || 0
    return sung / durationPerLine >= LINE_PASS_RATIO
  }

  const filledStars = Math.min(5, Math.max(0, Math.round(finalScore / 20)))

  return (
    <div className="min-h-screen bg-gradient-to-br from-orange-50 via-amber-50 to-white px-4 py-6 pb-12">
      <div className="mx-auto max-w-3xl">
        {phase === 'select' && (
          <button
            type="button"
            onClick={() => router.push('/dashboard-aluno')}
            className="mb-4 inline-flex items-center gap-1 text-sm font-medium text-slate-600 transition-colors hover:text-orange-600"
          >
            <ChevronLeft className="h-4 w-4" />
            Voltar
          </button>
        )}

        {challenge && challengeSongTitle && phase === 'select' && (
          <div className="mb-6 bg-gradient-to-r from-orange-500 to-amber-400 text-white rounded-2xl p-5 shadow-lg">
            <div className="flex items-center gap-3">
              <span className="text-3xl" aria-hidden>
                🔥
              </span>
              <div>
                <p className="font-bold text-lg">{challenge.fromName} te desafiou!</p>
                <p className="text-orange-50 text-sm">
                  Bata <strong>{challenge.targetScore}%</strong> em &quot;{challengeSongTitle}&quot; pra aceitar o
                  desafio
                </p>
              </div>
            </div>
          </div>
        )}

        {phase === 'select' && (
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold text-slate-900 md:text-4xl">🎤 Karaokê Seidmann</h1>
            <p className="mt-2 text-slate-600">Cante junto, se divirta e desafie seus colegas!</p>
          </div>
        )}

        {phase === 'select' && (
          <>
            {songsLoading ? (
              <p className="text-center text-slate-500">Carregando músicas…</p>
            ) : songs.length === 0 ? (
              <p className="rounded-2xl bg-white p-8 text-center text-slate-600 shadow-md">
                Nenhuma música cadastrada ainda. Peça pro admin cadastrar!
              </p>
            ) : (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3">
                {songs.map((song) => (
                  <button
                    key={song.id}
                    type="button"
                    onClick={() => {
                      setSelectedSong(song)
                      setPhase('mic-check')
                      setMicPermission('unknown')
                      setMicError(null)
                    }}
                    className="group rounded-2xl bg-white p-5 text-left shadow-md transition-all duration-200 hover:-translate-y-1 hover:shadow-xl"
                  >
                    <div className="text-4xl mb-2">{song.emoji || '🎵'}</div>
                    <h2 className="font-bold text-slate-900 group-hover:text-orange-700">{song.title}</h2>
                    <p className="text-sm text-slate-600">{song.artist}</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <span className="rounded-full bg-orange-100 px-2 py-0.5 text-xs font-semibold text-orange-800">
                        {song.level}
                      </span>
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-semibold ${difficultyBadgeClass(song.difficulty)}`}
                      >
                        {song.difficulty}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </>
        )}

        {phase === 'mic-check' && selectedSong && (
          <div className="mx-auto max-w-lg">
            <button
              type="button"
              onClick={() => {
                setSelectedSong(null)
                setPhase('select')
              }}
              className="mb-4 inline-flex items-center gap-1 text-sm font-medium text-slate-600 hover:text-orange-600"
            >
              <ChevronLeft className="h-4 w-4" />
              Voltar
            </button>
            <div className="rounded-2xl bg-white p-6 shadow-md md:p-8">
              <h2 className="text-xl font-bold text-slate-900 mb-2">{selectedSong.title}</h2>
              <p className="text-sm text-slate-600 mb-4">{selectedSong.artist}</p>

              <div className="bg-orange-50 border border-orange-200 rounded-xl p-4 mt-4 space-y-2 text-sm mb-4">
                <p className="font-semibold text-orange-900">💡 Como funciona:</p>
                <ul className="space-y-1.5 text-gray-700">
                  <li>
                    🎧 Use <strong>fones de ouvido</strong> pro microfone não captar o som do vídeo
                  </li>
                  <li>
                    🎵 A nota é baseada em você <strong>cantar no ritmo</strong>
                  </li>
                  <li>🔥 Desafie seus colegas depois e veja quem faz a maior pontuação</li>
                </ul>
              </div>

              {micPermission === 'unknown' && (
                <button
                  type="button"
                  onClick={() => void setupMic()}
                  className="flex h-14 w-full items-center justify-center rounded-xl bg-gradient-to-r from-orange-500 to-amber-400 text-lg font-semibold text-white shadow-lg transition-all hover:from-orange-600 hover:to-amber-500"
                >
                  Liberar microfone
                </button>
              )}

              {micPermission === 'denied' && (
                <div className="space-y-3">
                  <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-4 text-red-800">
                    <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
                    <p className="text-sm">{micError}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setMicPermission('unknown')
                      void setupMic()
                    }}
                    className="w-full rounded-xl border border-red-300 py-3 font-semibold text-red-700 hover:bg-red-50"
                  >
                    Tentar novamente
                  </button>
                </div>
              )}

              {micPermission === 'granted' && (
                <div className="space-y-4">
                  <div>
                    <p className="text-sm text-slate-600 mb-2">Fale ou cante pra testar</p>
                    <div className="h-4 w-full overflow-hidden rounded-full bg-slate-200">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-orange-500 to-amber-400 transition-all duration-100"
                        style={{ width: `${Math.min(100, volumeLevel * 500)}%` }}
                      />
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setPhase('ready')}
                    className="flex h-14 w-full items-center justify-center rounded-xl bg-gradient-to-r from-orange-500 to-amber-400 text-lg font-semibold text-white shadow-lg transition-all hover:from-orange-600 hover:to-amber-500"
                  >
                    Começar
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {phase === 'ready' && selectedSong && (
          <div className="flex min-h-[50vh] flex-col items-center justify-center text-center">
            <Flame className="mb-4 h-12 w-12 text-orange-500" />
            <h2 className="text-3xl font-bold text-slate-900 md:text-4xl">{selectedSong.title}</h2>
            <p className="mt-4 text-xl text-orange-600">Prepare-se…</p>
          </div>
        )}

        {phase === 'playing' && selectedSong && (
          <div className="relative">
            <button
              type="button"
              onClick={() => finishSong()}
              className="absolute right-0 top-0 z-10 rounded-xl border border-slate-300 bg-white/90 px-3 py-1.5 text-sm font-medium text-slate-700 shadow-sm hover:bg-white"
            >
              <Square className="mr-1 inline h-3.5 w-3.5" />
              Parar
            </button>

            <div className="mx-auto mb-8 max-w-2xl overflow-hidden rounded-xl shadow-lg">
              <div id="yt-player" className="aspect-video w-full bg-black" />
            </div>

            <div className="mb-8 space-y-3 text-center">
              {prevIdx >= 0 && linesForSong[prevIdx] && (
                <p className="text-lg text-slate-500 md:text-xl">
                  {partialForLine(prevIdx) ? (
                    <Check className="mr-2 inline h-5 w-5 text-emerald-500" />
                  ) : (
                    <X className="mr-2 inline h-5 w-5 text-red-400" />
                  )}
                  {linesForSong[prevIdx]}
                </p>
              )}
              <div className="relative">
                <p className="text-3xl font-bold text-slate-900 md:text-5xl">{linesForSong[currentLineIndex] || '…'}</p>
                <div className="mx-auto mt-3 h-2 max-w-md overflow-hidden rounded-full bg-orange-100">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-orange-500 to-amber-400 transition-all duration-75"
                    style={{ width: `${Math.min(100, lineProgress * 100)}%` }}
                  />
                </div>
              </div>
              {linesForSong.slice(currentLineIndex + 1, currentLineIndex + 3).map((line, j) => (
                <p key={j} className="text-base text-slate-400 md:text-lg">
                  {line}
                </p>
              ))}
            </div>

            <div className="flex flex-col items-center">
              <div
                className={`flex h-24 w-24 items-center justify-center rounded-full shadow-lg transition-transform duration-100 ${
                  volumeLevel > VOLUME_THRESHOLD ? 'scale-110 bg-emerald-500/20 ring-4 ring-emerald-400' : 'scale-100 bg-red-500/10 ring-4 ring-red-300'
                }`}
              >
                <Volume2 className={`h-10 w-10 ${volumeLevel > VOLUME_THRESHOLD ? 'text-emerald-600' : 'text-red-500'}`} />
              </div>
              <p className="mt-2 text-sm font-medium text-slate-700">
                {volumeLevel > VOLUME_THRESHOLD ? '🎤 Cantando' : '🔇 Silêncio'}
              </p>
              {!playerReady && <p className="mt-2 text-xs text-slate-500">Carregando vídeo…</p>}
            </div>
          </div>
        )}

        {phase === 'result' && selectedSong && (
          <div className="mx-auto max-w-lg text-center">
            <div className="mx-auto mb-6 flex h-44 w-44 items-center justify-center rounded-full bg-gradient-to-br from-orange-500 to-amber-400 text-7xl font-bold text-white shadow-xl">
              {finalScore}%
            </div>
            <div className="mb-2 flex justify-center gap-1">
              {Array.from({ length: 5 }).map((_, i) => (
                <Star
                  key={i}
                  className={`h-8 w-8 ${i < filledStars ? 'fill-amber-400 text-amber-400' : 'text-slate-300'}`}
                />
              ))}
            </div>
            <p className="text-xs text-gray-500 mt-2 text-center max-w-md mx-auto">
              A nota mede o quanto você cantou no tempo certo da música, não se pronunciou corretamente.
            </p>
            <p className="mb-6 mt-4 text-lg font-medium text-slate-800">{scoreMessageLines(finalScore)}</p>

            {challenge && (
              <p className="mb-6 text-base font-medium text-slate-700">
                {finalScore >= challenge.targetScore
                  ? '🏆 Você superou o desafio!'
                  : '😅 Tente de novo pra bater o desafio!'}
              </p>
            )}

            <ul className="mb-8 space-y-2 rounded-2xl border border-slate-100 bg-white p-4 text-left shadow-inner">
              {linesForSong.map((line, i) => (
                <li key={i} className="flex items-start gap-2 text-sm">
                  {lineResults[i] ? (
                    <Check className="mt-0.5 h-5 w-5 shrink-0 text-emerald-500" />
                  ) : (
                    <X className="mt-0.5 h-5 w-5 shrink-0 text-red-500" />
                  )}
                  <span className="text-slate-700">{line}</span>
                </li>
              ))}
            </ul>

            {shareFeedback && <p className="mb-4 text-sm font-medium text-orange-600">{shareFeedback}</p>}

            <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:justify-center">
              <button
                type="button"
                onClick={tryAgain}
                className="inline-flex h-12 items-center justify-center rounded-xl border border-slate-300 px-6 font-semibold text-slate-700 hover:bg-white"
              >
                <RotateCcw className="mr-2 h-4 w-4" />
                Tentar novamente
              </button>
              <button
                type="button"
                onClick={() => void shareChallenge()}
                className="inline-flex h-12 items-center justify-center rounded-xl bg-gradient-to-r from-orange-500 to-amber-400 px-6 font-semibold text-white shadow-lg hover:from-orange-600 hover:to-amber-500"
              >
                <Share2 className="mr-2 h-4 w-4" />
                🔥 Desafiar um colega
              </button>
              <button
                type="button"
                onClick={goSelect}
                className="inline-flex h-12 items-center justify-center rounded-xl border border-slate-300 px-6 font-semibold text-slate-700 hover:bg-white"
              >
                Outra música
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default function KaraokePage() {
  return (
    <Suspense
      fallback={<div className="flex justify-center py-20 text-slate-500">A carregar Karaokê…</div>}
    >
      <KaraokeInner />
    </Suspense>
  )
}
