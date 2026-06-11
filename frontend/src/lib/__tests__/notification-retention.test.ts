import {
  ADMIN_NOTIFICATION_READ_VISIBILITY_HOURS,
  adminNotificationReadVisibilityCutoff,
  notificationRetentionCutoff,
} from '@/lib/notification-retention'

describe('admin notification read visibility', () => {
  const now = new Date('2026-06-11T12:00:00.000Z')

  it('lidas somem após 1 hora', () => {
    const cutoff = adminNotificationReadVisibilityCutoff(now)
    expect(cutoff.getTime()).toBe(
      now.getTime() - ADMIN_NOTIFICATION_READ_VISIBILITY_HOURS * 60 * 60 * 1000
    )
  })

  it('retenção geral permanece 30 dias', () => {
    const cutoff = notificationRetentionCutoff(now)
    expect(cutoff.getTime()).toBe(now.getTime() - 30 * 24 * 60 * 60 * 1000)
  })
})
