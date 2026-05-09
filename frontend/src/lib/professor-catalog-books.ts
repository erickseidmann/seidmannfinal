/** Livro do catálogo (admin → Livros), exposto ao professor para registro de aula. */
export interface ProfessorCatalogBook {
  id: string
  nome: string
  level: string
  totalPaginas: number
}

export function labelProfessorCatalogBook(b: ProfessorCatalogBook): string {
  return `${b.nome} — ${b.level} • ${b.totalPaginas} pág.`
}
