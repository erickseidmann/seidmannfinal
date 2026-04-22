/**
 * Regras de categoria padrão por favorecido (campo Identificação do extrato).
 */

export function normalizarIdentificacaoMovimentacao(raw: string): string {
  return raw
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[^a-z0-9\s.-]/gi, '')
    .trim()
}

export type MovimentacaoIdentRegraApi = {
  id: string
  identificacaoChave: string
  identificacaoExemplo: string | null
  movTipo: 'ENTRADA' | 'SAIDA'
  categoriaPrincipal: string
  subcategoria: string
  categoriaOutro: string
}

export function chaveRegraMovimentacao(movTipo: 'ENTRADA' | 'SAIDA', identificacaoOriginal: string): string {
  return `${movTipo}::${normalizarIdentificacaoMovimentacao(identificacaoOriginal)}`
}
