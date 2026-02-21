/**
 * Dados financeiros do aluno: para cobrança, NFSe e validação.
 * Se for menor de idade (tem responsável cadastrado), usa nome/CPF/email do responsável.
 * Se faturamentoTipo === "EMPRESA", usa dados da empresa para NFSe.
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
 * Se faturamentoTipo === "EMPRESA", retorna dados da empresa para NFSe (nome=razão social, cnpj, email).
 * Se houver responsável (menor de idade), usa os dados do responsável (aluno).
 */
export function getEnrollmentFinanceData(enrollment: EnrollmentForFinance): EnrollmentFinanceData {
  // NFSe em nome de empresa: usa dados de faturamento
  if (enrollment.faturamentoTipo === 'EMPRESA' && enrollment.faturamentoRazaoSocial?.trim() && enrollment.faturamentoCnpj?.trim()) {
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

  // Cobrança/NFSe em nome do aluno (ou responsável se menor)
  const temResponsavel =
    (enrollment.nomeResponsavel && enrollment.nomeResponsavel.trim()) ||
    (enrollment.cpfResponsavel && enrollment.cpfResponsavel.trim()) ||
    (enrollment.emailResponsavel && enrollment.emailResponsavel.trim())

  if (temResponsavel) {
    return {
      nome: (enrollment.nomeResponsavel && enrollment.nomeResponsavel.trim()) || enrollment.nome,
      cpf: enrollment.cpfResponsavel?.trim() || null,
      email:
        (enrollment.emailResponsavel && enrollment.emailResponsavel.trim()) ||
        enrollment.user?.email?.trim() ||
        enrollment.email?.trim() ||
        null,
    }
  }

  return {
    nome: enrollment.nome,
    cpf: enrollment.cpf?.trim() || null,
    email:
      enrollment.user?.email?.trim() ||
      enrollment.email?.trim() ||
      null,
  }
}
