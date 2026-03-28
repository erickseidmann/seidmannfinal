/**
 * POST /api/admin/financeiro/professores/[id]/reject-proof
 * Admin informa problema na NF/recibo: limpa anexo no mês, registra auditoria,
 * notifica o professor e define paymentStatus = AGUARDANDO_REENVIO.
 * Body JSON: { year, month }
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/auth'
import { logFinanceAction } from '@/lib/finance'
import { z } from 'zod'

const bodySchema = z.object({
  year: z.number().int().min(2000).max(2100),
  month: z.number().int().min(1).max(12),
})

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
      select: { id: true, nome: true },
    })
    if (!teacher) {
      return NextResponse.json({ ok: false, message: 'Professor não encontrado' }, { status: 404 })
    }

    const json = await request.json().catch(() => ({}))
    const parsed = bodySchema.safeParse(json)
    if (!parsed.success) {
      return NextResponse.json(
        { ok: false, message: 'year e month (1–12) são obrigatórios' },
        { status: 400 }
      )
    }
    const { year, month } = parsed.data

    const rangeStart = new Date(Date.UTC(year, month - 1, 1))
    const rangeEnd = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999))
    const existingByEnd = await prisma.teacherPaymentMonth.findFirst({
      where: {
        teacherId,
        periodoTermino: { gte: rangeStart, lte: rangeEnd },
      },
    })
    const keyYear = existingByEnd?.year ?? year
    const keyMonth = existingByEnd?.month ?? month

    await prisma.teacherPaymentMonth.upsert({
      where: { teacherId_year_month: { teacherId, year: keyYear, month: keyMonth } },
      create: {
        teacherId,
        year: keyYear,
        month: keyMonth,
        proofSentAt: null,
        paymentStatus: 'AGUARDANDO_REENVIO',
      },
      update: {
        proofSentAt: null,
        paymentStatus: 'AGUARDANDO_REENVIO',
      },
    })

    await logFinanceAction({
      entityType: 'TEACHER',
      entityId: teacherId,
      action: 'PROOF_REJECTED',
      performedBy: auth.session?.sub ?? null,
      metadata: { year, month },
    })

    const MESES: Record<number, string> = {
      1: 'janeiro',
      2: 'fevereiro',
      3: 'março',
      4: 'abril',
      5: 'maio',
      6: 'junho',
      7: 'julho',
      8: 'agosto',
      9: 'setembro',
      10: 'outubro',
      11: 'novembro',
      12: 'dezembro',
    }
    const mesNome = MESES[month] ?? String(month)
    const message = `Há um problema com sua nota fiscal ou recibo referente a ${mesNome}/${year}. Acesse Financeiro e anexe novamente o arquivo correto.`

    if (prisma.teacherAlert) {
      await prisma.teacherAlert.create({
        data: {
          teacherId,
          message,
          type: 'PROOF_RESEND_NEEDED',
          level: 'WARN',
          createdById: auth.session?.sub ?? null,
        },
      })
    }

    return NextResponse.json({
      ok: true,
      message: 'Professor notificado para anexar novamente o comprovante.',
    })
  } catch (error) {
    console.error('[api/admin/financeiro/professores/[id]/reject-proof POST]', error)
    return NextResponse.json({ ok: false, message: 'Erro ao registrar rejeição do comprovante' }, { status: 500 })
  }
}
