import { prisma } from '@/lib/prisma'

export type AdminActor = { userId: string | null; name: string | null }

export async function resolveAdminActor(
  userId?: string | null,
  email?: string | null
): Promise<AdminActor> {
  if (userId) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, nome: true },
    })
    if (user?.nome?.trim()) {
      return { userId: user.id, name: user.nome.trim() }
    }
  }

  const normalizedEmail = email?.trim().toLowerCase()
  if (normalizedEmail) {
    const user = await prisma.user.findUnique({
      where: { email: normalizedEmail },
      select: { id: true, nome: true },
    })
    if (user?.nome?.trim()) {
      return { userId: user.id, name: user.nome.trim() }
    }
  }

  return { userId: userId ?? null, name: null }
}

export function auditFieldsForCreate(actor: AdminActor) {
  return {
    createdById: actor.userId,
    createdByName: actor.name,
  }
}

export function auditFieldsForUpdate(actor: AdminActor) {
  return {
    updatedById: actor.userId,
    updatedByName: actor.name,
  }
}

export function resolveAuditNames(record: {
  createdByName?: string | null
  updatedByName?: string | null
  createdBy?: { nome: string } | null
  updatedBy?: { nome: string } | null
  cadastroViaImportacaoLista?: boolean | null
}) {
  const createdByName =
    record.createdByName?.trim() ||
    record.createdBy?.nome?.trim() ||
    (record.cadastroViaImportacaoLista ? 'importação em lista' : null) ||
    null

  const updatedByName =
    record.updatedByName?.trim() ||
    record.updatedBy?.nome?.trim() ||
    null

  return { createdByName, updatedByName }
}

function formatAuditDate(value?: string | Date | null): string | null {
  if (!value) return null
  const date = typeof value === 'string' ? new Date(value) : value
  if (Number.isNaN(date.getTime())) return null
  return date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

export function formatRecordAuditText(input: {
  criadoEm?: string | Date | null
  atualizadoEm?: string | Date | null
  createdByName?: string | null
  updatedByName?: string | null
  cadastroViaImportacaoLista?: boolean | null
}): string | null {
  const { createdByName, updatedByName } = resolveAuditNames(input)

  if (updatedByName) {
    const day = formatAuditDate(input.atualizadoEm)
    return day
      ? `editado por ${updatedByName} no dia ${day}`
      : `editado por ${updatedByName}`
  }

  const author = createdByName || 'não registrado'
  const day = formatAuditDate(input.criadoEm)
  return day ? `adicionado por ${author} no dia ${day}` : `adicionado por ${author}`
}
