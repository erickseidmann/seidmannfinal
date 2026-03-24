/**
 * Dados financeiros do aluno: para cobrança, NFSe e validação.
 * Se faturamentoTipo === "EMPRESA" e dados da empresa completos, usa CNPJ/razão social para NFSe.
 * Se faturamentoTipo === "ALUNO" (padrão), usa sempre nome/CPF/e-mail do aluno — mesmo que exista
 * responsável na matrícula (nome/CPF do responsável é informativo, não define o tomador da NF).
 */

export type EnrollmentForFinance = {
  nome: string
  email: string | null
  cpf?: string | null
  nomeResponsavel?: string | null
  emailResponsavel?: string | null
  cpfResponsavel?: string | null
  user?: { email: string } | null
  faturamentoTipo?: string | null
  faturamentoRazaoSocial?: string | null
  faturamentoCnpj?: string | null
  faturamentoEmail?: string | null
  faturamentoEndereco?: string | null
}

export interface EnrollmentFinanceData {
  nome: string
  cpf: string | null
  email: string | null
  /** CNPJ quando faturamentoTipo === "EMPRESA" (para NFSe tomador) */
  cnpj?: string | null
}

/**
 * Retorna nome, CPF/CNPJ e e-mail a serem usados para fins financeiros (cobrança, NFSe).
 * EMPRESA com CNPJ válido → tomador empresa; caso contrário (ALUNO ou empresa incompleta) → aluno.
 */
export function getEnrollmentFinanceData(enrollment: EnrollmentForFinance): EnrollmentFinanceData {
  const tipo = enrollment.faturamentoTipo ?? 'ALUNO'

  // NFSe em nome de empresa: usa dados de faturamento
  if (tipo === 'EMPRESA' && enrollment.faturamentoRazaoSocial?.trim() && enrollment.faturamentoCnpj?.trim()) {
    const cnpjDigits = enrollment.faturamentoCnpj.replace(/\D/g, '')
    if (cnpjDigits.length === 14) {
      return {
        nome: enrollment.faturamentoRazaoSocial.trim(),
        cpf: null,
        email: enrollment.faturamentoEmail?.trim() || null,
        cnpj: cnpjDigits,
      }
    }
  }

  // Faturamento no aluno (inclui ALUNO explícito e EMPRESA sem dados de empresa completos)
  return {
    nome: enrollment.nome,
    cpf: enrollment.cpf?.trim() || null,
    email:
      enrollment.user?.email?.trim() ||
      enrollment.email?.trim() ||
      null,
  }
}
