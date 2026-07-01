import { civilDateKeyFromReceivedPayment } from '../received-payment-date'

describe('received-payment-date', () => {
  it('usa dateKey do providerPaymentId Santander', () => {
    const key = civilDateKeyFromReceivedPayment(
      'SANTANDER',
      'SANT:2026-07-01:45400:03944058119:1',
      new Date('2026-06-30T12:00:00.000Z')
    )
    expect(key).toBe('2026-07-01')
  })
})
