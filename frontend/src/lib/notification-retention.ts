/**
 * Política de retenção de alertas/notificações.
 *
 * Regra única do produto (definida em conversa com o admin):
 * alertas e notificações ficam visíveis por NOTIFICATION_RETENTION_DAYS dias
 * após sua criação. Após esse prazo, somem das listas (admin, professor e aluno).
 *
 * Os registros NÃO são apagados do banco — apenas são filtrados nas consultas,
 * para preservar histórico/auditoria. Se um dia for necessário fazer cleanup,
 * basta criar um job que apague linhas mais antigas que essa janela.
 */

export const NOTIFICATION_RETENTION_DAYS = 30

/** Data mínima de criação para uma notificação/alerta ainda aparecer nas listas. */
export function notificationRetentionCutoff(now: Date = new Date()): Date {
  const d = new Date(now)
  d.setDate(d.getDate() - NOTIFICATION_RETENTION_DAYS)
  return d
}
