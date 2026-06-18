/**
 * GET /api/admin/enrollments/missing-required
 * Matrículas ativas com pelo menos um campo obrigatório em falta (regras do formulário admin).
 */

import { NextRequest, NextResponse } from 'next/server'
import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/auth'
import {
  getMissingRequiredEnrollmentFields,
  type EnrollmentForRequiredCheck,
} from '@/lib/enrollment-required-fields'

const enrollmentMissingInclude = {
  paymentInfo: {
    select: { valorMensal: true, dueDay: true, metodo: true },
  },
} satisfies Prisma.EnrollmentInclude

type EnrollmentRow = Prisma.EnrollmentGetPayload<{ include: typeof enrollmentMissingInclude }>

/** Payload para abrir o modal de edição (espelha campos usados em handleEdit). */
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
  const pi = e.paymentInfo
  return {
    nome: e.nome,
    email: e.email,
    whatsapp: e.whatsapp,
    status: e.status,
    nivel: e.nivel,
    objetivo: e.objetivo,
    disponibilidade: e.disponibilidade,
    dataNascimento: e.dataNascimento,
    dataInicio: e.dataInicio,
    cpf: e.cpf,
    nomeResponsavel: e.nomeResponsavel,
    emailResponsavel: e.emailResponsavel,
    cpfResponsavel: e.cpfResponsavel,
    curso: e.curso,
    frequenciaSemanal: e.frequenciaSemanal,
    tempoAulaMinutos: e.tempoAulaMinutos,
    tipoAula: e.tipoAula,
    nomeGrupo: e.nomeGrupo,
    moraNoExterior: e.moraNoExterior,
    enderecoExterior: e.enderecoExterior,
    cep: e.cep,
    rua: e.rua,
    bairro: e.bairro,
    cidade: e.cidade,
    estado: e.estado,
    numero: e.numero,
    complemento: e.complemento,
    bolsista: e.bolsista,
    valorMensalidade: e.valorMensalidade,
    metodoPagamento: e.metodoPagamento,
    diaPagamento: e.diaPagamento,
    paymentInfoValorMensal: pi?.valorMensal ?? null,
    paymentInfoMetodo: pi?.metodo != null ? String(pi.metodo) : null,
    paymentInfoDueDay: pi?.dueDay ?? null,
    melhoresHorarios: e.melhoresHorarios,
    melhoresDiasSemana: e.melhoresDiasSemana,
    nomeVendedor: e.nomeVendedor,
    nomeEmpresaOuIndicador: e.nomeEmpresaOuIndicador,
    escolaMatricula: e.escolaMatricula,
    escolaMatriculaOutro: e.escolaMatriculaOutro,
    cancelamentoAntecedenciaHoras: e.cancelamentoAntecedenciaHoras,
    observacoes: e.observacoes,
    faturamentoTipo: e.faturamentoTipo,
    faturamentoRazaoSocial: e.faturamentoRazaoSocial,
    faturamentoCnpj: e.faturamentoCnpj,
    faturamentoEmail: e.faturamentoEmail,
    faturamentoEndereco: e.faturamentoEndereco,
    faturamentoDescricaoNfse: e.faturamentoDescricaoNfse,
    activationDate: e.activationDate,
    inactiveReason: e.inactiveReason != null ? String(e.inactiveReason) : null,
    inactiveReasonOther: e.inactiveReasonOther,
  }
}

/** Objeto compatível com `handleEdit` na página de alunos (sem agenda/professor da semana). */
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
      where: { status: 'ACTIVE' },
      include: enrollmentMissingInclude,
      orderBy: { nome: 'asc' },
      take: 5000,
    })

    const items: {
      enrollmentId: string
      nome: string
      escolaLabel: string
      missing: string[]
      student: StudentEditPayload
    }[] = []

    for (const e of enrollments) {
      const missing = getMissingRequiredEnrollmentFields(enrollmentToCheckRow(e))
      if (missing.length === 0) continue
      items.push({
        enrollmentId: e.id,
        nome: e.nome,
        escolaLabel: escolaLabel(e.escolaMatricula, e.escolaMatriculaOutro),
        missing,
        student: mapToStudentForEdit(e),
      })
    }

    return NextResponse.json({
      ok: true,
      data: {
        count: items.length,
        items,
      },
    })
  } catch (error) {
    console.error('[api/admin/enrollments/missing-required]', error)
    return NextResponse.json(
      { ok: false, message: 'Erro ao listar matrículas incompletas' },
      { status: 500 }
    )
  }
}
