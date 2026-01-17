/**
 * Normalização de idioma
 * 
 * Converte diferentes variações de idioma para o enum do Prisma
 * Suporta: "Inglês", "Ingles", "ENGLISH", "English", "Espanhol", "SPANISH", etc
 */

/**
 * Normaliza o idioma recebido para o formato do enum Prisma
 * 
 * @param input - Valor do idioma (string, pode ser qualquer variação)
 * @returns "ENGLISH" | "SPANISH" | null
 */
export function normalizeLanguage(input: unknown): 'ENGLISH' | 'SPANISH' | null {
  if (!input || typeof input !== 'string') {
    return null
  }

  // Normalizar: remover acentos, converter para lowercase, remover espaços
  const normalized = input
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Remove acentos
    .replace(/\s+/g, '') // Remove espaços

  // Mapear variações de inglês
  const englishVariants = ['ingles', 'english', 'inglés', 'inglês', 'ing', 'en']
  if (englishVariants.includes(normalized)) {
    return 'ENGLISH'
  }

  // Mapear variações de espanhol
  const spanishVariants = ['espanhol', 'spanish', 'español', 'esp', 'es']
  if (spanishVariants.includes(normalized)) {
    return 'SPANISH'
  }

  return null
}
