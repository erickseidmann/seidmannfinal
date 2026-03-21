/**
 * POST /api/admin/financeiro/boletos-e-lembretes
 * Gera boleto/PIX na Cora para todos os alunos do mês (exceto método cartão) e envia e-mail de lembrete.
 * O e-mail inclui aviso: "Se você já realizou o pagamento, desconsidere este e-mail."
 */

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/auth'
import { getEnrollmentFinanceData } from '@/lib/finance'
import { sendEmail, lembretePagamentoContent } from '@/lib/email'
import { generateMonthlyBilling } from '@/lib/cora/billing'

const bodySchema = z.object({
  year: z.number().int().min(2020).max(2100),
  month: z.number().int().min(1).max(12),
})

function isCartao(metodoPagamento: string | null, paymentInfoMetodo: string | null): boolean {
  const m = (metodoPagamento ?? '').toUpperCase().trim()
  const p = (paymentInfoMetodo ?? '').toUpperCase().trim()
  return m === 'CARTAO' || p === 'CARTAO' || m === 'CARTÃO' || p === 'CARTÃO'
}

/** Próxima data de vencimento dado o dia do mês (1-31). */
function nextDueDateFromDay(dayOfMonth: number, year: number, month: number): Date {
  const lastDay = new Date(year, month, 0).getDate()
  const day = Math.min(dayOfMonth, lastDay)
  return new Date(year, month - 1, day)
}


export async function POST(request: NextRequest) {
  try {
    const auth = await requireAdmin(request)
    if (!auth.authorized) {
      return NextResponse.json(
        { ok: false, message: auth.message || 'Não autorizado' },
        { status: auth.message?.includes('Não autenticado') ? 401 : 403 }
      )
    }

    const hasCert = !!(process.env.CORA_CERT_PATH || process.env.CORA_CERTIFICATE_PATH)
    const hasKey = !!(process.env.CORA_KEY_PATH || process.env.CORA_PRIVATE_KEY_PATH)
    if (!process.env.CORA_CLIENT_ID || !hasCert || !hasKey) {
      return NextResponse.json(
        { ok: false, message: 'Cora não configurada. Configure certificados e CORA_CLIENT_ID.' },
        { status: 503 }
      )
    }

    const body = await request.json().catch(() => ({}))
    const parsed = bodySchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { ok: false, message: 'Dados inválidos. Envie year e month.' },
        { status: 400 }
      )
    }
    const { year, month } = parsed.data
    const performedBy = auth.session?.sub ?? 'SYSTEM'

    const enrollments = await prisma.enrollment.findMany({
      where: {
        status: 'ACTIVE',
        OR: [
          { valorMensalidade: { not: null } },
          { paymentInfo: { valorMensal: { not: null } } },
        ],
      },
      include: {
        paymentInfo: true,
        user: { select: { email: true } },
      },
    })

    const paidRecords = await prisma.enrollmentPaymentMonth.findMany({
      where: { year, month, paymentStatus: 'PAGO' },
      select: { enrollmentId: true },
    })
    const paidSet = new Set(paidRecords.map((r) => r.enrollmentId))

    const existingInvoices = await prisma.coraInvoice.findMany({
      where: { year, month },
      select: { enrollmentId: true },
    })
    const invoiceSet = new Set(existingInvoices.map((r) => r.enrollmentId))

    const toProcess = enrollments.filter((e) => {
      if ((e as { bolsista?: boolean | null }).bolsista) return false
      // Não gerar boleto/PIX para alunos faturados em nome de EMPRESA
      const faturamentoTipo = (e as { faturamentoTipo?: string | null }).faturamentoTipo ?? 'ALUNO'
      if (faturamentoTipo === 'EMPRESA') return false

      // Não gerar cobrança para quem paga com cartão
      if (isCartao((e as { metodoPagamento?: string | null }).metodoPagamento ?? null, e.paymentInfo?.metodo ?? null)) return false

      // Não gerar cobrança para quem já está marcado como PAGO no mês
      if (paidSet.has(e.id)) return false

      return true
    })

    const boletoErrors: Array<{ name: string; error: string }> = []
    const enrollmentIdsWithBoleto: string[] = []

    for (const enrollment of toProcess) {
      if (invoiceSet.has(enrollment.id)) {
        enrollmentIdsWithBoleto.push(enrollment.id)
        continue
      }
      try {
        await generateMonthlyBilling({
          enrollmentId: enrollment.id,
          year,
          month,
          performedBy,
        })
        enrollmentIdsWithBoleto.push(enrollment.id)
        invoiceSet.add(enrollment.id)
      } catch (error) {
        boletoErrors.push({
          name: enrollment.nome,
          error: error instanceof Error ? error.message : String(error),
        })
      }
    }

    // Buscar links do boleto e PIX para incluir no e-mail de lembrete
    const coraInvoices = await prisma.coraInvoice.findMany({
      where: {
        enrollmentId: { in: enrollmentIdsWithBoleto },
        year,
        month,
      },
      select: {
        enrollmentId: true,
        boletoUrl: true,
        digitableLine: true,
        pixCopyPaste: true,
        pixQrCode: true,
      },
    })
    const invoiceByEnrollment = new Map(
      coraInvoices.map((inv) => [
        inv.enrollmentId,
        {
          boletoUrl: inv.boletoUrl ?? null,
          boletoDigitableLine: inv.digitableLine ?? null,
          pixEmv: inv.pixCopyPaste ?? null,
          pixQrCodeUrl: inv.pixQrCode ?? null,
        },
      ])
    )

    let emailsEnviados = 0
    const emailErrors: Array<{ name: string; error: string }> = []

    for (const enrollmentId of enrollmentIdsWithBoleto) {
      const enrollment = await prisma.enrollment.findUnique({
        where: { id: enrollmentId },
        include: { paymentInfo: true, user: { select: { email: true } } },
      })
      if (!enrollment) continue
      const finance = getEnrollmentFinanceData(enrollment)
      const email = finance.email?.trim()
      if (!email) continue

      const valorMensal = Number(enrollment.valorMensalidade ?? enrollment.paymentInfo?.valorMensal ?? 0)
      const valorStr = valorMensal > 0 ? `R$ ${valorMensal.toFixed(2).replace('.', ',')}` : 'conforme combinado'
      const dia = enrollment.diaPagamento ?? enrollment.paymentInfo?.dueDay ?? 10
      const vencimento = nextDueDateFromDay(dia, year, month)
      const vencimentoStr = vencimento.toLocaleDateString('pt-BR')

      const paymentData = invoiceByEnrollment.get(enrollmentId)
      const { subject, text, html } = lembretePagamentoContent({
        nome: finance.nome,
        valorStr,
        vencimentoStr,
        boletoUrl: paymentData?.boletoUrl ?? null,
        boletoDigitableLine: paymentData?.boletoDigitableLine ?? null,
        pixEmv: paymentData?.pixEmv ?? null,
        pixQrCodeUrl: paymentData?.pixQrCodeUrl ?? null,
      })
      try {
        const sent = await sendEmail({ to: email, subject, text, html })
        if (sent) emailsEnviados++
      } catch (err) {
        emailErrors.push({
          name: enrollment.nome,
          error: err instanceof Error ? err.message : String(err),
        })
      }
    }

    return NextResponse.json({
      ok: true,
      boletosGerados: enrollmentIdsWithBoleto.length - boletoErrors.length,
      boletosErros: boletoErrors.length,
      emailsEnviados,
      emailsErros: emailErrors.length,
      errors: boletoErrors.length > 0 ? boletoErrors : undefined,
      emailErrors: emailErrors.length > 0 ? emailErrors : undefined,
    })
  } catch (error) {
    console.error('[api/admin/financeiro/boletos-e-lembretes POST]', error)
    return NextResponse.json(
      { ok: false, message: error instanceof Error ? error.message : 'Erro ao processar' },
      { status: 500 }
    )
  }
}
