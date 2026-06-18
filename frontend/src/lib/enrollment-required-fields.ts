/**
 * Regras alinhadas ao formulário admin de aluno (campos obrigatórios).
 * Usado no cubo «Alunos com infos obrigatórias faltantes» (somente alunos ativos) e na API correspondente.
 */

import { isValidEmail, isValidWhatsApp } from '@/lib/validators'

const CURSOS_VALIDOS = new Set(['INGLES', 'ESPANHOL', 'INGLES_E_ESPANHOL'])
const TIPOS_AULA = new Set(['PARTICULAR', 'GRUPO'])
const ESCOLAS = new Set(['SEIDMANN', 'YOUBECOME', 'HIGHWAY', 'OUTRO'])
const TEMPOS_AULA = new Set([30, 40, 60, 120])

export type EnrollmentForRequiredCheck = {
  nome: string
  email: string
  whatsapp: string
  status: string
  nivel: string | null | undefined
  objetivo: string | null | undefined
  disponibilidade: string | null | undefined
  dataNascimento: Date | string | null | undefined
  dataInicio: Date | string | null | undefined
  cpf: string | null | undefined
  nomeResponsavel: string | null | undefined
  emailResponsavel: string | null | undefined
  cpfResponsavel: string | null | undefined
  curso: string | null | undefined
  frequenciaSemanal: number | null | undefined
  tempoAulaMinutos: number | null | undefined
  tipoAula: string | null | undefined
  nomeGrupo: string | null | undefined
  moraNoExterior: boolean | null | undefined
  enderecoExterior: string | null | undefined
  cep: string | null | undefined
  rua: string | null | undefined
  bairro: string | null | undefined
  cidade: string | null | undefined
  estado: string | null | undefined
  numero: string | null | undefined
  complemento: string | null | undefined
  bolsista: boolean | null | undefined
  valorMensalidade: unknown
  metodoPagamento: string | null | undefined
  diaPagamento: number | null | undefined
  paymentInfoValorMensal: unknown
  paymentInfoMetodo: string | null | undefined
  paymentInfoDueDay: number | null | undefined
  melhoresHorarios: string | null | undefined
  melhoresDiasSemana: string | null | undefined
  nomeVendedor: string | null | undefined
  nomeEmpresaOuIndicador: string | null | undefined
  escolaMatricula: string | null | undefined
  escolaMatriculaOutro: string | null | undefined
  cancelamentoAntecedenciaHoras: number | null | undefined
  observacoes: string | null | undefined
  faturamentoTipo: string | null | undefined
  faturamentoRazaoSocial: string | null | undefined
  faturamentoCnpj: string | null | undefined
  faturamentoEmail: string | null | undefined
  faturamentoEndereco: string | null | undefined
  faturamentoDescricaoNfse: string | null | undefined
  activationDate: Date | string | null | undefined
  inactiveReason: string | null | undefined
  inactiveReasonOther: string | null | undefined
}

function onlyDigits(s: string | null | undefined): string {
  return String(s ?? '').replace(/\D/g, '')
}

function isMenorDeIdade(dataNascimento: Date | string | null | undefined): boolean {
  if (!dataNascimento) return false
  const nasc = new Date(dataNascimento)
  if (Number.isNaN(nasc.getTime())) return false
  const hoje = new Date()
  let idade = hoje.getFullYear() - nasc.getFullYear()
  const m = hoje.getMonth() - nasc.getMonth()
  if (m < 0 || (m === 0 && hoje.getDate() < nasc.getDate())) idade--
  return idade < 18
}

function parseValorMensal(row: EnrollmentForRequiredCheck): number | null {
  const tryNum = (v: unknown): number | null => {
    if (v == null || v === '') return null
    const n = Number(v)
    return Number.isFinite(n) ? n : null
  }
  const a = tryNum(row.valorMensalidade)
  if (a != null) return a
  return tryNum(row.paymentInfoValorMensal)
}

function metodoEfetivo(row: EnrollmentForRequiredCheck): string {
  const m = (row.metodoPagamento ?? '').trim() || String(row.paymentInfoMetodo ?? '').trim()
  return m
}

function diaPagamentoEfetivo(row: EnrollmentForRequiredCheck): number | null {
  const d = row.diaPagamento ?? row.paymentInfoDueDay
  return d != null && Number.isFinite(Number(d)) ? Number(d) : null
}

/** Lista legível dos campos obrigatórios em falta (pt-BR). */
export function getMissingRequiredEnrollmentFields(row: EnrollmentForRequiredCheck): string[] {
  const missing: string[] = []

  if (!(row.nome ?? '').trim()) missing.push('Nome completo')

  const email = (row.email ?? '').trim().toLowerCase()
  if (!email || !isValidEmail(email)) missing.push('E-mail válido')

  const wa = (row.whatsapp ?? '').trim()
  if (!wa || !isValidWhatsApp(wa)) missing.push('WhatsApp válido')

  if (!(row.nivel ?? '').trim()) missing.push('Nível')

  if (!(row.objetivo ?? '').trim()) missing.push('Objetivo')

  if (!(row.disponibilidade ?? '').trim()) missing.push('Disponibilidade')

  if (!row.dataNascimento) missing.push('Data de nascimento')
  if (!row.dataInicio) missing.push('Data de início')

  const cpfDig = onlyDigits(row.cpf)
  if (cpfDig.length !== 11) missing.push('CPF (11 dígitos)')

  const em = (row.escolaMatricula ?? '').trim()
  if (!ESCOLAS.has(em)) missing.push('Escola de matrícula')
  if (em === 'OUTRO' && !(row.escolaMatriculaOutro ?? '').trim()) missing.push('Nome da escola (outro)')

  if (row.cancelamentoAntecedenciaHoras == null || Number.isNaN(Number(row.cancelamentoAntecedenciaHoras)))
    missing.push('Antecedência para cancelamento (horas)')

  const minor = isMenorDeIdade(row.dataNascimento)
  if (minor) {
    if (!(row.nomeResponsavel ?? '').trim()) missing.push('Nome do responsável')
    if (onlyDigits(row.cpfResponsavel).length !== 11) missing.push('CPF do responsável')
    const er = (row.emailResponsavel ?? '').trim().toLowerCase()
    if (!er || !isValidEmail(er)) missing.push('E-mail do responsável')
  }

  const fat = (row.faturamentoTipo ?? 'ALUNO').toUpperCase() === 'EMPRESA'
  if (fat) {
    if (!(row.faturamentoRazaoSocial ?? '').trim()) missing.push('Razão social (empresa)')
    if (onlyDigits(row.faturamentoCnpj).length !== 14) missing.push('CNPJ (14 dígitos)')
    const fe = (row.faturamentoEmail ?? '').trim().toLowerCase()
    if (!fe || !isValidEmail(fe)) missing.push('E-mail para NF (empresa)')
    if (!(row.faturamentoEndereco ?? '').trim()) missing.push('Endereço fiscal (empresa)')
    if (!(row.faturamentoDescricaoNfse ?? '').trim()) missing.push('Descrição da NF (empresa)')
  }

  const curso = (row.curso ?? '').trim()
  if (!CURSOS_VALIDOS.has(curso)) missing.push('Curso')

  const freq = row.frequenciaSemanal
  if (freq == null || freq < 1 || freq > 7) missing.push('Frequência semanal')

  const tempo = row.tempoAulaMinutos
  if (tempo == null || !TEMPOS_AULA.has(Number(tempo))) missing.push('Tempo de aula')

  const tipo = (row.tipoAula ?? '').trim()
  if (!TIPOS_AULA.has(tipo)) missing.push('Tipo de aula')
  if (tipo === 'GRUPO' && !(row.nomeGrupo ?? '').trim()) missing.push('Nome do grupo')

  if (row.moraNoExterior) {
    if (!(row.enderecoExterior ?? '').trim()) missing.push('Endereço no exterior')
  } else {
    if (onlyDigits(row.cep).length !== 8) missing.push('CEP')
    if (!(row.rua ?? '').trim()) missing.push('Rua')
    if (!(row.bairro ?? '').trim()) missing.push('Bairro')
    if (!(row.cidade ?? '').trim()) missing.push('Cidade')
    if ((row.estado ?? '').trim().length !== 2) missing.push('Estado (UF)')
    if (!(row.numero ?? '').trim()) missing.push('Número')
    if (!(row.complemento ?? '').trim()) missing.push('Complemento')
  }

  const bolsista = Boolean(row.bolsista)
  if (!bolsista) {
    const valor = parseValorMensal(row)
    if (valor == null || valor <= 0) missing.push('Valor mensalidade')

    const metodo = metodoEfetivo(row)
    if (!metodo) missing.push('Método de pagamento')

    const dia = diaPagamentoEfetivo(row)
    if (dia == null || dia < 1 || dia > 31) missing.push('Dia de pagamento')
  }

  if (!(row.melhoresHorarios ?? '').trim()) missing.push('Melhores horários')
  if (!(row.melhoresDiasSemana ?? '').trim()) missing.push('Melhores dias da semana')

  const st = (row.status ?? '').trim()
  if (st === 'PAUSED' && !row.activationDate) missing.push('Data de ativação (pausado)')

  if (st === 'INACTIVE') {
    if (!(row.inactiveReason ?? '').trim()) missing.push('Motivo da inativação')
    if ((row.inactiveReason ?? '').trim() === 'OUTRO' && (row.inactiveReasonOther ?? '').trim().length < 3) {
      missing.push('Detalhe do motivo (outro, mín. 3 caracteres)')
    }
  }

  return missing
}

/** Campos de pagamento em falta (valor, método e dia — bolsista isento de todos). */
export function getMissingPaymentEnrollmentFields(row: EnrollmentForRequiredCheck): string[] {
  const missing: string[] = []
  if (Boolean(row.bolsista)) return missing

  const valor = parseValorMensal(row)
  if (valor == null || valor <= 0) missing.push('Valor mensalidade')

  const metodo = metodoEfetivo(row)
  if (!metodo) missing.push('Método de pagamento')

  const dia = diaPagamentoEfetivo(row)
  if (dia == null || dia < 1 || dia > 31) missing.push('Dia de pagamento')
  return missing
}

export function enrollmentHasCompletePaymentInfo(row: EnrollmentForRequiredCheck): boolean {
  return getMissingPaymentEnrollmentFields(row).length === 0
}
