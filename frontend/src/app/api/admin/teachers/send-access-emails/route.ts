/**
 * POST /api/admin/teachers/send-access-emails
 * Envia e-mail de acesso (login + senha padrão) apenas para professores que ainda NÃO têm conta.
 * Cria o acesso e envia o e-mail para cada um.
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/auth'
import { sendEmail, mensagemAcessoPlataformaProfessor } from '@/lib/email'
import bcrypt from 'bcryptjs'

const SENHA_PADRAO_PROFESSOR = '123456'

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAdmin(request)
    if (!auth.authorized) {
      return NextResponse.json(
        { ok: false, message: auth.message || 'Não autorizado' },
        { status: auth.message?.includes('Não autenticado') ? 401 : 403 }
      )
    }

    // Apenas professores sem conta (userId nulo)
    const teachers = await prisma.teacher.findMany({
      where: { userId: null },
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

    for (const t of teachers) {
      const emailTrim = t.email.trim()
      if (!emailTrim) continue

      const normalizedEmail = emailTrim.toLowerCase()

      const existingUser = await prisma.user.findUnique({
        where: { email: normalizedEmail },
        select: { id: true, role: true },
      })

      let loginEmail: string

      if (existingUser && existingUser.role === 'TEACHER') {
        await prisma.teacher.update({
          where: { id: t.id },
          data: { userId: existingUser.id },
        })
        const linkedUser = await prisma.user.findUnique({
          where: { id: existingUser.id },
          select: { email: true },
        })
        loginEmail = linkedUser?.email ?? normalizedEmail
      } else if (existingUser) {
        errors.push(`${t.nome}: já existe usuário (admin/aluno) com este e-mail`)
        continue
      } else {
        const passwordHash = await bcrypt.hash(SENHA_PADRAO_PROFESSOR, 10)
        const user = await prisma.user.create({
          data: {
            nome: t.nome,
            email: normalizedEmail,
            whatsapp: t.whatsapp || '00000000000',
            senha: passwordHash,
            role: 'TEACHER',
            status: 'ACTIVE',
            mustChangePassword: true,
          },
        })
        await prisma.teacher.update({
          where: { id: t.id },
          data: { userId: user.id },
        })
        loginEmail = user.email
        created++
      }

      const { subject, text } = mensagemAcessoPlataformaProfessor({
        nomeProfessor: t.nome,
        email: loginEmail,
        senhaProvisoria: SENHA_PADRAO_PROFESSOR,
      })

      const ok = await sendEmail({
        to: loginEmail,
        subject,
        text,
      })
      if (ok) sent++
      else errors.push(`${t.nome}: falha ao enviar e-mail`)
    }

    return NextResponse.json({
      ok: true,
      data: {
        message:
          teachers.length === 0
            ? 'Nenhum professor sem conta para enviar. Todos já possuem acesso.'
            : `E-mails enviados: ${sent} de ${teachers.length} professor(es) sem conta. ${created > 0 ? `Acesso criado para ${created}.` : ''}`,
        sent,
        total: teachers.length,
        created,
        errors: errors.length > 0 ? errors : undefined,
      },
    })
  } catch (error) {
    console.error('[api/admin/teachers/send-access-emails]', error)
    return NextResponse.json(
      { ok: false, message: 'Erro ao enviar e-mails de acesso' },
      { status: 500 }
    )
  }
}
