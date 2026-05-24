/**
 * Janela de envio da nota fiscal/recibo do professor.
 *
 * Regra (espelha a Cláusula 4 do contrato):
 *  - Pagamento é até o dia 25 de cada mês.
 *  - Se o dia 25 for sábado, domingo ou feriado bancário, o pagamento é antecipado para o
 *    PRIMEIRO dia útil ANTERIOR — para o professor receber até dia 25.
 *    (na prática, recebíveis raramente são "atrasados" para depois de 25; aqui adotamos
 *     antecipação para preservar a regra "recebe até o dia 25". Ajuste se a política
 *     real for "primeiro dia útil seguinte".)
 *  - Prazo nominal: até **D-1** (1 dia antes) do dia de pagamento.
 *  - Tolerância de envio da NF: até **2 dias corridos** após esse prazo nominal (não altera valor a pagar).
 *  - O mês de competência precisa ser o **mês civil corrente** ou o **mês civil anterior**.
 *
 * Esta função é pura (sem I/O), serve para o cliente e o servidor.
 */

/**
 * Dia base para pagamento de professores: dia 25 de cada mês.
 * Também é o valor padrão de `Teacher.paymentDueDay` em cadastros novos
 * (vide rotas de criação de professor).
 */
export const DIA_PAGAMENTO_BASE = 25
export const DEFAULT_TEACHER_PAYMENT_DUE_DAY = DIA_PAGAMENTO_BASE

/** Dias extras para anexar NF/recibo após o prazo nominal (D-1 do pagamento). */
export const DIAS_TOLERANCIA_NF_APOS_PRAZO = 2

/** Compara dois dias zerando a hora (timezone local). */
function startOfDay(d: Date): Date {
  const x = new Date(d)
  x.setHours(0, 0, 0, 0)
  return x
}

/** Formata para YYYY-MM-DD (timezone local). Compatível com `Holiday.dateKey`. */
export function toDateKey(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function isWeekend(d: Date): boolean {
  const dow = d.getDay()
  return dow === 0 || dow === 6
}

function isBusinessDay(d: Date, holidaySet?: Set<string>): boolean {
  if (isWeekend(d)) return false
  if (holidaySet && holidaySet.has(toDateKey(d))) return false
  return true
}

/**
 * Retorna o dia de pagamento (Date local, 00:00) para o mês informado.
 * Se dia 25 cair em fim de semana ou feriado, retorna o dia útil anterior mais próximo.
 */
export function getDataPagamento(year: number, month: number, holidaySet?: Set<string>): Date {
  // month: 1..12
  const candidate = new Date(year, month - 1, DIA_PAGAMENTO_BASE, 0, 0, 0, 0)
  while (!isBusinessDay(candidate, holidaySet)) {
    candidate.setDate(candidate.getDate() - 1)
  }
  return candidate
}

/**
 * Prazo nominal (inclusive): D-1 do dia de pagamento.
 */
export function getDataLimiteNominalNf(year: number, month: number, holidaySet?: Set<string>): Date {
  const pagamento = getDataPagamento(year, month, holidaySet)
  const limite = new Date(pagamento)
  limite.setDate(limite.getDate() - 1)
  limite.setHours(23, 59, 59, 999)
  return limite
}

/**
 * Data limite (inclusive) para envio da nota fiscal/recibo no sistema.
 * Prazo nominal + {@link DIAS_TOLERANCIA_NF_APOS_PRAZO} dias (não altera cálculo do valor).
 */
export function getDataLimiteNf(year: number, month: number, holidaySet?: Set<string>): Date {
  const limite = getDataLimiteNominalNf(year, month, holidaySet)
  limite.setDate(limite.getDate() + DIAS_TOLERANCIA_NF_APOS_PRAZO)
  return limite
}

export interface ValidarJanelaNfArgs {
  /** Ano de competência informado pelo professor. */
  year: number
  /** Mês de competência (1..12). */
  month: number
  /** Momento da operação (default: agora). */
  now?: Date
  /** Conjunto de feriados (chaves YYYY-MM-DD). Opcional. */
  holidaySet?: Set<string>
}

export type ValidarJanelaNfResult =
  | { ok: true; dataPagamento: Date; dataLimite: Date }
  | {
      ok: false
      motivo: 'mes_futuro' | 'mes_antigo' | 'apos_prazo'
      mensagem: string
      dataPagamento: Date
      dataLimite: Date
    }

/**
 * Valida se o professor pode anexar/confirmar a nota fiscal para (year, month) agora.
 *
 * Regras combinadas:
 *  - mês de competência deve ser o mês civil corrente ou o anterior;
 *  - operação deve ocorrer até o prazo nominal + tolerância (inclusive).
 */
export function validarJanelaEnvioNf(args: ValidarJanelaNfArgs): ValidarJanelaNfResult {
  const now = args.now ?? new Date()
  const today = startOfDay(now)
  const dataPagamento = getDataPagamento(args.year, args.month, args.holidaySet)
  const dataLimite = getDataLimiteNf(args.year, args.month, args.holidaySet)

  const currentYear = today.getFullYear()
  const currentMonth = today.getMonth() + 1
  const refIndex = args.year * 12 + args.month
  const currentIndex = currentYear * 12 + currentMonth
  const diff = currentIndex - refIndex // 0 = mês atual; 1 = mês anterior; -1 = mês futuro

  if (diff < 0) {
    return {
      ok: false,
      motivo: 'mes_futuro',
      mensagem:
        'Você só pode anexar a nota fiscal do mês vigente ou do mês anterior. Selecione um mês válido para enviar.',
      dataPagamento,
      dataLimite,
    }
  }
  if (diff > 1) {
    return {
      ok: false,
      motivo: 'mes_antigo',
      mensagem:
        'Esse período é muito antigo. O envio de nota fiscal só é permitido para o mês vigente ou para o mês anterior.',
      dataPagamento,
      dataLimite,
    }
  }

  // Janela temporal: prazo nominal (D-1) + tolerância de DIAS_TOLERANCIA_NF_APOS_PRAZO dias.
  if (now.getTime() > dataLimite.getTime()) {
    return {
      ok: false,
      motivo: 'apos_prazo',
      mensagem: `O prazo para envio da nota fiscal deste período encerrou em ${dataLimite.toLocaleDateString(
        'pt-BR'
      )} (inclui tolerância de ${DIAS_TOLERANCIA_NF_APOS_PRAZO} dias após o prazo nominal, 1 dia antes do pagamento em ${dataPagamento.toLocaleDateString(
        'pt-BR'
      )}).`,
      dataPagamento,
      dataLimite,
    }
  }

  return { ok: true, dataPagamento, dataLimite }
}
