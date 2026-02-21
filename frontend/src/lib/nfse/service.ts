/**
 * Camada de serviço para emissão e gestão de NFSe.
 * Orquestra a integração com Focus NFe e o banco de dados.
 */

import { emitirNfse, consultarNfse, cancelarNfse, downloadNfseXml, generateNfseRef } from './client'
import { buildNfsePayload } from './builder'
import { NfseRecord, NfseStatus } from './types'
import { prisma } from '@/lib/prisma'

const NFSE_ENABLED = process.env.NFSE_ENABLED === 'true'

interface EmitirNfseParams {
  enrollmentId: string
  studentName: string
  cpf?: string
  cnpj?: string
  email?: string
  amount: number
  year: number
  month: number
  extraDescription?: string
  /** Para faturamento EMPRESA: dados para descrição da NF */
  alunoNome?: string
  frequenciaSemanal?: number | null
  curso?: string | null
  customDescricaoEmpresa?: string | null
}

// Emitir NFSe para um aluno
export async function emitirNfseParaAluno(params: EmitirNfseParams): Promise<NfseRecord> {
  if (!NFSE_ENABLED) {
    throw new Error('Emissão de NFSe está desabilitada. Configure NFSE_ENABLED=true.')
  }

  const {
    enrollmentId,
    studentName,
    cpf,
    cnpj,
    email,
    amount,
    year,
    month,
    extraDescription,
    alunoNome,
    frequenciaSemanal,
    curso,
    customDescricaoEmpresa,
  } = params
  const doc = cnpj ? cnpj.replace(/\D/g, '') : (cpf ? cpf.replace(/\D/g, '') : '')
  if (!doc || (cnpj && doc.length !== 14) || (cpf && !cnpj && doc.length !== 11)) {
    throw new Error(cnpj ? 'CNPJ inválido' : 'CPF inválido')
  }

  // Verifica se já existe nota para este aluno/mês (não cancelada)
  const existente = await prisma.nfseInvoice.findUnique({
    where: {
      enrollmentId_year_month: {
        enrollmentId,
        year,
        month,
      },
    },
  })

  // Se existir e status = 'autorizado' (não cancelada), retorna a existente
  if (existente && existente.status === 'autorizado' && !existente.cancelledAt) {
    return mapToNfseRecord(existente)
  }

  // Se existir com erro ou outro status (ex.: erro_autorizacao, processando travado), deleta para permitir reemissão
  if (existente) {
    await prisma.nfseInvoice.delete({
      where: { id: existente.id },
    })
  }

  // Gera referência única
  const focusRef = generateNfseRef(enrollmentId, year, month)

  // Monta payload
  const payload = buildNfsePayload({
    studentName,
    cpf: cpf ? cpf.replace(/\D/g, '') : undefined,
    cnpj: cnpj ? cnpj.replace(/\D/g, '') : undefined,
    email,
    amount,
    year,
    month,
    extraDescription,
    alunoNome,
    frequenciaSemanal,
    curso,
    customDescricaoEmpresa,
  })

  // Salva no banco como 'processando_autorizacao' (cpf coluna armazena CPF ou CNPJ)
  const registro = await prisma.nfseInvoice.create({
    data: {
      enrollmentId,
      studentName,
      cpf: doc,
      email: email || null,
      year,
      month,
      amount,
      focusRef,
      status: 'processando_autorizacao',
    },
  })

  try {
    // Chama Focus NFe
    const response = await emitirNfse(focusRef, payload)

    // Atualiza no banco com os dados retornados
    const atualizado = await prisma.nfseInvoice.update({
      where: { id: registro.id },
      data: {
        status: response.status,
        numero: response.numero || null,
        codigoVerificacao: response.codigo_verificacao || null,
        pdfUrl: response.url || null,
        xmlUrl: response.caminho_xml_nota_fiscal || null,
        errorMessage: response.mensagem || null,
      },
    })

    return mapToNfseRecord(atualizado)
  } catch (error) {
    // Atualiza status para erro
    const errorMessage = error instanceof Error ? error.message : String(error)
    await prisma.nfseInvoice.update({
      where: { id: registro.id },
      data: {
        status: 'erro_autorizacao',
        errorMessage,
      },
    })
    throw error
  }
}

// Consultar e atualizar status (Focus NFe é assíncrono — a nota pode demorar pra autorizar)
export async function atualizarStatusNfse(focusRef: string): Promise<NfseRecord> {
  const response = await consultarNfse(focusRef)

  const atualizado = await prisma.nfseInvoice.update({
    where: { focusRef },
    data: {
      status: response.status,
      numero: response.numero || null,
      codigoVerificacao: response.codigo_verificacao || null,
      pdfUrl: response.url || null,
      xmlUrl: response.caminho_xml_nota_fiscal || null,
      errorMessage: response.mensagem || null,
    },
  })

  return mapToNfseRecord(atualizado)
}

// Cancelar NFSe
export async function cancelarNfseDoAluno(focusRef: string, justificativa: string): Promise<NfseRecord> {
  if (!justificativa || justificativa.length < 15) {
    throw new Error('Justificativa deve ter no mínimo 15 caracteres (exigência da prefeitura).')
  }

  // Verifica se a nota existe e está autorizada
  const existente = await prisma.nfseInvoice.findUnique({
    where: { focusRef },
  })

  if (!existente) {
    throw new Error(`NFSe não encontrada com referência: ${focusRef}`)
  }

  if (existente.status !== 'autorizado' || existente.cancelledAt) {
    throw new Error(`NFSe não pode ser cancelada. Status: ${existente.status}`)
  }

  const response = await cancelarNfse(focusRef, justificativa)

  const atualizado = await prisma.nfseInvoice.update({
    where: { focusRef },
    data: {
      status: 'cancelado',
      cancelledAt: new Date(),
      cancelReason: justificativa,
    },
  })

  return mapToNfseRecord(atualizado)
}

// Listar notas de um mês (para relatório do contador)
export async function listarNfseDoMes(year: number, month: number): Promise<NfseRecord[]> {
  const notas = await prisma.nfseInvoice.findMany({
    where: {
      year,
      month,
      status: 'autorizado',
      cancelledAt: null,
    },
    orderBy: {
      criadoEm: 'asc',
    },
  })

  return notas.map(mapToNfseRecord)
}

// Exportar XMLs do mês (para contador) — retorna array com todos os XMLs
export async function exportarXmlsDoMes(
  year: number,
  month: number
): Promise<{ xmls: Array<{ filename: string; content: string }> }> {
  const notas = await listarNfseDoMes(year, month)
  const xmls: Array<{ filename: string; content: string }> = []

  for (const nota of notas) {
    try {
      const xml = await downloadNfseXml(nota.focusRef)
      const filename = `NFSe_${nota.numero || nota.focusRef}_${nota.studentName.replace(/\s+/g, '_')}.xml`
      xmls.push({
        filename,
        content: xml,
      })
    } catch (error) {
      console.error(`Erro ao baixar XML da nota ${nota.numero || nota.focusRef}:`, error)
    }
  }

  return { xmls }
}

// Helper: mapeia Prisma model para NfseRecord
function mapToNfseRecord(prismaRecord: {
  id: string
  enrollmentId: string
  studentName: string
  cpf: string
  email: string | null
  year: number
  month: number
  amount: any // Decimal do Prisma
  focusRef: string
  status: string
  numero: string | null
  codigoVerificacao: string | null
  pdfUrl: string | null
  xmlUrl: string | null
  errorMessage: string | null
  cancelledAt: Date | null
  cancelReason: string | null
  criadoEm: Date
  atualizadoEm: Date
}): NfseRecord {
  return {
    id: prismaRecord.id,
    enrollmentId: prismaRecord.enrollmentId,
    studentName: prismaRecord.studentName,
    cpf: prismaRecord.cpf,
    year: prismaRecord.year,
    month: prismaRecord.month,
    amount: Number(prismaRecord.amount),
    focusRef: prismaRecord.focusRef,
    status: prismaRecord.status as NfseStatus,
    numero: prismaRecord.numero || undefined,
    codigoVerificacao: prismaRecord.codigoVerificacao || undefined,
    pdfUrl: prismaRecord.pdfUrl || undefined,
    xmlUrl: prismaRecord.xmlUrl || undefined,
    errorMessage: prismaRecord.errorMessage || undefined,
    createdAt: prismaRecord.criadoEm.toISOString(),
    updatedAt: prismaRecord.atualizadoEm.toISOString(),
    cancelledAt: prismaRecord.cancelledAt?.toISOString(),
    cancelReason: prismaRecord.cancelReason || undefined,
  }
}
