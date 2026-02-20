/**
 * Dados financeiros do aluno: para cobrança, NFSe e validação.
 * Se for menor de idade (tem responsável cadastrado), usa nome/CPF/email do responsável.
 */

export type EnrollmentForFinance = {
  nome: string
  email: string | null
  cpf: string | null
  nomeResponsavel?: string | null
  emailResponsavel?: string | null
  cpfResponsavel?: string | null
  user?: { email: string } | null
}

export interface EnrollmentFinanceData {
  nome: string
  cpf: string | null
  email: string | null
}

/**
 * Retorna nome, CPF e e-mail a serem usados para fins financeiros (cobrança, NFSe).
 * Se houver responsável (menor de idade), usa os dados do responsável.
 */
export function getEnrollmentFinanceData(enrollment: EnrollmentForFinance): EnrollmentFinanceData {
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
