/** Formata CPF para exibição: 000.000.000-00 */
export function formatCpfDisplay(cpf: string): string {
  const digits = cpf.replace(/\D/g, '')
  if (digits.length !== 11) return cpf.trim()
  return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`
}

export function normalizeCpf(cpf: string): string {
  return cpf.replace(/\D/g, '')
}

export function isValidCpf(cpf: string): boolean {
  const digits = normalizeCpf(cpf)
  if (digits.length !== 11 || /^(\d)\1+$/.test(digits)) return false

  let sum = 0
  for (let i = 0; i < 9; i++) sum += parseInt(digits[i], 10) * (10 - i)
  let rest = (sum * 10) % 11
  if (rest === 10) rest = 0
  if (rest !== parseInt(digits[9], 10)) return false

  sum = 0
  for (let i = 0; i < 10; i++) sum += parseInt(digits[i], 10) * (11 - i)
  rest = (sum * 10) % 11
  if (rest === 10) rest = 0
  return rest === parseInt(digits[10], 10)
}

export function formatCertificateDateLong(date: Date): string {
  return date.toLocaleDateString('pt-BR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'America/Sao_Paulo',
  })
}

export function formatCertificateDateShort(date: Date): string {
  return date.toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: 'America/Sao_Paulo',
  })
}

export function defaultCourseBody(
  type: 'DECLARACAO' | 'CONCLUSAO',
  opts: {
    periodStart: string
    periodEnd: string
    totalHours: number
    courseTitle: string
  }
): string {
  const { periodStart, periodEnd, totalHours, courseTitle } = opts
  if (type === 'DECLARACAO') {
    return `foi aluno regularmente matriculado no Seidmann Institute no período de ${periodStart} a ${periodEnd}, participando de aulas de inglês realizadas de segunda a quinta-feira, com duração de 30 minutos por aula.

Durante esse período, o aluno cumpriu aproximadamente ${totalHours} horas de atividades acadêmicas, incluindo aulas, avaliações, exercícios e práticas supervisionadas.

As aulas foram ministradas por professores de diferentes nacionalidades, proporcionando ampla exposição à língua inglesa em diversos contextos culturais e linguísticos.

Esta declaração é emitida a pedido do interessado para fins de comprovação junto à instituição de ensino superior.`
  }

  return `Portador do CPF informado neste documento, concluiu com sucesso o curso de ${courseTitle} oferecido pelo Seidmann Institute CNPJ:32707269000107, realizado no período de ${periodStart} a ${periodEnd}, com carga horária total de ${totalHours} horas, distribuídas em aulas regulares de segunda a quinta-feira, com duração de 30 minutos por aula. Durante esse período, o aluno progrediu pelos níveis do Quadro Europeu Comum de Referência para Línguas (CEFR), de A1 até C1/C2, demonstrando dedicação, comprometimento e evolução consistente no domínio da língua inglesa.`
}
