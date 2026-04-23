/**
 * Aceita só o ID (ex. 4Oc6PTtcthA) ou URL do YouTube e devolve o videoId.
 */
export function parseYoutubeVideoId(input: string): string | null {
  const s = String(input).trim()
  if (!s) return null

  if (!/https?:\/\//i.test(s) && !/youtu\.be|youtube\.com/i.test(s)) {
    const clean = s.replace(/\s/g, '')
    if (/^[a-zA-Z0-9_-]{6,20}$/.test(clean)) return clean
  }

  try {
    const u = new URL(s.startsWith('http') ? s : `https://${s}`)
    const host = u.hostname.replace(/^www\./, '')

    if (host === 'youtu.be') {
      const id = u.pathname.split('/').filter(Boolean)[0]
      return id && /^[a-zA-Z0-9_-]{6,20}$/.test(id) ? id : null
    }

    if (host === 'youtube.com' || host === 'm.youtube.com' || host === 'music.youtube.com') {
      const v = u.searchParams.get('v')
      if (v && /^[a-zA-Z0-9_-]{6,20}$/.test(v)) return v
      const parts = u.pathname.split('/').filter(Boolean)
      if (parts[0] === 'embed' && parts[1] && /^[a-zA-Z0-9_-]{6,20}$/.test(parts[1])) return parts[1]
      if (parts[0] === 'shorts' && parts[1] && /^[a-zA-Z0-9_-]{6,20}$/.test(parts[1])) return parts[1]
    }
  } catch {
    /* */
  }

  const m = s.match(/(?:v=|\/embed\/|youtu\.be\/|\/shorts\/)([a-zA-Z0-9_-]{6,20})/)
  return m?.[1] ?? null
}
