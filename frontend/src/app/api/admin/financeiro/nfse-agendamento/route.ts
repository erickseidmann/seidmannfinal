/**
 * GET    /api/admin/financeiro/nfse-agendamento?enrollmentId=&year=&month=
 * POST   /api/admin/financeiro/nfse-agendamento
 * DELETE /api/admin/financeiro/nfse-agendamento?enrollmentId=&year=&month=
 * Consulta, salva e remove agendamento de NFSe por aluno/mês.
 * Ao agendar: emite a NF na hora e agenda apenas o envio do e-mail para a data/hora escolhida.
 */

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/auth'
import { getEnrollmentFinanceData } from '@/lib/finance'

const querySchema = z.object({
  enrollmentId: z.string(),
  year: z.coerce.number().int().min(2020).max(2100),
  month: z.coerce.number().int().min(1).max(12),
})

const postSchema = z.object({
  enrollmentId: z.string(),
  year: z.number().int().min(2020).max(2100),
  month: z.number().int().min(1).max(12),
  email: z.string().email(),
  faturamentoTipo: z.enum(['ALUNO', 'EMPRESA']),
  empresaRazaoSocial: z.string().optional(),
  empresaCnpj: z.string().optional(),
  empresaEnderecoFiscal: z.string().optional(),
  empresaDescricaoNfse: z.string().optional(), // template {aluno}, {frequencia}, {curso}, {mes}, {ano}
  emailBody: z.string().optional(),
  emailSubject: z.string().optional(),
  nfAttachmentPath: z.string().optional(),
  scheduledFor: z.string(),
  repeatMonthly: z.boolean(),
})

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAdmin(request)
    if (!auth.authorized) {
      return NextResponse.json(
        { ok: false, message: auth.message || 'Não autorizado' },
        { status: auth.message?.includes('Não autenticado') ? 401 : 403 }
      )
    }
    const { searchParams } = new URL(request.url)
    const parsed = querySchema.safeParse({
      enrollmentId: searchParams.get('enrollmentId'),
      year: searchParams.get('year'),
      month: searchParams.get('month'),
    })
    if (!parsed.success) {
      return NextResponse.json(
        { ok: false, message: 'Parâmetros inválidos', details: parsed.error.flatten() },
        { status: 400 }
      )
    }
    const { enrollmentId, year, month } = parsed.data
    const schedule = await prisma.nfseSchedule.findUnique({
      where: {
        enrollmentId_year_month: { enrollmentId, year, month },
      },
    })
    if (schedule) {
      return NextResponse.json({
        ok: true,
        data: {
          id: schedule.id,
          enrollmentId: schedule.enrollmentId,
          year: schedule.year,
          month: schedule.month,
          email: schedule.email,
          faturamentoTipo: schedule.faturamentoTipo,
          empresaRazaoSocial: schedule.empresaRazaoSocial ?? '',
          empresaCnpj: schedule.empresaCnpj ?? '',
          empresaEnderecoFiscal: schedule.empresaEnderecoFiscal ?? '',
          empresaDescricaoNfse: schedule.empresaDescricaoNfse ?? '',
          emailBody: schedule.emailBody ?? '',
          emailSubject: (schedule as { emailSubject?: string | null }).emailSubject ?? '',
          nfAttachmentPath: schedule.nfAttachmentPath ?? '',
          scheduledFor: schedule.scheduledFor.toISOString(),
          repeatMonthly: schedule.repeatMonthly,
        },
      })
    }
    // Não existe agendamento para este mês: buscar o último com repeatMonthly=true para preencher automaticamente
    const anteriores = await prisma.nfseSchedule.findMany({
      where: { enrollmentId, repeatMonthly: true },
      orderBy: [{ year: 'desc' }, { month: 'desc' }],
      take: 12,
    })
    const anterior = anteriores.find(
      (s) => s.year < year || (s.year === year && s.month < month)
    )
    if (!anterior) {
      return NextResponse.json({ ok: true, data: null })
    }
    // Mesmo dia do mês e mesmo horário, no mês solicitado
    const d = anterior.scheduledFor
    const scheduledForNew = new Date(Date.UTC(year, month - 1, d.getUTCDate(), d.getUTCHours(), d.getUTCMinutes(), 0, 0))
    return NextResponse.json({
      ok: true,
      data: {
        id: null,
        enrollmentId,
        year,
        month,
        email: anterior.email,
        faturamentoTipo: anterior.faturamentoTipo,
        empresaRazaoSocial: anterior.empresaRazaoSocial ?? '',
        empresaCnpj: anterior.empresaCnpj ?? '',
        empresaEnderecoFiscal: anterior.empresaEnderecoFiscal ?? '',
        empresaDescricaoNfse: anterior.empresaDescricaoNfse ?? '',
        emailBody: anterior.emailBody ?? '',
        emailSubject: (anterior as { emailSubject?: string | null }).emailSubject ?? '',
        nfAttachmentPath: anterior.nfAttachmentPath ?? '',
        scheduledFor: scheduledForNew.toISOString(),
        repeatMonthly: true,
      },
      fromRepeat: true,
    })
  } catch (error) {
    console.error('[api/admin/financeiro/nfse-agendamento GET]', error)
    return NextResponse.json(
      { ok: false, message: 'Erro ao consultar agendamento' },
      { status: 500 }
    )
  }
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
    const body = await request.json().catch(() => ({}))
    const parsed = postSchema.safeParse({
      ...body,
      repeatMonthly: body.repeatMonthly === true,
    })
    if (!parsed.success) {
      return NextResponse.json(
        { ok: false, message: 'Dados inválidos', details: parsed.error.flatten() },
        { status: 400 }
      )
    }
    const {
      enrollmentId,
      year,
      month,
      email,
      faturamentoTipo,
      empresaRazaoSocial,
      empresaCnpj,
      empresaEnderecoFiscal,
      empresaDescricaoNfse,
      emailBody,
      emailSubject,
      nfAttachmentPath,
      scheduledFor,
      repeatMonthly,
    } = parsed.data
    // Como a NF não é mais gerada automaticamente por aqui, não exigimos Razão Social/CNPJ no agendamento.
    const scheduledForDate = new Date(scheduledFor)
    if (isNaN(scheduledForDate.getTime())) {
      return NextResponse.json(
        { ok: false, message: 'Data inválida' },
        { status: 400 }
      )
    }
    const now = new Date()
    if (scheduledForDate.getTime() <= now.getTime()) {
      return NextResponse.json(
        { ok: false, message: 'A data e horário para envio da NF devem ser no futuro.' },
        { status: 400 }
      )
    }

    const emailBodyVal = typeof emailBody === 'string' ? emailBody.trim() || null : null
    const emailSubjectVal = typeof emailSubject === 'string' ? emailSubject.trim() || null : null
    const empresaRazaoVal = typeof empresaRazaoSocial === 'string' ? empresaRazaoSocial.trim() || null : null
    const empresaCnpjVal = typeof empresaCnpj === 'string' ? empresaCnpj.replace(/\D/g, '').slice(0, 14) || null : null
    const empresaEnderecoVal = typeof empresaEnderecoFiscal === 'string' ? empresaEnderecoFiscal.trim() || null : null
    const empresaDescricaoVal = typeof empresaDescricaoNfse === 'string' ? empresaDescricaoNfse.trim() || null : null
    await prisma.nfseSchedule.upsert({
      where: {
        enrollmentId_year_month: { enrollmentId, year, month },
      },
      create: {
        enrollmentId,
        year,
        month,
        email: email.trim().toLowerCase(),
        faturamentoTipo,
        empresaRazaoSocial: empresaRazaoVal,
        empresaCnpj: faturamentoTipo === 'EMPRESA' ? empresaCnpjVal : null,
        empresaEnderecoFiscal: faturamentoTipo === 'EMPRESA' ? empresaEnderecoVal : null,
        empresaDescricaoNfse: faturamentoTipo === 'EMPRESA' ? empresaDescricaoVal : null,
        emailBody: emailBodyVal,
        emailSubject: emailSubjectVal,
        nfAttachmentPath: nfAttachmentPath ?? null,
        scheduledFor: scheduledForDate,
        repeatMonthly,
      },
      update: {
        email: email.trim().toLowerCase(),
        faturamentoTipo,
        empresaRazaoSocial: empresaRazaoVal,
        empresaCnpj: faturamentoTipo === 'EMPRESA' ? empresaCnpjVal : null,
        empresaEnderecoFiscal: faturamentoTipo === 'EMPRESA' ? empresaEnderecoVal : null,
        empresaDescricaoNfse: faturamentoTipo === 'EMPRESA' ? empresaDescricaoVal : null,
        emailBody: emailBodyVal,
        emailSubject: emailSubjectVal,
        nfAttachmentPath: nfAttachmentPath ?? null,
        scheduledFor: scheduledForDate,
        repeatMonthly,
      },
    })
    return NextResponse.json({
      ok: true,
      message: 'Agendamento salvo. Um e-mail de lembrete será enviado na data/hora escolhidas para a equipe enviar a NF manualmente.',
    })
  } catch (error) {
    console.error('[api/admin/financeiro/nfse-agendamento POST]', error)
    return NextResponse.json(
      { ok: false, message: 'Erro ao salvar agendamento' },
      { status: 500 }
    )
  }
}

/** Remove o agendamento de envio de e-mail da NF para o aluno/mês. A NF já emitida permanece. */
export async function DELETE(request: NextRequest) {
  try {
    const auth = await requireAdmin(request)
    if (!auth.authorized) {
      return NextResponse.json(
        { ok: false, message: auth.message || 'Não autorizado' },
        { status: auth.message?.includes('Não autenticado') ? 401 : 403 }
      )
    }
    const { searchParams } = new URL(request.url)
    const parsed = querySchema.safeParse({
      enrollmentId: searchParams.get('enrollmentId'),
      year: searchParams.get('year'),
      month: searchParams.get('month'),
    })
    if (!parsed.success) {
      return NextResponse.json(
        { ok: false, message: 'Parâmetros inválidos', details: parsed.error.flatten() },
        { status: 400 }
      )
    }
    const { enrollmentId, year, month } = parsed.data
    const deleted = await prisma.nfseSchedule.deleteMany({
      where: { enrollmentId, year, month },
    })
    if (deleted.count === 0) {
      return NextResponse.json(
        { ok: false, message: 'Nenhum agendamento encontrado para este aluno/mês' },
        { status: 404 }
      )
    }
    return NextResponse.json({
      ok: true,
      message: 'Agendamento cancelado. O e-mail não será enviado na data agendada.',
    })
  } catch (error) {
    console.error('[api/admin/financeiro/nfse-agendamento DELETE]', error)
    return NextResponse.json(
      { ok: false, message: 'Erro ao cancelar agendamento' },
      { status: 500 }
    )
  }
}
