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
 * - nfse-status: a cada 30 minutos
 * - sync-cora-extrato: a cada 5 minutos
 * - sync-santander-extrato: a cada 5 minutos
 * - close-lesson-attendances: a cada 5 minutos
 */

import * as cron from 'node-cron'
import {
  runMarkOverdue,
  runGenerateInvoices,
  runNfseRetry,
  runPaymentNotifications,
  runNfseStatus,
  runNfseScheduled,
  runSyncCoraExtrato,
  runSyncSantanderExtrato,
  runPurgeLessonAttendance,
  runCloseLessonAttendances,
} from './jobs'

const log = (job: string, msg: string, data?: unknown) => {
  console.log(`[cron/${job}] ${msg}`, data ?? '')
}

export function initScheduler() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') {
    return
  }

  // Encerrar sessões de presença expiradas ou sem heartbeat (a cada 5 min)
  cron.schedule('*/5 * * * *', async () => {
    try {
      const result = await runCloseLessonAttendances()
      if (result.closed > 0) {
        log('close-lesson-attendances', 'Encerradas', result)
      }
    } catch (err) {
      console.error('[cron/close-lesson-attendances] Erro:', err)
    }
  })

  // Presença em chamada — excluir após 60 dias (5h UTC ≈ 2h BRT)
  cron.schedule('0 5 * * *', async () => {
    try {
      log('purge-lesson-attendance', 'Iniciando')
      const result = await runPurgeLessonAttendance()
      if (result.deletedSessions > 0) {
        log('purge-lesson-attendance', 'Concluído', result)
      }
    } catch (err) {
      console.error('[cron/purge-lesson-attendance] Erro:', err)
    }
  })

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

  // Gerar boletos automaticamente desativado.
  // A geração de boletos agora é feita apenas manualmente,
  // pelo botão "Gerar boletos do mês" na tela de Cobranças.

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

  // Atualizar status NFSe — a cada 30 minutos
  cron.schedule('*/30 * * * *', async () => {
    try {
      const result = await runNfseStatus()
      if (result.processadas > 0) {
        log('nfse-status', 'Processadas', result)
      }
    } catch (err) {
      console.error('[cron/nfse-status] Erro:', err)
    }
  })

  // Extrato Cora (CREDIT) → conciliação — a cada 5 minutos
  cron.schedule('*/5 * * * *', async () => {
    try {
      const result = await runSyncCoraExtrato()
      if (result.total > 0 || result.erros > 0) {
        log('sync-cora-extrato', 'Concluído', result)
      }
    } catch (err) {
      console.error('[cron/sync-cora-extrato] Erro:', err)
    }
  })

  // Extrato Santander (CREDITO) → conciliação — a cada 5 minutos
  cron.schedule('*/5 * * * *', async () => {
    try {
      const result = await runSyncSantanderExtrato()
      if (result.total > 0 || result.erros > 0) {
        log('sync-santander-extrato', 'Concluído', result)
      }
    } catch (err) {
      console.error('[cron/sync-santander-extrato] Erro:', err)
    }
  })

  // Agendamentos de NF — a cada minuto: emitir NF e enviar e-mail no dia/hora definido
  cron.schedule('* * * * *', async () => {
    try {
      const result = await runNfseScheduled()
      if (result.processed > 0 || result.errors > 0) {
        log('nfse-scheduled', 'Executado', result)
      }
      // Em desenvolvimento, logar a cada execução quando há agendamentos (para debug)
      if (process.env.NODE_ENV === 'development' && (result.processed > 0 || result.errors > 0)) {
        console.log('[cron/nfse-scheduled]', result.processed, 'processado(s),', result.errors, 'erro(s)')
      }
    } catch (err) {
      console.error('[cron/nfse-scheduled] Erro:', err)
    }
  })

  console.log('[cron/scheduler] Cron jobs registrados')
}
