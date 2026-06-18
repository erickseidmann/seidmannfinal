/**
 * Regras de pagamento para agendamento de aulas.
 * Aluno sem dados completos de pagamento não pode ter aulas agendadas.
 */

import { prisma } from '@/lib/prisma'
import { LESSON_STATUSES_SCHEDULED } from '@/lib/lesson-status'
import {
  enrollmentHasCompletePaymentInfo,
  type EnrollmentForRequiredCheck,
} from '@/lib/enrollment-required-fields'

export const SCHEDULING_BLOCKED_MISSING_PAYMENT_MESSAGE =
  'Não é possível agendar aulas: o aluno não possui todos os dados de pagamento (valor da mensalidade, método de pagamento e dia de pagamento). Preencha em Pagamento e comercial.'

type EnrollmentPaymentRow = {
  bolsista: boolean | null
  valorMensalidade: unknown
  metodoPagamento: string | null
  diaPagamento: number | null
  paymentInfo?: {
    valorMensal: unknown
    metodo: string | null
    dueDay: number | null
  } | null
}

export function enrollmentRowToPaymentCheck(row: EnrollmentPaymentRow): EnrollmentForRequiredCheck {
  const pi = row.paymentInfo
  return {
    nome: '',
    email: '',
    whatsapp: '',
    status: 'ACTIVE',
    nivel: null,
    objetivo: null,
    disponibilidade: null,
    dataNascimento: null,
    dataInicio: null,
    cpf: null,
    nomeResponsavel: null,
    emailResponsavel: null,
    cpfResponsavel: null,
    curso: null,
    frequenciaSemanal: null,
    tempoAulaMinutos: null,
    tipoAula: null,
    nomeGrupo: null,
    moraNoExterior: false,
    enderecoExterior: null,
    cep: null,
    rua: null,
    bairro: null,
    cidade: null,
    estado: null,
    numero: null,
    complemento: null,
    bolsista: row.bolsista,
    valorMensalidade: row.valorMensalidade,
    metodoPagamento: row.metodoPagamento,
    diaPagamento: row.diaPagamento,
    paymentInfoValorMensal: pi?.valorMensal ?? null,
    paymentInfoMetodo: pi?.metodo != null ? String(pi.metodo) : null,
    paymentInfoDueDay: pi?.dueDay ?? null,
    melhoresHorarios: null,
    melhoresDiasSemana: null,
    nomeVendedor: null,
    nomeEmpresaOuIndicador: null,
    escolaMatricula: null,
    escolaMatriculaOutro: null,
    cancelamentoAntecedenciaHoras: null,
    observacoes: null,
    faturamentoTipo: null,
    faturamentoRazaoSocial: null,
    faturamentoCnpj: null,
    faturamentoEmail: null,
    faturamentoEndereco: null,
    faturamentoDescricaoNfse: null,
    activationDate: null,
    inactiveReason: null,
    inactiveReasonOther: null,
  }
}

export function enrollmentPaymentRowHasCompleteInfo(row: EnrollmentPaymentRow): boolean {
  return enrollmentHasCompletePaymentInfo(enrollmentRowToPaymentCheck(row))
}

/** Cancela aulas futuras agendadas do aluno (a partir de hoje). */
export async function cancelFutureScheduledLessonsForEnrollment(enrollmentId: string): Promise<number> {
  const hoje = new Date()
  hoje.setHours(0, 0, 0, 0)
  const result = await prisma.lesson.updateMany({
    where: {
      enrollmentId,
      startAt: { gte: hoje },
      status: { in: [...LESSON_STATUSES_SCHEDULED] },
    },
    data: { status: 'CANCELLED' },
  })
  return result.count
}

/** Cancela aulas futuras se o aluno não tiver dados de pagamento completos. */
export async function cancelLessonsIfMissingPaymentInfo(enrollmentId: string): Promise<number> {
  const enrollment = await prisma.enrollment.findUnique({
    where: { id: enrollmentId },
    select: {
      bolsista: true,
      valorMensalidade: true,
      metodoPagamento: true,
      diaPagamento: true,
      paymentInfo: { select: { valorMensal: true, metodo: true, dueDay: true } },
    },
  })
  if (!enrollment || enrollmentPaymentRowHasCompleteInfo(enrollment)) return 0
  return cancelFutureScheduledLessonsForEnrollment(enrollmentId)
}
