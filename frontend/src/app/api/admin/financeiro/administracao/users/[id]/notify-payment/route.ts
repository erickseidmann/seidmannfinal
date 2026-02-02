/**
 * POST /api/admin/financeiro/administracao/users/[id]/notify-payment
 * Mostra preview e envia e-mail de notificação de pagamento (com anexo opcional),
 * marca pagamento como PAGO e cria notificação in-app.
 * Body: FormData com year, month, message? (texto da mensagem), attachment? (arquivo)
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/auth'
import { sendEmail } from '@/lib/email'

const SUPER_ADMIN_EMAIL = 'admin@seidmann.com'
const MESES_LABELS: Record<number, string> = {
  1: 'Janeiro', 2: 'Fevereiro', 3: 'Março', 4: 'Abril', 5: 'Maio', 6: 'Junho',
  7: 'Julho', 8: 'Agosto', 9: 'Setembro', 10: 'Outubro', 11: 'Novembro', 12: 'Dezembro',
}

function formatValor(valor: number | null | undefined): string {
  if (valor == null) return '--'
  return Number(valor).toFixed(2).replace('.', ',')
}

function mensagemPadrao(mesNome: string, year: number, valor: number | null | undefined): string {
  const valorStr = formatValor(valor)
  return `Olá,

Informamos que o pagamento referente à prestação de serviços de ${mesNome} de ${year} foi confirmado.
O valor é de R$ ${valorStr}.

Em caso de dúvidas, entre em contato com a gestão financeira.

Atenciosamente,
Equipe Seidmann Institute`
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAdmin(request)
    if (!auth.authorized) {
      return NextResponse.json(
        { ok: false, message: auth.message || 'Não autorizado' },
        { status: auth.message?.includes('Não autenticado') ? 401 : 403 }
      )
    }

    const { id: userId } = await params
    const user = await prisma.user.findFirst({
      where: {
        id: userId,
        role: 'ADMIN',
        email: { not: SUPER_ADMIN_EMAIL },
      },
      select: { id: true, nome: true, email: true, emailPessoal: true },
    })
    if (!user) {
      return NextResponse.json(
        { ok: false, message: 'Usuário não encontrado ou não é ADM' },
        { status: 404 }
      )
    }

    const formData = await request.formData().catch(() => new FormData())
    const yearParam = formData.get('year')
    const monthParam = formData.get('month')
    const messageParam = formData.get('message')
    const attachment = formData.get('attachment') as File | null

    const year = yearParam != null ? Number(yearParam) : null
    const month = monthParam != null ? Number(monthParam) : null
    if (year == null || month == null || month < 1 || month > 12) {
      return NextResponse.json(
        { ok: false, message: 'year e month (1-12) são obrigatórios' },
        { status: 400 }
      )
    }

    const mesNome = MESES_LABELS[month] ?? `${month}`
    const subject = `Pagamento confirmado – ${mesNome} de ${year}`

    let valorParaMensagem: number | null = null
    if (prisma.adminUserPaymentMonth) {
      const payment = await prisma.adminUserPaymentMonth.findUnique({
        where: { userId_year_month: { userId, year, month } },
      })
      if (payment?.valor != null) valorParaMensagem = Number(payment.valor)
    }

    const text =
      typeof messageParam === 'string' && messageParam.trim()
        ? messageParam.trim()
        : mensagemPadrao(mesNome, year, valorParaMensagem)

    if (!prisma.adminUserPaymentMonth) {
      return NextResponse.json(
        { ok: false, message: 'Modelo não disponível. Rode: npx prisma generate' },
        { status: 503 }
      )
    }

    const attachments: { filename: string; content: Buffer }[] = []
    if (attachment && attachment.size > 0) {
      const buffer = Buffer.from(await attachment.arrayBuffer())
      const filename = attachment.name || 'anexo'
      attachments.push({ filename, content: buffer })
    }

    // Notificações sempre pelo email pessoal quando existir; senão email de acesso
    const emailTo = (user.emailPessoal || user.email || '').trim() || user.email
    const emailSent = await sendEmail({
      to: emailTo,
      subject,
      text,
      attachments: attachments.length ? attachments : undefined,
    })

    await prisma.adminUserPaymentMonth.upsert({
      where: { userId_year_month: { userId, year, month } },
      create: { userId, year, month, valor: null, paymentStatus: 'PAGO' },
      update: { paymentStatus: 'PAGO' },
    })

    if (prisma.adminNotification) {
      await prisma.adminNotification.create({
        data: {
          userId,
          message: `Seu pagamento referente a ${mesNome} de ${year} foi confirmado.`,
        },
      })
    }

    return NextResponse.json({
      ok: true,
      message: emailSent
        ? 'E-mail enviado, pagamento marcado como pago e notificação registrada.'
        : 'E-mail não enviado (SMTP não configurado ou falha). Pagamento marcado como pago e notificação registrada.',
      emailSent,
    })
  } catch (error) {
    console.error('[api/admin/financeiro/administracao/users/[id]/notify-payment POST]', error)
    return NextResponse.json(
      { ok: false, message: 'Erro ao enviar notificação' },
      { status: 500 }
    )
  }
}
