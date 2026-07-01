/**
 * Pool de links de sala (Google Meet etc.) reaproveitados de professores inativos.
 * Ao entrar um professor novo/ativado sem link, tenta atribuir um link disponível.
 */

import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { validateMeetingLink } from '@/lib/meeting-link'

export function normalizeMeetingLinkKey(value: string | null | undefined): string | null {
  const trimmed = typeof value === 'string' ? value.trim() : ''
  return trimmed ? trimmed.toLowerCase() : null
}

function hasLinkSala(value: string | null | undefined): boolean {
  return Boolean(normalizeMeetingLinkKey(value))
}

type DbClient = Prisma.TransactionClient | typeof prisma

/**
 * Atribui um link de sala de um professor inativo ao professor informado.
 * Não repete links já usados por professores não inativos.
 * Remove o link do professor inativo doador após a atribuição.
 */
export async function assignTeacherLinkSalaFromInactivePool(
  teacherId: string,
  db: DbClient = prisma
): Promise<string | null> {
  const run = async (tx: Prisma.TransactionClient) => {
    const recipient = await tx.teacher.findUnique({
      where: { id: teacherId },
      select: { id: true, status: true, linkSala: true },
    })
    if (!recipient || recipient.status === 'INACTIVE') return null
    if (hasLinkSala(recipient.linkSala)) return recipient.linkSala!.trim()

    const occupiedRows = await tx.teacher.findMany({
      where: {
        status: { not: 'INACTIVE' },
        id: { not: teacherId },
        linkSala: { not: null },
        NOT: { linkSala: '' },
      },
      select: { linkSala: true },
    })
    const occupied = new Set(
      occupiedRows
        .map((row) => normalizeMeetingLinkKey(row.linkSala))
        .filter((key): key is string => Boolean(key))
    )

    const donors = await tx.teacher.findMany({
      where: {
        status: 'INACTIVE',
        linkSala: { not: null },
        NOT: { linkSala: '' },
      },
      orderBy: [{ inactiveAt: 'asc' }, { criadoEm: 'asc' }, { id: 'asc' }],
      select: { id: true, linkSala: true },
    })

    for (const donor of donors) {
      const link = donor.linkSala?.trim() ?? ''
      if (!link || !validateMeetingLink(link).valid) continue

      const linkKey = normalizeMeetingLinkKey(link)
      if (!linkKey || occupied.has(linkKey)) continue

      const cleared = await tx.teacher.updateMany({
        where: {
          id: donor.id,
          status: 'INACTIVE',
          linkSala: donor.linkSala,
        },
        data: { linkSala: null },
      })
      if (cleared.count !== 1) continue

      const assigned = await tx.teacher.updateMany({
        where: {
          id: teacherId,
          status: { not: 'INACTIVE' },
          OR: [{ linkSala: null }, { linkSala: '' }],
        },
        data: { linkSala: link },
      })
      if (assigned.count !== 1) {
        await tx.teacher.update({
          where: { id: donor.id },
          data: { linkSala: donor.linkSala },
        })
        continue
      }

      occupied.add(linkKey)
      return link
    }

    return null
  }

  if ('$transaction' in db && typeof db.$transaction === 'function') {
    return db.$transaction(run)
  }
  return run(db as Prisma.TransactionClient)
}
