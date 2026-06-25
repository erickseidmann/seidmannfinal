/** Texto exibido ao usuário para alerta de novo anúncio. */
export const NEW_ANNOUNCEMENT_ALERT_MESSAGE = 'Tem um novo anúncio.'

const ANNOUNCEMENT_ID_RE = /\[announcementId:([^\]]+)\]/

export function announcementAlertMessage(announcementId: string): string {
  return `${NEW_ANNOUNCEMENT_ALERT_MESSAGE} [announcementId:${announcementId}]`
}

export function parseAnnouncementIdFromAlertMessage(message: string): string | null {
  const m = message.match(ANNOUNCEMENT_ID_RE)
  return m?.[1]?.trim() || null
}

/** Remove metadado interno antes de exibir o texto do alerta. */
export function displayAlertMessage(message: string): string {
  return message.replace(/\s*\[announcementId:[^\]]+\]\s*/g, '').trim()
}

export function isNewAnnouncementAlert(message: string, type?: string | null): boolean {
  if (type === 'NEW_ANNOUNCEMENT') return true
  return (
    displayAlertMessage(message) === NEW_ANNOUNCEMENT_ALERT_MESSAGE ||
    ANNOUNCEMENT_ID_RE.test(message)
  )
}

export type AnnouncementPreview = {
  id: string
  title: string
  message: string
  criadoEm: string
  sentAt?: string | null
}

/** Encontra o anúncio vinculado a um alerta (por id embutido ou proximidade de data). */
export function resolveAnnouncementForAlert(
  alert: { message: string; criadoEm: string; type?: string | null; announcementId?: string | null },
  announcements: AnnouncementPreview[]
): AnnouncementPreview | null {
  if (!isNewAnnouncementAlert(alert.message, alert.type)) return null

  const explicitId = alert.announcementId ?? parseAnnouncementIdFromAlertMessage(alert.message)
  if (explicitId) {
    const byId = announcements.find((a) => a.id === explicitId)
    if (byId) return byId
  }

  const alertTime = new Date(alert.criadoEm).getTime()
  if (Number.isNaN(alertTime)) return announcements[0] ?? null

  const withinFiveMin = announcements
    .map((a) => ({
      a,
      diff: Math.abs(new Date(a.criadoEm).getTime() - alertTime),
    }))
    .filter((x) => x.diff <= 5 * 60 * 1000)
    .sort((x, y) => x.diff - y.diff)

  return withinFiveMin[0]?.a ?? announcements[0] ?? null
}
