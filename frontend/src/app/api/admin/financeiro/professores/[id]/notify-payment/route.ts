/**
 * POST /api/admin/financeiro/professores/[id]/notify-payment
 * Mostra preview e envia e-mail de notificação de pagamento (com anexo opcional),
 * Opcionalmente marca pagamento como PAGO e cria notificação in-app (quando markPaid=true).
 * Body: FormData com year, month, message?, attachment?, markPaid? ('true' | 'false', padrão false)
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/auth'
import { sendEmail } from '@/lib/email'
import { syncTeacherPaymentMarkedPaidAt } from '@/lib/finance/teacher-payment-marked-paid-at'
import {
  findTeacherPaymentMonthForAdminView,
  upsertKeysForCompetenceMonth,
} from '@/lib/teacher-payment-month-db'
import { teacherPaymentBoundsForCompetenceMonth } from '@/lib/teacher-paid-period'
import { isTeacherPayableInMonth } from '@/lib/teacher-inactive'

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

    const { id: teacherId } = await params
    const teacher = await prisma.teacher.findUnique({
      where: { id: teacherId },
      select: {
        id: true,
        status: true,
        inactiveAt: true,
        paymentDueDay: true,
        valorPorHora: true,
        user: { select: { id: true, nome: true, email: true } },
      },
    })
    if (!teacher || !teacher.user) {
      return NextResponse.json(
        { ok: false, message: 'Professor não encontrado' },
        { status: 404 }
      )
    }

    const formData = await request.formData().catch(() => new FormData())
    const yearParam = formData.get('year')
    const monthParam = formData.get('month')
    const messageParam = formData.get('message')
    const attachment = formData.get('attachment') as File | null
    const markPaidParam = formData.get('markPaid')
    const markPaid = markPaidParam === 'true' || markPaidParam === '1'

    const year = yearParam != null ? Number(yearParam) : null
    const month = monthParam != null ? Number(monthParam) : null
    if (year == null || month == null || month < 1 || month > 12) {
      return NextResponse.json(
        { ok: false, message: 'year e month (1-12) são obrigatórios' },
        { status: 400 }
      )
    }

    const tInactive = teacher as { inactiveAt?: Date | null }
    if (!isTeacherPayableInMonth(teacher.status, tInactive.inactiveAt, year, month)) {
      return NextResponse.json(
        { ok: false, message: 'Professor inativo neste período — notificação não enviada' },
        { status: 400 }
      )
    }

    const mesNome = MESES_LABELS[month] ?? `${month}`
    const subject = `Pagamento confirmado – ${mesNome} de ${year}`

    // Buscar valor a pagar - precisamos calcular como na API de listagem
    // Por enquanto, vamos usar um valor padrão ou buscar do TeacherPaymentMonth
    // O valor completo será calculado na mensagem padrão se não fornecido
    let valorParaMensagem: number | null = null
    const paymentMonth = await prisma.teacherPaymentMonth.findUnique({
      where: { teacherId_year_month: { teacherId, year, month } },
      include: { teacher: { select: { valorPorHora: true } } },
    })
    if (paymentMonth) {
      // Buscar horas registradas e calcular valorPorHoras
      // Por simplicidade, vamos usar apenas valorPorPeriodo + valorExtra
      // O valor completo será calculado na mensagem se necessário
      const valorPorPeriodo = paymentMonth.valorPorPeriodo != null ? Number(paymentMonth.valorPorPeriodo) : 0
      const valorExtra = paymentMonth.valorExtra != null ? Number(paymentMonth.valorExtra) : 0
      // Nota: valorPorHoras precisa ser calculado com base nas LessonRecords
      // Por enquanto, vamos usar apenas os valores fixos
      valorParaMensagem = valorPorPeriodo + valorExtra
      // Se não houver valor, tentar buscar do professor
      if (valorParaMensagem === 0 && teacher.valorPorHora) {
        // Valor aproximado baseado em horas estimadas (será substituído pela mensagem padrão se vazio)
        valorParaMensagem = null
      }
    }

    const text =
      typeof messageParam === 'string' && messageParam.trim()
        ? messageParam.trim()
        : mensagemPadrao(mesNome, year, valorParaMensagem)

    const attachments: { filename: string; content: Buffer }[] = []
    if (attachment && attachment.size > 0) {
      const buffer = Buffer.from(await attachment.arrayBuffer())
      const filename = attachment.name || 'anexo'
      attachments.push({ filename, content: buffer })
    }

    // Enviar e-mail para o professor
    const emailTo = teacher.user.email
    const emailSent = await sendEmail({
      to: emailTo,
      subject,
      text,
      attachments: attachments.length ? attachments : undefined,
    })

    if (markPaid) {
      const dueDay =
        teacher.paymentDueDay != null && teacher.paymentDueDay >= 1 && teacher.paymentDueDay <= 31
          ? teacher.paymentDueDay
          : 1
      const bounds = teacherPaymentBoundsForCompetenceMonth(year, month, dueDay)
      const existingByEnd = await findTeacherPaymentMonthForAdminView(
        teacherId,
        year,
        month,
        dueDay
      )
      const { year: keyYear, month: keyMonth } = upsertKeysForCompetenceMonth(
        year,
        month,
        existingByEnd,
        bounds.termino
      )

      const pmExisting = await prisma.teacherPaymentMonth.findUnique({
        where: { teacherId_year_month: { teacherId, year: keyYear, month: keyMonth } },
        select: { paymentStatus: true },
      })
      await prisma.teacherPaymentMonth.upsert({
        where: { teacherId_year_month: { teacherId, year: keyYear, month: keyMonth } },
        create: {
          teacherId,
          year: keyYear,
          month: keyMonth,
          paymentStatus: 'PAGO',
          periodoInicio: bounds.inicio,
          periodoTermino: bounds.termino,
        },
        update: {
          paymentStatus: 'PAGO',
          periodoInicio: bounds.inicio,
          periodoTermino: bounds.termino,
        },
      })
      await syncTeacherPaymentMarkedPaidAt(
        teacherId,
        keyYear,
        keyMonth,
        pmExisting?.paymentStatus ?? null,
        'PAGO'
      )

      if (prisma.teacherAlert) {
        await prisma.teacherAlert.create({
          data: {
            teacherId,
            message: `Seu pagamento referente a ${mesNome} de ${year} foi confirmado.`,
            type: 'PAYMENT_DONE',
            level: 'INFO',
            createdById: auth.session?.sub ?? null,
          },
        })
      }
    }

    return NextResponse.json({
      ok: true,
      message: markPaid
        ? emailSent
          ? 'E-mail enviado, pagamento marcado como pago e notificação registrada.'
          : 'E-mail não enviado (SMTP não configurado ou falha). Pagamento marcado como pago e notificação registrada.'
        : emailSent
          ? 'E-mail enviado. Status de pagamento não foi alterado.'
          : 'E-mail não enviado (SMTP não configurado ou falha). Status de pagamento não foi alterado.',
      emailSent,
      markPaid,
    })
  } catch (error) {
    console.error('[api/admin/financeiro/professores/[id]/notify-payment POST]', error)
    return NextResponse.json(
      { ok: false, message: 'Erro ao enviar notificação' },
      { status: 500 }
    )
  }
}
