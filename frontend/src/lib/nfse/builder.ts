/**
 * Helper para construir payloads de NFSe a partir dos dados do aluno.
 */

import { NfsePayload } from './types'

// Dados fixos do Seidmann (prestador)
const PRESTADOR = {
  cnpj: '32707269000107',
  inscricao_municipal: '008226024',
  codigo_municipio: '3509502', // Campinas
}

const MESES = [
  '',
  'Janeiro',
  'Fevereiro',
  'Março',
  'Abril',
  'Maio',
  'Junho',
  'Julho',
  'Agosto',
  'Setembro',
  'Outubro',
  'Novembro',
  'Dezembro',
]

interface BuildNfseParams {
  studentName: string
  cpf: string
  email?: string
  amount: number // valor da mensalidade
  year: number
  month: number
  description?: string // override total da discriminação
  extraDescription?: string // texto adicionado ao final da discriminação padrão
}

export function buildNfsePayload(params: BuildNfseParams): NfsePayload {
  const { studentName, cpf, email, amount, year, month, description, extraDescription } = params

  const mesNome = MESES[month] || String(month)
  const base =
    description ||
    `Combo de aulas de idioma.\nPagamento referente ao mês de ${mesNome}/${year}.\nAluno ${studentName}.`
  const discriminacao = extraDescription ? `${base}\n${extraDescription}`.trim() : base

  return {
    data_emissao: new Date().toISOString().split('T')[0], // Data atual no formato YYYY-MM-DD (obrigatório pela Focus NFe)
    natureza_operacao: '1', // Tributação no município
    regime_especial_tributacao: '6', // ME ou EPP do Simples Nacional (ABRASF; outros municípios exigem)
    optante_simples_nacional: true,
    incentivador_cultural: false,
    prestador: PRESTADOR,
    tomador: {
      cpf: cpf.replace(/\D/g, ''), // só números
      razao_social: studentName,
      ...(email && { email }),
    },
    servico: {
      aliquota: 0, // Simples Nacional isento
      discriminacao,
      iss_retido: false,
      item_lista_servico: '0802', // Ensino de idiomas
      codigo_cnae: '859370000',
      valor_servicos: amount,
      codigo_municipio: '3509502', // Campinas
    },
  }
}
