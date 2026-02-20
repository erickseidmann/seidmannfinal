/**
 * Instrumentation Next.js — inicializa o scheduler de cron no servidor.
 */

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { initScheduler } = await import('./src/lib/cron/scheduler')
    initScheduler()
  }
}
