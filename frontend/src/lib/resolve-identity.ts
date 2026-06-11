/**
 * Resolve identidade (teacher / student) a partir da sessão autenticada.
 */

import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireTeacher, requireStudent } from '@/lib/auth'
import type { StudentIdentity, TeacherIdentity } from '@/lib/lesson-attendance-service'

type ResolveFail = { ok: false; status: 401 | 403; message: string }
type ResolveTeacherOk = { ok: true; identity: TeacherIdentity }
type ResolveStudentOk = { ok: true; identity: StudentIdentity }

export async function resolveTeacherIdentity(
  request: NextRequest
): Promise<ResolveFail | ResolveTeacherOk> {
  const auth = await requireTeacher(request)
  if (!auth.authorized || !auth.session) {
    return {
      ok: false,
      status: auth.message?.includes('Não autenticado') ? 401 : 403,
      message: auth.message || 'Não autorizado',
    }
  }

  const teacher = await prisma.teacher.findFirst({
    where: { userId: auth.session.userId },
    select: { id: true },
  })
  if (!teacher) {
    return { ok: false, status: 403, message: 'Professor não encontrado' }
  }

  return { ok: true, identity: { role: 'TEACHER', teacherId: teacher.id } }
}

export async function resolveStudentIdentity(
  request: NextRequest
): Promise<ResolveFail | ResolveStudentOk> {
  const auth = await requireStudent(request)
  if (!auth.authorized || !auth.session) {
    return {
      ok: false,
      status: auth.message?.includes('Não autenticado') ? 401 : 403,
      message: auth.message || 'Não autorizado',
    }
  }

  const enrollments = await prisma.enrollment.findMany({
    where: { userId: auth.session.userId },
    select: { id: true },
  })
  const enrollmentIds = enrollments.map((e) => e.id)
  if (enrollmentIds.length === 0) {
    return { ok: false, status: 403, message: 'Matrícula não encontrada' }
  }

  return { ok: true, identity: { role: 'STUDENT', enrollmentIds } }
}
