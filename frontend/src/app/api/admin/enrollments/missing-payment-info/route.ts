/**
 * GET /api/admin/enrollments/missing-payment-info
 * Matrículas sem dados completos de pagamento (valor, método e dia).
 */

import { NextRequest, NextResponse } from 'next/server'
import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/auth'
import { LESSON_STATUSES_SCHEDULED } from '@/lib/lesson-status'
import {
  getMissingPaymentEnrollmentFields,
  type EnrollmentForRequiredCheck,
} from '@/lib/enrollment-required-fields'
import {
  enrollmentRowToPaymentCheck,
} from '@/lib/enrollment-payment-info'

const enrollmentPaymentInclude = {
  paymentInfo: {
    select: { valorMensal: true, dueDay: true, metodo: true },
  },
} satisfies Prisma.EnrollmentInclude

type EnrollmentRow = Prisma.EnrollmentGetPayload<{ include: typeof enrollmentPaymentInclude }>

type StudentEditPayload = {
  id: string
  nome: string
  email: string
  whatsapp: string
  idioma: string | null
  nivel: string | null
  objetivo: string | null
  disponibilidade: string | null
  status: string
  trackingCode: string | null
  criadoEm: string
  dataInicio: string | null
  dataNascimento: string | null
  observacoes: string | null
  nomeResponsavel: string | null
  emailResponsavel: string | null
  cpf: string | null
  cpfResponsavel: string | null
  curso: string
  frequenciaSemanal: number | null
  tempoAulaMinutos: number | null
  tipoAula: string
  nomeGrupo: string | null
  teacherNameForWeek: null
  agenda: null
  cep: string | null
  rua: string | null
  bairro: string | null
  cidade: string | null
  estado: string | null
  numero: string | null
  complemento: string | null
  moraNoExterior: boolean
  enderecoExterior: string | null
  valorMensalidade: string | null
  metodoPagamento: string | null
  diaPagamento: number | null
  melhoresHorarios: string | null
  melhoresDiasSemana: string | null
  nomeVendedor: string | null
  nomeEmpresaOuIndicador: string | null
  escolaMatricula: string | null
  escolaMatriculaOutro: string | null
  cancelamentoAntecedenciaHoras: number | null
  activationDate: string | null
  faturamentoTipo: string
  faturamentoRazaoSocial: string | null
  faturamentoCnpj: string | null
  faturamentoEmail: string | null
  faturamentoEndereco: string | null
  faturamentoDescricaoNfse: string | null
  bolsista: boolean
  user: null
  inactiveReason: string | null
  inactiveReasonOther: string | null
}

function escolaLabel(escola: string | null, outro: string | null): string {
  switch (escola) {
    case 'SEIDMANN':
      return 'Seidmann'
    case 'YOUBECOME':
      return 'Youbecome'
    case 'HIGHWAY':
      return 'Highway'
    case 'OUTRO':
      return outro?.trim() || 'Outro'
    default:
      return '—'
  }
}

function enrollmentToCheckRow(e: EnrollmentRow): EnrollmentForRequiredCheck {
  return enrollmentRowToPaymentCheck(e) as EnrollmentForRequiredCheck
}

function mapToStudentForEdit(e: EnrollmentRow): StudentEditPayload {
  const pi = e.paymentInfo
  const valorMensalidade =
    e.valorMensalidade != null
      ? String(e.valorMensalidade)
      : pi?.valorMensal != null
        ? String(pi.valorMensal)
        : null
  return {
    id: e.id,
    nome: e.nome,
    email: e.email,
    whatsapp: e.whatsapp,
    idioma: e.idioma,
    nivel: e.nivel,
    objetivo: e.objetivo,
    disponibilidade: e.disponibilidade,
    status: e.status,
    trackingCode: e.trackingCode,
    criadoEm: e.criadoEm.toISOString(),
    dataInicio: e.dataInicio?.toISOString() ?? null,
    dataNascimento: e.dataNascimento?.toISOString() ?? null,
    observacoes: e.observacoes,
    nomeResponsavel: e.nomeResponsavel,
    emailResponsavel: e.emailResponsavel,
    cpf: e.cpf,
    cpfResponsavel: e.cpfResponsavel,
    curso: e.curso?.trim() || 'INGLES',
    frequenciaSemanal: e.frequenciaSemanal,
    tempoAulaMinutos: e.tempoAulaMinutos,
    tipoAula: e.tipoAula?.trim() || 'PARTICULAR',
    nomeGrupo: e.nomeGrupo,
    teacherNameForWeek: null,
    agenda: null,
    cep: e.cep,
    rua: e.rua,
    bairro: e.bairro,
    cidade: e.cidade,
    estado: e.estado,
    numero: e.numero,
    complemento: e.complemento,
    moraNoExterior: e.moraNoExterior,
    enderecoExterior: e.enderecoExterior,
    valorMensalidade,
    metodoPagamento: e.metodoPagamento ?? (pi?.metodo != null ? String(pi.metodo) : null),
    diaPagamento: e.diaPagamento ?? pi?.dueDay ?? null,
    melhoresHorarios: e.melhoresHorarios,
    melhoresDiasSemana: e.melhoresDiasSemana,
    nomeVendedor: e.nomeVendedor,
    nomeEmpresaOuIndicador: e.nomeEmpresaOuIndicador,
    escolaMatricula: e.escolaMatricula,
    escolaMatriculaOutro: e.escolaMatriculaOutro,
    cancelamentoAntecedenciaHoras: e.cancelamentoAntecedenciaHoras,
    activationDate: e.activationDate?.toISOString() ?? null,
    faturamentoTipo: e.faturamentoTipo ?? 'ALUNO',
    faturamentoRazaoSocial: e.faturamentoRazaoSocial,
    faturamentoCnpj: e.faturamentoCnpj,
    faturamentoEmail: e.faturamentoEmail,
    faturamentoEndereco: e.faturamentoEndereco,
    faturamentoDescricaoNfse: e.faturamentoDescricaoNfse,
    bolsista: e.bolsista,
    user: null,
    inactiveReason: e.inactiveReason != null ? String(e.inactiveReason) : null,
    inactiveReasonOther: e.inactiveReasonOther,
  }
}

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAdmin(request)
    if (!auth.authorized) {
      return NextResponse.json(
        { ok: false, message: auth.message || 'Não autorizado' },
        { status: auth.message?.includes('Não autenticado') ? 401 : 403 }
      )
    }

    const enrollments = await prisma.enrollment.findMany({
      where: { status: { notIn: ['INACTIVE', 'COMPLETED'] } },
      include: enrollmentPaymentInclude,
      orderBy: { nome: 'asc' },
      take: 5000,
    })

    const items: {
      enrollmentId: string
      nome: string
      escolaLabel: string
      missing: string[]
      cancelledLessons: number
      student: StudentEditPayload
    }[] = []

    const enrollmentIdsToCancel: string[] = []

    for (const e of enrollments) {
      const missing = getMissingPaymentEnrollmentFields(enrollmentToCheckRow(e))
      if (missing.length === 0) continue

      enrollmentIdsToCancel.push(e.id)

      items.push({
        enrollmentId: e.id,
        nome: e.nome,
        escolaLabel: escolaLabel(e.escolaMatricula, e.escolaMatriculaOutro),
        missing,
        cancelledLessons: 0,
        student: mapToStudentForEdit(e),
      })
    }

    let totalCancelledLessons = 0
    if (enrollmentIdsToCancel.length > 0) {
      const hoje = new Date()
      hoje.setHours(0, 0, 0, 0)
      const cancelResult = await prisma.lesson.updateMany({
        where: {
          enrollmentId: { in: enrollmentIdsToCancel },
          startAt: { gte: hoje },
          status: { in: [...LESSON_STATUSES_SCHEDULED] },
        },
        data: { status: 'CANCELLED' },
      })
      totalCancelledLessons = cancelResult.count
    }

    return NextResponse.json({
      ok: true,
      data: {
        count: items.length,
        totalCancelledLessons,
        items,
      },
    })
  } catch (error) {
    console.error('[api/admin/enrollments/missing-payment-info]', error)
    return NextResponse.json(
      { ok: false, message: 'Erro ao listar alunos sem dados de pagamento' },
      { status: 500 }
    )
  }
}
