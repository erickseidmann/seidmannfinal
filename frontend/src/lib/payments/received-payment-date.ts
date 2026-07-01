/**
 * Data civil (Brasil) de um recebimento para exibição, agrupamento e regras de competência.
 * Santander: a chave correta está no providerPaymentId (SANT:AAAA-MM-DD:...).
 */

import { startOfCalendarDayBrazilDateKey, ymdInTZ } from '@/lib/datetime'

export function civilDateKeyFromReceivedPayment(
  provider: string,
  providerPaymentId: string,
  dataPagamento: Date
): string {
  if (provider === 'SANTANDER' && providerPaymentId.startsWith('SANT:')) {
    const dateKey = providerPaymentId.split(':')[1]
    if (dateKey && /^\d{4}-\d{2}-\d{2}$/.test(dateKey)) return dateKey
  }
  return ymdInTZ(dataPagamento)
}

export function civilDateFromReceivedPayment(
  provider: string,
  providerPaymentId: string,
  dataPagamento: Date
): Date {
  const dateKey = civilDateKeyFromReceivedPayment(provider, providerPaymentId, dataPagamento)
  return startOfCalendarDayBrazilDateKey(dateKey) ?? dataPagamento
}

export function monthKeyFromDateKey(dateKey: string): string {
  return dateKey.slice(0, 7)
}

export function formatMonthHeadingPtBR(monthKey: string): string {
  const [y, m] = monthKey.split('-').map(Number)
  if (!y || !m) return monthKey
  const label = new Intl.DateTimeFormat('pt-BR', {
    month: 'long',
    year: 'numeric',
    timeZone: 'America/Sao_Paulo',
  }).format(new Date(Date.UTC(y, m - 1, 1, 12, 0, 0)))
  return label.charAt(0).toUpperCase() + label.slice(1)
}
