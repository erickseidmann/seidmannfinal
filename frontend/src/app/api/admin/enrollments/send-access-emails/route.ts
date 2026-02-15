/**
 * POST /api/admin/enrollments/send-access-emails
 * Envia e-mail de acesso (login + senha padrão) apenas para alunos que ainda NÃO têm conta.
 * Cria o acesso e envia o e-mail para cada um.
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/auth'
import { sendEmail, mensagemAcessoPlataforma } from '@/lib/email'
import bcrypt from 'bcryptjs'

const SENHA_PADRAO_ALUNO = '123456'

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAdmin(request)
    if (!auth.authorized) {
      return NextResponse.json(
        { ok: false, message: auth.message || 'Não autorizado' },
        { status: auth.message?.includes('Não autenticado') ? 401 : 403 }
      )
    }

    // Apenas matrículas sem conta (userId nulo) e com e-mail
    const enrollments = await prisma.enrollment.findMany({
      where: {
        userId: null,
        email: { not: '' },
      },
      select: {
        id: true,
        nome: true,
        email: true,
        whatsapp: true,
      },
      orderBy: { nome: 'asc' },
    })

    let created = 0
    let sent = 0
    const errors: string[] = []

    for (const enr of enrollments) {
      const emailTrim = enr.email.trim()
      if (!emailTrim) continue

      const normalizedEmail = emailTrim.toLowerCase()

      const existingUser = await prisma.user.findUnique({
        where: { email: normalizedEmail },
        select: { id: true, role: true },
      })

      let loginEmail: string

      if (existingUser && existingUser.role === 'STUDENT') {
        await prisma.enrollment.update({
          where: { id: enr.id },
          data: { userId: existingUser.id },
        })
        const linkedUser = await prisma.user.findUnique({
          where: { id: existingUser.id },
          select: { email: true },
        })
        loginEmail = linkedUser?.email ?? normalizedEmail
      } else if (existingUser) {
        errors.push(`${enr.nome}: já existe usuário (admin/professor) com este e-mail`)
        continue
      } else {
        const passwordHash = await bcrypt.hash(SENHA_PADRAO_ALUNO, 10)
        const user = await prisma.user.create({
          data: {
            nome: enr.nome,
            email: normalizedEmail,
            whatsapp: enr.whatsapp,
            senha: passwordHash,
            role: 'STUDENT',
            status: 'ACTIVE',
            mustChangePassword: true,
          },
        })
        await prisma.enrollment.update({
          where: { id: enr.id },
          data: { userId: user.id },
        })
        loginEmail = user.email
        created++
      }

      const { subject, text } = mensagemAcessoPlataforma({
        nomeAluno: enr.nome,
        email: loginEmail,
        senhaProvisoria: SENHA_PADRAO_ALUNO,
      })

      const ok = await sendEmail({
        to: loginEmail,
        subject,
        text,
      })
      if (ok) sent++
      else errors.push(`${enr.nome}: falha ao enviar e-mail`)
    }

    return NextResponse.json({
      ok: true,
      data: {
        message: enrollments.length === 0
          ? 'Nenhum aluno sem conta para enviar. Todos já possuem acesso.'
          : `E-mails enviados: ${sent} de ${enrollments.length} aluno(s) sem conta. ${created > 0 ? `Acesso criado para ${created}.` : ''}`,
        sent,
        total: enrollments.length,
        created,
        errors: errors.length > 0 ? errors : undefined,
      },
    })
  } catch (error) {
    console.error('[api/admin/enrollments/send-access-emails]', error)
    return NextResponse.json(
      { ok: false, message: 'Erro ao enviar e-mails de acesso' },
      { status: 500 }
    )
  }
}
