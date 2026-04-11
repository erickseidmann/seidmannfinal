/**
 * Leitura em voz (Web Speech API) — funciona no Chrome/Edge/Safari em HTTPS.
 * Inglês para palavras/frases; português para dicas longas.
 */

function getSynth(): SpeechSynthesis | null {
  if (typeof window === 'undefined') return null
  return window.speechSynthesis ?? null
}

export function stopGameSpeech(): void {
  const s = getSynth()
  if (s) s.cancel()
}

/** Mensagem curta após o 1º erro (a dica longa não usa áudio). */
export const GENTLE_WRONG_ENCOURAGEMENT_PT =
  'Hum, essa não é a resposta certa. Pense de novo com calma.'

/** Dois bipes curtos (“tan tan”) para feedback negativo leve. */
export function playWrongAttemptChime(): void {
  if (typeof window === 'undefined') return
  try {
    const AC =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!AC) return
    const ctx = new AC()
    const playTone = (startTime: number, freq: number) => {
      const o = ctx.createOscillator()
      const g = ctx.createGain()
      o.connect(g)
      g.connect(ctx.destination)
      o.type = 'sine'
      o.frequency.value = freq
      const peak = 0.11
      g.gain.setValueAtTime(0.0001, startTime)
      g.gain.exponentialRampToValueAtTime(peak, startTime + 0.02)
      g.gain.exponentialRampToValueAtTime(0.0001, startTime + 0.1)
      o.start(startTime)
      o.stop(startTime + 0.11)
    }
    const t0 = ctx.currentTime
    playTone(t0, 360)
    playTone(t0 + 0.14, 300)
    window.setTimeout(() => {
      void ctx.close().catch(() => {})
    }, 600)
  } catch {
    // ignora ambientes sem áudio
  }
}

/** Bipes + frase curta em português (1ª tentativa errada). */
export function playGentleWrongFeedback(): void {
  stopGameSpeech()
  playWrongAttemptChime()
  window.setTimeout(() => {
    speakPortuguese(GENTLE_WRONG_ENCOURAGEMENT_PT)
  }, 400)
}

export function speakEnglish(text: string): void {
  const s = getSynth()
  if (!s || !text.trim()) return
  s.cancel()
  const u = new SpeechSynthesisUtterance(text.trim())
  u.lang = 'en-US'
  u.rate = 0.9
  u.pitch = 1
  s.speak(u)
}

export function speakPortuguese(text: string): void {
  const s = getSynth()
  if (!s || !text.trim()) return
  s.cancel()
  const u = new SpeechSynthesisUtterance(text.trim())
  u.lang = 'pt-BR'
  u.rate = 0.95
  s.speak(u)
}

/** Fala inglês e, ao terminar, fala a dica em português (útil após erro). */
export function speakEnglishThenPortugueseTip(english: string, tipPt: string): void {
  const s = getSynth()
  if (!s) return
  s.cancel()
  const u1 = new SpeechSynthesisUtterance(english.trim())
  u1.lang = 'en-US'
  u1.rate = 0.88
  u1.onend = () => {
    const u2 = new SpeechSynthesisUtterance(tipPt.trim())
    u2.lang = 'pt-BR'
    u2.rate = 0.95
    s.speak(u2)
  }
  s.speak(u1)
}

/** Lê várias palavras em inglês em sequência. */
export function speakEnglishWords(words: string[]): void {
  const s = getSynth()
  if (!s || words.length === 0) return
  s.cancel()
  const list = words.map((w) => w.trim()).filter(Boolean)
  let i = 0
  const speakNext = () => {
    if (i >= list.length) return
    const u = new SpeechSynthesisUtterance(list[i])
    u.lang = 'en-US'
    u.rate = 0.88
    u.onend = () => {
      i += 1
      speakNext()
    }
    s.speak(u)
  }
  speakNext()
}

type SpeechLang = 'en-US' | 'pt-BR'

/** Várias falas em sequência (ex.: opções de quiz em idiomas mistos). */
export function speakSequentially(items: { text: string; lang: SpeechLang }[]): void {
  const s = getSynth()
  if (!s || items.length === 0) return
  s.cancel()
  const list = items.map((x) => ({ text: x.text.trim(), lang: x.lang })).filter((x) => x.text.length > 0)
  let i = 0
  const next = () => {
    if (i >= list.length) return
    const { text, lang } = list[i]
    const u = new SpeechSynthesisUtterance(text)
    u.lang = lang
    u.rate = lang === 'en-US' ? 0.88 : 0.95
    u.onend = () => {
      i += 1
      next()
    }
    s.speak(u)
  }
  next()
}

export function isSpeechSynthesisAvailable(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window
}
