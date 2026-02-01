/**
 * GET  /api/admin/financeiro/alunos/[id]/enviar-cobranca – retorna o modelo do e-mail (assunto e corpo).
 * POST /api/admin/financeiro/alunos/[id]/enviar-cobranca – envia o e-mail (corpo opcional: subject, text).
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/auth'
import { sendEmail } from '@/lib/email'

/** Próxima data de vencimento dado o dia do mês (1-31). Se o dia já passou neste mês, retorna o mês que vem. */
function nextDueDateFromDay(dayOfMonth: number, afterDate?: Date): Date {
  const after = afterDate ?? new Date()
  const year = after.getFullYear()
  const month = after.getMonth()
  const safeDay = Math.min(dayOfMonth, new Date(year, month + 1, 0).getDate())
  const candidate = new Date(year, month, safeDay)
  if (candidate > after) return candidate
  const nextSafe = Math.min(dayOfMonth, new Date(year, month + 2, 0).getDate())
  return new Date(year, month + 1, nextSafe)
}

function buildTemplate(enrollment: {
  nome: string
  valorMensalidade: number | null
  diaPagamento: number | null
  paymentInfo: { valorMensal: unknown; dueDate: Date | null; dueDay: number | null; paidAt: Date | null } | null
}) {
  const valorMensal = enrollment.valorMensalidade ?? (enrollment.paymentInfo?.valorMensal as number | null)
  const valorStr = valorMensal != null ? `R$ ${Number(valorMensal).toFixed(2).replace('.', ',')}` : 'conforme combinado'
  const pi = enrollment.paymentInfo
  const diaPagamento = enrollment.diaPagamento ?? pi?.dueDay ?? null
  let dataProximo: Date | null = pi?.dueDate ? new Date(pi.dueDate) : null
  if (!dataProximo && diaPagamento != null && diaPagamento >= 1 && diaPagamento <= 31) {
    const ref = pi?.paidAt ?? new Date()
    dataProximo = nextDueDateFromDay(diaPagamento, ref)
  }
  const vencimento = dataProximo ? dataProximo.toLocaleDateString('pt-BR') : 'verificar com a secretaria'

  const subject = 'Lembrete de vencimento'
  const text = `Olá, ${enrollment.nome},

Segue lembrete de pagamento referente as aulas com a Seidmann Institute.

Valor: ${valorStr}
Vencimento: ${vencimento}

Por favor,

Em caso de dúvidas, entre em contato conosco.

Atenciosamente,
Equipe Seidmann Institute`
  return { subject, text }
}

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const auth = await requireAdmin(_request)
    if (!auth.authorized) {
      return NextResponse.json(
        { ok: false, message: auth.message || 'Não autorizado' },
        { status: auth.message?.includes('Não autenticado') ? 401 : 403 }
      )
    }
    const enrollmentId = params.id
    const enrollment = await prisma.enrollment.findUnique({
      where: { id: enrollmentId },
      include: { paymentInfo: true },
    })
    if (!enrollment) {
      return NextResponse.json(
        { ok: false, message: 'Matrícula não encontrada' },
        { status: 404 }
      )
    }
    const email = enrollment.email?.trim()
    if (!email) {
      return NextResponse.json(
        { ok: false, message: 'Aluno não possui e-mail cadastrado para envio da cobrança' },
        { status: 400 }
      )
    }
    const { subject, text } = buildTemplate(enrollment)
    return NextResponse.json({ ok: true, data: { to: email, subject, text } })
  } catch (error) {
    console.error('[api/admin/financeiro/alunos/[id]/enviar-cobranca GET]', error)
    return NextResponse.json(
      { ok: false, message: 'Erro ao carregar modelo do e-mail' },
      { status: 500 }
    )
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const auth = await requireAdmin(request)
    if (!auth.authorized) {
      return NextResponse.json(
        { ok: false, message: auth.message || 'Não autorizado' },
        { status: auth.message?.includes('Não autenticado') ? 401 : 403 }
      )
    }

    const enrollmentId = params.id
    const enrollment = await prisma.enrollment.findUnique({
      where: { id: enrollmentId },
      include: { paymentInfo: true },
    })
    if (!enrollment) {
      return NextResponse.json(
        { ok: false, message: 'Matrícula não encontrada' },
        { status: 404 }
      )
    }

    const email = enrollment.email?.trim()
    if (!email) {
      return NextResponse.json(
        { ok: false, message: 'Aluno não possui e-mail cadastrado para envio da cobrança' },
        { status: 400 }
      )
    }

    let subject: string
    let text: string
    try {
      const body = await request.json().catch(() => ({}))
      if (body.subject != null && body.text != null && String(body.subject).trim() && String(body.text).trim()) {
        subject = String(body.subject).trim()
        text = String(body.text).trim()
      } else {
        const t = buildTemplate(enrollment)
        subject = t.subject
        text = t.text
      }
    } catch {
      const t = buildTemplate(enrollment)
      subject = t.subject
      text = t.text
    }

    const sent = await sendEmail({ to: email, subject, text })
    if (!sent) {
      return NextResponse.json(
        { ok: false, message: 'Não foi possível enviar o e-mail. Verifique a configuração SMTP.' },
        { status: 500 }
      )
    }

    return NextResponse.json({ ok: true, message: 'Cobrança enviada com sucesso' })
  } catch (error) {
    console.error('[api/admin/financeiro/alunos/[id]/enviar-cobranca POST]', error)
    return NextResponse.json(
      { ok: false, message: 'Erro ao enviar cobrança' },
      { status: 500 }
    )
  }
}
