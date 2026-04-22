/**
 * Nome gravado em AdminExpense a partir da classificação (Movimentação).
 * Compartilhado entre a página e a importação de extrato.
 */

export interface MovimentacaoCategoriaDraft {
  tipo: 'ENTRADA' | 'SAIDA'
  categoriaPrincipal: string
  subcategoria: string
  categoriaOutro: string
}

const INFRA_SUB_LABEL: Record<string, string> = {
  ALUGUEL: 'Aluguel',
  INTERNET: 'Internet',
  SISTEMA: 'Sistema',
  LUZ: 'Luz',
  AGUA: 'Água',
  OUTRO: 'Outro',
}

const BANCO_SUB_LABEL: Record<string, string> = {
  CORA: 'Cora',
  INFINITE_PAY: 'Infinite Pay',
  BANCO_DO_BRASIL: 'Banco do Brasil',
  ITAU: 'Itaú',
  OUTRO: 'Outro',
}

const SAIDA_PRINCIPAL_LABEL: Record<string, string> = {
  PAG_PROFESSOR: 'Pag Professor',
  ADM: 'ADM',
  INFRAESTRUTURA: 'Infraestrutura',
  SISTEMA: 'Sistema',
  ADIANTAMENTO: 'Adiantamento',
  BANCO: 'Banco',
  DEVOLUCAO: 'Devolução',
  REPASSE: 'Repasse',
}

export function buildMovimentacaoNomeFromCategoria(d: MovimentacaoCategoriaDraft): string {
  if (d.tipo === 'ENTRADA') {
    if (d.categoriaPrincipal === 'ALUNO') return 'Aluno'
    if (d.categoriaPrincipal === 'LIVRO') return 'Livro'
    return d.categoriaOutro.trim() || 'Outro'
  }
  if (d.categoriaPrincipal === 'INFRAESTRUTURA') {
    const subLabel = INFRA_SUB_LABEL[d.subcategoria]
    if (d.subcategoria === 'OUTRO') return d.categoriaOutro.trim() || 'Infraestrutura - Outro'
    return subLabel ? `Infraestrutura - ${subLabel}` : 'Infraestrutura'
  }
  if (d.categoriaPrincipal === 'BANCO') {
    const subLabel = BANCO_SUB_LABEL[d.subcategoria]
    if (d.subcategoria === 'OUTRO') return d.categoriaOutro.trim() || 'Banco - Outro'
    return subLabel ? `Banco - ${subLabel}` : 'Banco'
  }
  const saidaLabel = SAIDA_PRINCIPAL_LABEL[d.categoriaPrincipal]
  return saidaLabel || d.categoriaOutro.trim() || 'Saída'
}
