/**
 * POST /api/admin/financeiro/administracao/users/[id]/notify-payment
 * Mostra preview e envia e-mail de notificação de pagamento (com anexo opcional),
 * marca pagamento como PAGO e cria notificação in-app.
 * Body: FormData com year, month, message? (texto da mensagem), attachment? (arquivo), receiptUrl? (url salva no sistema)
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/auth'
import { sendEmail } from '@/lib/email'
import { markLinkedTeacherPaidForAdminCompetenceMonth } from '@/lib/finance/sync-linked-teacher-paid-from-admin'

const SUPER_ADMIN_EMAIL = 'admin@seidmann.com'
const MESES_LABELS: Record<number, string> = {
  1: 'Janeiro', 2: 'Fevereiro', 3: 'Março', 4: 'Abril', 5: 'Maio', 6: 'Junho',
  7: 'Julho', 8: 'Agosto', 9: 'Setembro', 10: 'Outubro', 11: 'Novembro', 12: 'Dezembro',
}

function formatValor(valor: number | null | undefined): string {
  if (valor == null) return '--'
  return Number(valor).toFixed(2).replace('.', ',')
}

function mensagemPadrao(
  mesNome: string,
  year: number,
  valorTotal: number | null | undefined,
  detalhe?: { adm: number; aulas: number }
): string {
  const totalStr = formatValor(valorTotal)
  let corpo = `Informamos que o pagamento referente à prestação de serviços de ${mesNome} de ${year} foi confirmado.\n`
  if (detalhe) {
    corpo += `\nSalário administrativo: R$ ${formatValor(detalhe.adm)}\n`
    corpo += `Pagamento de aulas (professor): R$ ${formatValor(detalhe.aulas)}\n`
    corpo += `\nTotal: R$ ${totalStr}.\n`
  } else {
    corpo += `\nO valor é de R$ ${totalStr}.\n`
  }
  return `Olá,

${corpo}
Em caso de dúvidas, entre em contato com a gestão financeira.

Atenciosamente,
Equipe Seidmann Institute`
}

async function effectiveAdminValor(userId: string, year: number, month: number): Promise<number> {
  const pm = await prisma.adminUserPaymentMonth.findUnique({
    where: { userId_year_month: { userId, year, month } },
    select: { valor: true },
  })
  if (pm?.valor != null) return Number(pm.valor)
  const prev = await prisma.adminUserPaymentMonth.findFirst({
    where: {
      userId,
      OR: [{ year: { lt: year } }, { year, month: { lt: month } }],
    },
    orderBy: [{ year: 'desc' }, { month: 'desc' }],
    select: { valor: true },
  })
  return prev?.valor != null ? Number(prev.valor) : 0
}

async function fetchValorAulasProfessor(
  request: NextRequest,
  teacherId: string,
  year: number,
  month: number
): Promise<number> {
  try {
    const origin = request.nextUrl.origin
    const cookie = request.headers.get('cookie') ?? ''
    const res = await fetch(`${origin}/api/admin/financeiro/professores?year=${year}&month=${month}`, {
      headers: { cookie },
      cache: 'no-store',
    })
    const json = await res.json()
    if (!json.ok || !Array.isArray(json.data?.professores)) return 0
    const p = json.data.professores.find((x: { id: string }) => x.id === teacherId)
    return typeof p?.valorAPagar === 'number' ? p.valorAPagar : 0
  } catch {
    return 0
  }
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
      select: { id: true, nome: true, email: true, emailPessoal: true, linkedTeacherId: true },
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
    const receiptUrlParam = formData.get('receiptUrl')
    const attachment = formData.get('attachment') as File | null
    const receiptUrlVal =
      typeof receiptUrlParam === 'string' && receiptUrlParam.trim().startsWith('/uploads/')
        ? receiptUrlParam.trim()
        : null


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

    const valorAdm = prisma.adminUserPaymentMonth ? await effectiveAdminValor(userId, year, month) : 0
    let valorAulas = 0
    if (user.linkedTeacherId) {
      valorAulas = await fetchValorAulasProfessor(request, user.linkedTeacherId, year, month)
    }
    const valorTotal = Math.round((valorAdm + valorAulas) * 100) / 100
    const detalheEmail = user.linkedTeacherId ? { adm: valorAdm, aulas: valorAulas } : undefined

    const text =
      typeof messageParam === 'string' && messageParam.trim()
        ? messageParam.trim()
        : mensagemPadrao(mesNome, year, valorTotal, detalheEmail)

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
      create: {
        userId,
        year,
        month,
        valor: null,
        paymentStatus: 'PAGO',
        paidAt: new Date(),
        receiptUrl: receiptUrlVal,
        notificationSentAt: new Date(),
      },
      update: {
        paymentStatus: 'PAGO',
        paidAt: new Date(),
        notificationSentAt: new Date(),
        ...(receiptUrlVal ? { receiptUrl: receiptUrlVal } : {}),
      },
    })

    if (user.linkedTeacherId) {
      await markLinkedTeacherPaidForAdminCompetenceMonth({
        teacherId: user.linkedTeacherId,
        competenceYear: year,
        competenceMonth: month,
        performedByUserId: auth.session?.sub ?? null,
      })
    }

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
