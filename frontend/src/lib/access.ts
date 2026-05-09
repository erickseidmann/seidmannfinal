/**
 * Liberação de acesso à plataforma para alunos.
 *
 * Centraliza a lógica de:
 *  - criar usuário (role STUDENT) com senha padrão quando o aluno ainda não tem conta
 *  - vincular um usuário existente à matrícula
 *  - enviar e-mail com login e senha provisória
 *
 * Usado no fluxo manual ("Liberar acesso") e disparado automaticamente
 * quando um pagamento é confirmado (webhook Cora ou marcação manual no Financeiro).
 */

import bcrypt from 'bcryptjs'
import { prisma } from '@/lib/prisma'
import { sendEmail, mensagemAcessoPlataforma } from '@/lib/email'

export const SENHA_PADRAO_ALUNO = '123456'

export type LiberarAcessoResultado =
  | { ok: true; status: 'created' | 'linked' | 'already-active'; emailSent: boolean; loginEmail: string }
  | { ok: false; status: 'no-email' | 'email-conflict' | 'error'; message: string }

/**
 * Garante que a matrícula tenha um usuário aluno vinculado e dispara o e-mail
 * com as credenciais de acesso (login + senha padrão).
 *
 * - Se já houver usuário (`enrollment.userId`) e o e-mail dele bater, apenas reenvia o e-mail
 *   quando `forceResendIfActive=true`. Caso contrário não faz nada (idempotente).
 * - Se não houver usuário e existir um STUDENT com o mesmo e-mail, vincula sem alterar senha
 *   e envia e-mail informando senha padrão (mantém compatibilidade com fluxo legado).
 * - Se não existir usuário, cria um novo STUDENT com `mustChangePassword=true`.
 */
export async function liberarAcessoAluno(opts: {
  enrollmentId: string
  /** Se true, reenviar e-mail mesmo que a matrícula já tenha userId vinculado. */
  forceResendIfActive?: boolean
}): Promise<LiberarAcessoResultado> {
  const { enrollmentId, forceResendIfActive = false } = opts

  try {
    const enrollment = await prisma.enrollment.findUnique({
      where: { id: enrollmentId },
      select: {
        id: true,
        nome: true,
        email: true,
        whatsapp: true,
        userId: true,
        user: { select: { id: true, email: true, role: true } },
      },
    })

    if (!enrollment) {
      return { ok: false, status: 'error', message: 'Matrícula não encontrada' }
    }

    const emailTrim = (enrollment.email ?? '').trim()
    if (!emailTrim) {
      return { ok: false, status: 'no-email', message: 'Aluno sem e-mail cadastrado' }
    }
    const normalizedEmail = emailTrim.toLowerCase()

    // Já tem usuário vinculado: opcionalmente reenviar e-mail
    if (enrollment.userId && enrollment.user) {
      if (!forceResendIfActive) {
        return {
          ok: true,
          status: 'already-active',
          emailSent: false,
          loginEmail: enrollment.user.email,
        }
      }
      const { subject, text } = mensagemAcessoPlataforma({
        nomeAluno: enrollment.nome,
        email: enrollment.user.email,
        senhaProvisoria: SENHA_PADRAO_ALUNO,
      })
      const sent = await sendEmail({ to: enrollment.user.email, subject, text })
      return {
        ok: true,
        status: 'already-active',
        emailSent: sent,
        loginEmail: enrollment.user.email,
      }
    }

    const existingUser = await prisma.user.findUnique({
      where: { email: normalizedEmail },
      select: { id: true, email: true, role: true },
    })

    let loginEmail: string
    let resultStatus: 'created' | 'linked'

    if (existingUser && existingUser.role === 'STUDENT') {
      await prisma.enrollment.update({
        where: { id: enrollment.id },
        data: { userId: existingUser.id },
      })
      loginEmail = existingUser.email
      resultStatus = 'linked'
    } else if (existingUser) {
      return {
        ok: false,
        status: 'email-conflict',
        message: `Já existe usuário (admin/professor) com o e-mail ${normalizedEmail}`,
      }
    } else {
      const passwordHash = await bcrypt.hash(SENHA_PADRAO_ALUNO, 10)
      const user = await prisma.user.create({
        data: {
          nome: enrollment.nome,
          email: normalizedEmail,
          whatsapp: enrollment.whatsapp,
          senha: passwordHash,
          role: 'STUDENT',
          status: 'ACTIVE',
          mustChangePassword: true,
        },
      })
      await prisma.enrollment.update({
        where: { id: enrollment.id },
        data: { userId: user.id },
      })
      loginEmail = user.email
      resultStatus = 'created'
    }

    const { subject, text } = mensagemAcessoPlataforma({
      nomeAluno: enrollment.nome,
      email: loginEmail,
      senhaProvisoria: SENHA_PADRAO_ALUNO,
    })
    const sent = await sendEmail({ to: loginEmail, subject, text })

    return {
      ok: true,
      status: resultStatus,
      emailSent: sent,
      loginEmail,
    }
  } catch (err) {
    console.error('[lib/access] liberarAcessoAluno error:', err)
    return {
      ok: false,
      status: 'error',
      message: err instanceof Error ? err.message : 'Erro ao liberar acesso',
    }
  }
}

/**
 * Versão "fire-and-forget" para fluxos automáticos (webhooks, marcação de pago, etc.).
 * Nunca propaga erros — apenas registra no console.
 */
export async function liberarAcessoAlunoSafe(opts: {
  enrollmentId: string
  contexto?: string
}): Promise<void> {
  const { enrollmentId, contexto = 'auto' } = opts
  try {
    const result = await liberarAcessoAluno({ enrollmentId })
    if (!result.ok) {
      console.warn(
        `[access:${contexto}] Acesso não liberado para enrollment ${enrollmentId}: ${result.status} - ${result.message}`
      )
      return
    }
    if (result.status === 'created' || result.status === 'linked') {
      console.log(
        `[access:${contexto}] Acesso liberado (${result.status}) para enrollment ${enrollmentId}; e-mail ${result.emailSent ? 'enviado' : 'falhou'} para ${result.loginEmail}`
      )
    }
  } catch (err) {
    console.error(`[access:${contexto}] Erro inesperado liberando acesso:`, err)
  }
}
