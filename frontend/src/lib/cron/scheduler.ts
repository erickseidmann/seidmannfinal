/// <reference path="../../types/node-cron.d.ts" />
/**
 * Scheduler de cron jobs usando node-cron.
 * Roda apenas no runtime Node.js do Next.js (não em edge).
 * Inicializado via instrumentation.ts.
 *
 * Horários (UTC):
 * - mark-overdue: 8h UTC diariamente
 * - generate-invoices: 10h UTC (7h BRT) diariamente
 * - nfse-retry: 10h UTC diariamente
 * - payment-notifications: 12h UTC (9h BRT) diariamente
 * - nfse-status: a cada 5 minutos
 */

import * as cron from 'node-cron'
import {
  runMarkOverdue,
  runGenerateInvoices,
  runNfseRetry,
  runPaymentNotifications,
  runNfseStatus,
} from './jobs'

const log = (job: string, msg: string, data?: unknown) => {
  console.log(`[cron/${job}] ${msg}`, data ?? '')
}

export function initScheduler() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') {
    return
  }

  // Mark overdue — 8h UTC diariamente
  cron.schedule('0 8 * * *', async () => {
    try {
      log('mark-overdue', 'Iniciando')
      const result = await runMarkOverdue()
      log('mark-overdue', 'Concluído', result)
    } catch (err) {
      console.error('[cron/mark-overdue] Erro:', err)
    }
  })

  // Gerar boletos — 7h BRT (10h UTC) diariamente
  cron.schedule('0 10 * * *', async () => {
    try {
      log('generate-invoices', 'Iniciando')
      const result = await runGenerateInvoices()
      log('generate-invoices', 'Concluído', result)
    } catch (err) {
      console.error('[cron/generate-invoices] Erro:', err)
    }
  })

  // NFSe retry — 10h UTC diariamente
  cron.schedule('0 10 * * *', async () => {
    try {
      log('nfse-retry', 'Iniciando')
      const result = await runNfseRetry()
      log('nfse-retry', 'Concluído', result)
    } catch (err) {
      console.error('[cron/nfse-retry] Erro:', err)
    }
  })

  // Notificações de pagamento — 9h BRT (12h UTC) diariamente
  cron.schedule('0 12 * * *', async () => {
    try {
      log('payment-notifications', 'Iniciando')
      const result = await runPaymentNotifications()
      log('payment-notifications', 'Concluído', result)
    } catch (err) {
      console.error('[cron/payment-notifications] Erro:', err)
    }
  })

  // Atualizar status NFSe — a cada 5 minutos
  cron.schedule('*/5 * * * *', async () => {
    try {
      const result = await runNfseStatus()
      if (result.processadas > 0) {
        log('nfse-status', 'Processadas', result)
      }
    } catch (err) {
      console.error('[cron/nfse-status] Erro:', err)
    }
  })

  console.log('[cron/scheduler] Cron jobs registrados')
}
