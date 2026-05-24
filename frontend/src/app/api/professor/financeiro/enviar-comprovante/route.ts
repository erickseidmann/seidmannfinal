/**
 * POST /api/professor/financeiro/enviar-comprovante
 * Professor anexa nota fiscal ou recibo no sistema.
 * Após anexar, marca proofSentAt no TeacherPaymentMonth para o período, permitindo clicar em "Confirmar valor a receber".
 */

import { mkdir, writeFile } from 'fs/promises'
import { join } from 'path'
import { randomUUID } from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireTeacher } from '@/lib/auth'
import { logFinanceAction } from '@/lib/finance'
import { resolveTeacherProofTargetMonthKey } from '@/lib/teacher-payment-month-resolve'
import { validarJanelaEnvioNf } from '@/lib/finance/teacher-nf-window'

const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10 MB
const ALLOWED_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
]

function sanitizeFileName(name: string): string {
  return name
    .replace(/[/\\:*?"<>|]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function getExtension(filename: string): string {
  const i = filename.lastIndexOf('.')
  if (i <= 0) return ''
  return filename.slice(i)
}

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

    const bodyYear = yearParam != null ? parseInt(String(yearParam), 10) : null
    const bodyMonth = monthParam != null ? parseInt(String(monthParam), 10) : null

    if (bodyYear == null || bodyMonth == null || bodyMonth < 1 || bodyMonth > 12) {
      return NextResponse.json(
        { ok: false, message: 'Ano e mês são obrigatórios e válidos' },
        { status: 400 }
      )
    }

    const now = new Date()

    // 1) Valida PRIMEIRO a janela de envio usando o mês selecionado pelo
    //    usuário (mesma lógica que o frontend usa para mostrar/esconder o
    //    botão). Carrega feriados do mês selecionado e do mês civil corrente.
    const monthKeysToFetch = new Set<string>()
    monthKeysToFetch.add(`${bodyYear}-${String(bodyMonth).padStart(2, '0')}`)
    monthKeysToFetch.add(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`)
    const holidayRows = await prisma.holiday.findMany({
      where: {
        OR: [...monthKeysToFetch].map((k) => ({ dateKey: { startsWith: k } })),
      },
      select: { dateKey: true },
    })
    const holidaySet = new Set(holidayRows.map((h) => h.dateKey))

    const janela = validarJanelaEnvioNf({
      year: bodyYear,
      month: bodyMonth,
      now,
      holidaySet,
    })
    if (!janela.ok) {
      return NextResponse.json(
        {
          ok: false,
          message: janela.mensagem,
          data: {
            dataPagamento: janela.dataPagamento.toISOString(),
            dataLimite: janela.dataLimite.toISOString(),
            motivo: janela.motivo,
          },
        },
        { status: 400 }
      )
    }

    // 2) Resolve em qual TeacherPaymentMonth gravar o proof.
    //    - se o (bodyYear, bodyMonth) está em AGUARDANDO_REENVIO → usa o do body;
    //    - senão, usa o TPM cujo periodoInicio…periodoTermino contém "agora"
    //      (mês de pagamento ativo);
    //    - fallback: o que veio do body.
    //    Isso pode ser DIFERENTE do (bodyYear, bodyMonth) — por exemplo, para
    //    professores pagos dia 1, ao selecionar Maio na tela o registro a
    //    atualizar é month=6 (pagamento de 01/06 referente à competência de Maio).
    const target = await resolveTeacherProofTargetMonthKey(
      teacher.id,
      bodyYear,
      bodyMonth,
      now
    )
    const { year, month } = target

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

    const ext = getExtension(file.name) || '.bin'
    const safeTeacher = sanitizeFileName(teacher.nome).toLowerCase().replace(/\s+/g, '-')
    const filename = `${safeTeacher}-${year}-${String(month).padStart(2, '0')}-${randomUUID()}${ext}`
    const dir = join(process.cwd(), 'public', 'uploads', 'teacher-proofs')
    await mkdir(dir, { recursive: true })
    const fullPath = join(dir, filename)
    const buffer = Buffer.from(await file.arrayBuffer())
    await writeFile(fullPath, buffer)
    const fileUrl = `/uploads/teacher-proofs/${filename}`

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

    const pmAfter = await prisma.teacherPaymentMonth.findUnique({
      where: { teacherId_year_month: { teacherId: teacher.id, year, month } },
      select: { paymentStatus: true },
    })
    if (pmAfter?.paymentStatus === 'AGUARDANDO_REENVIO') {
      // Mantém a regra de negócio de reabertura para reenvio: após novo upload,
      // o mês resolvido volta para EM_ABERTO para seguir o fluxo normal.
      await prisma.teacherPaymentMonth.update({
        where: { teacherId_year_month: { teacherId: teacher.id, year, month } },
        data: { paymentStatus: 'EM_ABERTO' },
      })
    }

    logFinanceAction({
      entityType: 'TEACHER',
      entityId: teacher.id,
      action: 'PROOF_SENT',
      performedBy: auth.session?.userId ?? null,
      metadata: {
        year,
        month,
        bodyYear,
        bodyMonth,
        resolvedFromBody: year === bodyYear && month === bodyMonth,
        fileUrl,
        mensagem,
      },
    })

    return NextResponse.json({
      ok: true,
      data: {
        message: 'Comprovante anexado no sistema com sucesso. Agora você pode confirmar o valor a receber.',
        fileUrl,
        year,
        month,
      },
    })
  } catch (error) {
    console.error('[api/professor/financeiro/enviar-comprovante] Erro:', error)
    return NextResponse.json(
      { ok: false, message: 'Erro ao enviar comprovante' },
      { status: 500 }
    )
  }
}
