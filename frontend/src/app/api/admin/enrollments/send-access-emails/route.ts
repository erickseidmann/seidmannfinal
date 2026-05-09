/**
 * POST /api/admin/enrollments/send-access-emails
 * Envia e-mail de acesso (login + senha padrão) apenas para alunos que ainda NÃO têm conta.
 * Cria o acesso e envia o e-mail para cada um.
 *
 * Observação: o mesmo procedimento é executado automaticamente sempre que um pagamento é
 * confirmado (via webhook Cora ou marcação manual no Financeiro) — ver `lib/access.ts`.
 * Este endpoint segue existindo para liberar manualmente alunos que ainda não pagaram.
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/auth'
import { liberarAcessoAluno } from '@/lib/access'

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAdmin(request)
    if (!auth.authorized) {
      return NextResponse.json(
        { ok: false, message: auth.message || 'Não autorizado' },
        { status: auth.message?.includes('Não autenticado') ? 401 : 403 }
      )
    }

    const enrollments = await prisma.enrollment.findMany({
      where: {
        userId: null,
        email: { not: '' },
      },
      select: { id: true, nome: true },
      orderBy: { nome: 'asc' },
    })

    let created = 0
    let linked = 0
    let sent = 0
    const errors: string[] = []

    for (const enr of enrollments) {
      const result = await liberarAcessoAluno({ enrollmentId: enr.id })
      if (!result.ok) {
        if (result.status === 'no-email') continue
        errors.push(`${enr.nome}: ${result.message}`)
        continue
      }
      if (result.status === 'created') created++
      if (result.status === 'linked') linked++
      if (result.emailSent) sent++
      else errors.push(`${enr.nome}: falha ao enviar e-mail`)
    }

    return NextResponse.json({
      ok: true,
      data: {
        message:
          enrollments.length === 0
            ? 'Nenhum aluno sem conta para enviar. Todos já possuem acesso.'
            : `E-mails enviados: ${sent} de ${enrollments.length} aluno(s) sem conta. ${created > 0 ? `Acesso criado para ${created}.` : ''}${linked > 0 ? ` Vinculados: ${linked}.` : ''}`,
        sent,
        total: enrollments.length,
        created,
        linked,
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
