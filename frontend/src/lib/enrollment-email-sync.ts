/**
 * Sincroniza users.email quando o admin altera enrollments.email.
 *
 * Casos:
 * - A: sem userId → só matrícula (sem sync de login)
 * - B: userId exclusivo → atualiza users.email (mantém senha)
 * - C: userId compartilhado (legado) → cria novo users e revincula a matrícula
 */

import bcrypt from 'bcryptjs'
import type { Prisma } from '@prisma/client'
import { SENHA_PADRAO_ALUNO } from '@/lib/access'
import { sendEmail, mensagemAcessoPlataforma } from '@/lib/email'

export class EnrollmentEmailConflictError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'EnrollmentEmailConflictError'
  }
}

export type EnrollmentEmailSyncAction =
  | 'none'
  | 'enrollment-only'
  | 'synced-exclusive'
  | 'created-new-user'

export type EnrollmentEmailSyncOutcome = {
  action: EnrollmentEmailSyncAction
  loginEmail?: string
  newUserId?: string
}

async function assertEmailAvailableForUser(
  tx: Prisma.TransactionClient,
  email: string,
  excludeUserId?: string | null
): Promise<void> {
  const existing = await tx.user.findUnique({
    where: { email },
    select: { id: true },
  })
  if (existing && existing.id !== excludeUserId) {
    throw new EnrollmentEmailConflictError(
      'Este e-mail já está em uso por outro usuário. Não foi possível sincronizar o login.'
    )
  }
}

async function createStudentUser(
  tx: Prisma.TransactionClient,
  opts: { nome: string; email: string; whatsapp: string }
) {
  const passwordHash = await bcrypt.hash(SENHA_PADRAO_ALUNO, 10)
  return tx.user.create({
    data: {
      nome: opts.nome,
      email: opts.email,
      whatsapp: opts.whatsapp,
      senha: passwordHash,
      role: 'STUDENT',
      status: 'ACTIVE',
      mustChangePassword: true,
    },
    select: { id: true, email: true },
  })
}

/**
 * Executa sync de login dentro de uma transação Prisma (antes do update da matrícula).
 * Retorna metadados para log/resposta; e-mail de credenciais (caso C) fica fora da transação.
 */
export async function syncLoginOnEnrollmentEmailChange(
  tx: Prisma.TransactionClient,
  opts: {
    enrollmentId: string
    userId: string | null
    currentEmail: string
    newEmail: string
    nome: string
    whatsapp: string
  }
): Promise<EnrollmentEmailSyncOutcome> {
  const { enrollmentId, userId, currentEmail, newEmail, nome, whatsapp } = opts

  if (newEmail === currentEmail) {
    return { action: 'none' }
  }

  if (!userId) {
    console.log(
      `[enrollment-email-sync] enrollment ${enrollmentId}: e-mail alterado sem userId — apenas matrícula`
    )
    return { action: 'enrollment-only' }
  }

  const sharedCount = await tx.enrollment.count({
    where: { userId },
  })

  if (sharedCount <= 1) {
    await assertEmailAvailableForUser(tx, newEmail, userId)
    await tx.user.update({
      where: { id: userId },
      data: { email: newEmail },
    })
    console.log(
      `[enrollment-email-sync] enrollment ${enrollmentId}: login sincronizado (user exclusivo ${userId}) → ${newEmail}`
    )
    return { action: 'synced-exclusive', loginEmail: newEmail }
  }

  await assertEmailAvailableForUser(tx, newEmail, null)
  const newUser = await createStudentUser(tx, { nome, email: newEmail, whatsapp })
  console.log(
    `[enrollment-email-sync] enrollment ${enrollmentId}: userId compartilhado ${userId} — desvinculado; novo user ${newUser.id} criado para ${newEmail}`
  )
  return {
    action: 'created-new-user',
    loginEmail: newUser.email,
    newUserId: newUser.id,
  }
}

export async function sendStudentCredentialsEmail(opts: {
  nomeAluno: string
  loginEmail: string
}): Promise<boolean> {
  const { subject, text } = mensagemAcessoPlataforma({
    nomeAluno: opts.nomeAluno,
    email: opts.loginEmail,
    senhaProvisoria: SENHA_PADRAO_ALUNO,
  })
  return sendEmail({ to: opts.loginEmail, subject, text })
}
