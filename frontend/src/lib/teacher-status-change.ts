import type { UserStatus } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import {
  buildTeacherStatusPatch,
  syncLinkedUserStatus,
  type TeacherStatusFields,
} from '@/lib/teacher-inactive'

export async function applyTeacherStatusChange(
  teacherId: string,
  newStatus: UserStatus,
  opts?: { inactiveFrom?: string | null; userId?: string | null }
): Promise<{ status: UserStatus; inactiveAt: Date | null }> {
  const existing = await prisma.teacher.findUnique({
    where: { id: teacherId },
    select: { status: true, inactiveAt: true, userId: true },
  })
  if (!existing) throw new Error('Professor não encontrado')

  const patch = buildTeacherStatusPatch(existing, newStatus, opts?.inactiveFrom)
  const updated = await prisma.teacher.update({
    where: { id: teacherId },
    data: patch,
    select: { status: true, inactiveAt: true, userId: true },
  })

  const userId = opts?.userId ?? updated.userId ?? existing.userId
  if (patch.status === 'INACTIVE' || patch.status === 'ACTIVE') {
    await syncLinkedUserStatus(userId, patch.status)
  }

  return { status: updated.status, inactiveAt: updated.inactiveAt }
}
