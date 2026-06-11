/** Texto curto no rodapé do card (quem cancelou/reagendou ou quem agendou). */
export function getLastUpdateInfo(notes: string | null, createdByName: string | null): string {
  if (!notes) {
    return createdByName || 'Admin'
  }

  const lines = notes.split('\n').filter((line) => line.trim())
  const lastUpdateLine = [...lines].reverse().find(
    (line) =>
      line.includes('Aula foi cancelada') ||
      line.includes('Aula foi reagendada') ||
      line.includes('Aula reagendada pelo aluno') ||
      line.includes('cancelada pelo aluno') ||
      line.includes('cancelada pelo admin') ||
      line.includes('reagendada pelo aluno') ||
      line.includes('reagendada pelo admin')
  )

  if (lastUpdateLine) {
    if (
      lastUpdateLine.includes('Aula reagendada pelo aluno') ||
      lastUpdateLine.includes('reagendada pelo aluno')
    ) {
      if (lastUpdateLine.includes('aprovado pelo')) {
        const matchAprovador = lastUpdateLine.match(/aprovado pelo (.+?)(?:\s+no dia|$)/i)
        if (matchAprovador?.[1]) {
          const aprovador = matchAprovador[1].trim()
          if (aprovador.toLowerCase() !== 'admin' && aprovador.toLowerCase() !== 'professor') {
            return `reposição agendada pelo aluno e aprovada por ${aprovador}`
          }
        }
      }
      return 'reposição agendada pelo aluno'
    }

    if (lastUpdateLine.includes('cancelada pelo aluno')) {
      return 'cancelada pelo aluno'
    }
    if (lastUpdateLine.includes('cancelada pelo')) {
      const match = lastUpdateLine.match(/cancelada pelo (.+?)(?:\s+às|$)/i)
      if (match?.[1]) {
        const quemCancelou = match[1].trim()
        if (quemCancelou.toLowerCase() === 'admin') {
          return 'cancelada pelo admin'
        }
        return `cancelada por ${quemCancelou}`
      }
      return 'cancelada pelo admin'
    }

    if (lastUpdateLine.includes('reagendada pelo')) {
      if (lastUpdateLine.includes('reagendada pelo aluno')) {
        return 'reposição agendada pelo aluno'
      }
      const match = lastUpdateLine.match(/reagendada pelo (.+?)(?:\s+às|\s+no dia|$)/i)
      if (match?.[1]) {
        const quemReagendou = match[1].trim()
        if (quemReagendou.toLowerCase() === 'admin') {
          return 'reagendada pelo admin'
        }
        return `reagendada por ${quemReagendou}`
      }
      return 'reagendada pelo admin'
    }
  }

  return createdByName || 'Admin'
}
