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

/** Nomes amigáveis para os cursos */
const CURSO_LABEL: Record<string, string> = {
  INGLES: 'Inglês',
  ESPANHOL: 'Espanhol',
  INGLES_E_ESPANHOL: 'Inglês e Espanhol',
}

interface BuildNfseParams {
  studentName: string // Nome do tomador (aluno ou razão social da empresa)
  cpf?: string // CPF do aluno (quando faturamento ALUNO)
  cnpj?: string // CNPJ da empresa (quando faturamento EMPRESA)
  email?: string
  amount: number // valor da mensalidade
  year: number
  month: number
  /** Override total da discriminação */
  description?: string
  /** Texto adicionado ao final da discriminação padrão */
  extraDescription?: string
  /** Para EMPRESA: nome do aluno, frequência e curso usados na descrição */
  alunoNome?: string
  frequenciaSemanal?: number | null
  curso?: string | null
  /** Template editável da descrição (quando faturamentoTipo=EMPRESA); se vazio usa padrão */
  customDescricaoEmpresa?: string | null
}

/** Template padrão para NF em nome de empresa. Use {aluno}, {frequencia}, {curso}, {mes}, {ano} */
const TEMPLATE_EMPRESA_PADRAO =
  'Aulas de idioma - Aluno {aluno}, frequência {frequencia}x/semana, curso {curso}.\nPagamento referente ao mês de {mes}/{ano}.'

function aplicarTemplateEmpresa(template: string, vars: {
  aluno: string
  frequencia: string
  curso: string
  mes: string
  ano: number
}): string {
  return template
    .replace(/\{aluno\}/g, vars.aluno)
    .replace(/\{frequencia\}/g, vars.frequencia)
    .replace(/\{curso\}/g, vars.curso)
    .replace(/\{mes\}/g, vars.mes)
    .replace(/\{ano\}/g, String(vars.ano))
}

export function buildNfsePayload(params: BuildNfseParams): NfsePayload {
  const {
    studentName,
    cpf,
    cnpj,
    email,
    amount,
    year,
    month,
    description,
    extraDescription,
    alunoNome,
    frequenciaSemanal,
    curso,
    customDescricaoEmpresa,
  } = params

  const mesNome = MESES[month] || String(month)

  let base: string
  if (description) {
    base = description
  } else if (cnpj) {
    // NF em nome de empresa: usa template editável ou padrão
    const template = (customDescricaoEmpresa && customDescricaoEmpresa.trim()) || TEMPLATE_EMPRESA_PADRAO
    base = aplicarTemplateEmpresa(template, {
      aluno: alunoNome?.trim() || studentName,
      frequencia: frequenciaSemanal != null ? String(frequenciaSemanal) : '-',
      curso: curso ? (CURSO_LABEL[curso] || curso) : '-',
      mes: mesNome,
      ano: year,
    })
  } else {
    base =
      `Combo de aulas de idioma.\nPagamento referente ao mês de ${mesNome}/${year}.\nAluno ${studentName}.`
  }

  const discriminacao = extraDescription ? `${base}\n${extraDescription}`.trim() : base

  // Tomador: CPF (pessoa física) ou CNPJ (pessoa jurídica/empresa)
  const cpfDigits = cpf ? cpf.replace(/\D/g, '') : null
  const cnpjDigits = cnpj ? cnpj.replace(/\D/g, '') : null
  const tomador: { cpf?: string; cnpj?: string; razao_social: string; email?: string } = {
    razao_social: studentName,
    ...(email && { email }),
  }
  if (cnpjDigits && cnpjDigits.length === 14) {
    tomador.cnpj = cnpjDigits
  } else if (cpfDigits && cpfDigits.length === 11) {
    tomador.cpf = cpfDigits
  }

  return {
    data_emissao: new Date().toISOString().split('T')[0], // Data atual no formato YYYY-MM-DD (obrigatório pela Focus NFe)
    natureza_operacao: '1', // Tributação no município
    regime_especial_tributacao: '6', // ME ou EPP do Simples Nacional (ABRASF; outros municípios exigem)
    optante_simples_nacional: true,
    incentivador_cultural: false,
    prestador: PRESTADOR,
    tomador,
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
