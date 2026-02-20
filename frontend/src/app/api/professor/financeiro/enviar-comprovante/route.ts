/**
 * POST /api/professor/financeiro/enviar-comprovante
 * Professor envia nota fiscal ou recibo (anexo) para financeiro@seidmanninstitute.com.
 * Após enviar, marca proofSentAt no TeacherPaymentMonth para o período, permitindo clicar em "Confirmar valor a receber".
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireTeacher } from '@/lib/auth'
import { sendEmail, mensagemNotaFiscalRecibo } from '@/lib/email'
import { logFinanceAction } from '@/lib/finance'

const EMAIL_FINANCEIRO = 'financeiro@seidmanninstitute.com'
const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10 MB
const ALLOWED_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
]

export async function POST(request: NextRequest) {
  try {
    const auth = await requireTeacher(request)
    if (!auth.authorized || !auth.session) {
      return NextResponse.json(
        { ok: false, message: auth.message || 'Não autorizado' },
        { status: auth.message?.includes('Não autenticado') ? 401 : 403 }
      )
    }

    const teacher = await prisma.teacher.findFirst({
      where: { userId: auth.session.userId },
      select: { id: true, nome: true },
    })
    if (!teacher) {
      return NextResponse.json(
        { ok: false, message: 'Professor não encontrado' },
        { status: 404 }
      )
    }

    const formData = await request.formData()
    const yearParam = formData.get('year')
    const monthParam = formData.get('month')
    const file = formData.get('file') as File | null
    const mensagem = (formData.get('mensagem') as string)?.trim() || null

    const year = yearParam != null ? parseInt(String(yearParam), 10) : null
    const month = monthParam != null ? parseInt(String(monthParam), 10) : null

    if (year == null || month == null || month < 1 || month > 12) {
      return NextResponse.json(
        { ok: false, message: 'Ano e mês são obrigatórios e válidos' },
        { status: 400 }
      )
    }

    if (!file || !(file instanceof Blob) || file.size === 0) {
      return NextResponse.json(
        { ok: false, message: 'Anexe o comprovante (nota fiscal ou recibo)' },
        { status: 400 }
      )
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { ok: false, message: 'Arquivo muito grande. Máximo 10 MB.' },
        { status: 400 }
      )
    }

    const type = file.type?.toLowerCase()
    if (type && !ALLOWED_TYPES.includes(type)) {
      return NextResponse.json(
        { ok: false, message: 'Formato não permitido. Use PDF ou imagem (JPG, PNG, GIF, WebP).' },
        { status: 400 }
      )
    }

    const buffer = Buffer.from(await file.arrayBuffer())
    const filename = file.name?.replace(/[^a-zA-Z0-9._-]/g, '_') || 'comprovante.pdf'

    const { subject, text } = mensagemNotaFiscalRecibo({
      nomeProfessor: teacher.nome,
      year,
      month,
      mensagemOpcional: mensagem,
    })

    const sent = await sendEmail({
      to: EMAIL_FINANCEIRO,
      subject,
      text,
      attachments: [{ filename, content: buffer }],
    })

    if (!sent) {
      return NextResponse.json(
        { ok: false, message: 'Não foi possível enviar o e-mail. Tente novamente ou entre em contato com o suporte.' },
        { status: 500 }
      )
    }

    await prisma.teacherPaymentMonth.upsert({
      where: {
        teacherId_year_month: { teacherId: teacher.id, year, month },
      },
      create: {
        teacherId: teacher.id,
        year,
        month,
        proofSentAt: new Date(),
      },
      update: {
        proofSentAt: new Date(),
      },
    })

    logFinanceAction({
      entityType: 'TEACHER',
      entityId: teacher.id,
      action: 'PROOF_SENT',
      performedBy: auth.session?.userId ?? null,
      metadata: { year, month },
    })

    return NextResponse.json({
      ok: true,
      data: { message: 'Comprovante enviado com sucesso. Agora você pode confirmar o valor a receber.' },
    })
  } catch (error) {
    console.error('[api/professor/financeiro/enviar-comprovante] Erro:', error)
    return NextResponse.json(
      { ok: false, message: 'Erro ao enviar comprovante' },
      { status: 500 }
    )
  }
}
