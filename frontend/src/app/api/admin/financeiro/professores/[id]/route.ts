/**
 * PATCH /api/admin/financeiro/professores/[id]
 * Atualiza status, valores e período do professor para um mês/ano (TeacherPaymentMonth).
 * Também atualiza Teacher quando metodoPagamento ou infosPagamento são enviados.
 * Body: year, month, paymentStatus?, valorPorPeriodo?, valorExtra?, periodoInicio?, periodoTermino?, metodoPagamento?, infosPagamento?
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/auth'

export async function PATCH(
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

    const teacherId = params.id
    const teacher = await prisma.teacher.findUnique({
      where: { id: teacherId },
    })
    if (!teacher) {
      return NextResponse.json(
        { ok: false, message: 'Professor não encontrado' },
        { status: 404 }
      )
    }

    const body = await request.json().catch(() => ({}))
    const {
      year: bodyYear,
      month: bodyMonth,
      paymentStatus,
      valorPorPeriodo,
      valorExtra,
      periodoInicio,
      periodoTermino,
      metodoPagamento,
      infosPagamento,
    } = body

    const year = bodyYear != null ? Number(bodyYear) : null
    const month = bodyMonth != null ? Number(bodyMonth) : null
    if (year == null || month == null || month < 1 || month > 12) {
      return NextResponse.json(
        { ok: false, message: 'year e month são obrigatórios (month 1-12)' },
        { status: 400 }
      )
    }

    if (metodoPagamento !== undefined || infosPagamento !== undefined) {
      const teacherUpdate: { metodoPagamento?: string | null; infosPagamento?: string | null } = {}
      if (metodoPagamento !== undefined) {
        teacherUpdate.metodoPagamento = typeof metodoPagamento === 'string' ? metodoPagamento.trim() || null : null
      }
      if (infosPagamento !== undefined) {
        teacherUpdate.infosPagamento = typeof infosPagamento === 'string' ? infosPagamento.trim() || null : null
      }
      if (Object.keys(teacherUpdate).length > 0) {
        await prisma.teacher.update({
          where: { id: teacherId },
          data: teacherUpdate,
        })
      }
    }

    const updateData: {
      paymentStatus?: string | null
      valorPorPeriodo?: number | null
      valorExtra?: number | null
      periodoInicio?: Date | null
      periodoTermino?: Date | null
    } = {}
    if (paymentStatus !== undefined) {
      updateData.paymentStatus = paymentStatus === 'PAGO' ? 'PAGO' : 'EM_ABERTO'
    }
    if (valorPorPeriodo !== undefined) {
      updateData.valorPorPeriodo = valorPorPeriodo != null && valorPorPeriodo !== '' ? Number(valorPorPeriodo) : null
    }
    if (valorExtra !== undefined) {
      updateData.valorExtra = valorExtra != null && valorExtra !== '' ? Number(valorExtra) : null
    }
    if (periodoInicio !== undefined) {
      updateData.periodoInicio = periodoInicio ? new Date(periodoInicio) : null
    }
    if (periodoTermino !== undefined) {
      updateData.periodoTermino = periodoTermino ? new Date(periodoTermino) : null
    }

    if (Object.keys(updateData).length === 0 && (metodoPagamento === undefined && infosPagamento === undefined)) {
      return NextResponse.json({ ok: true, message: 'Nada a atualizar' })
    }

    const wasMarkedAsPaid =
      paymentStatus === 'PAGO' && updateData.paymentStatus === 'PAGO'

    if (Object.keys(updateData).length > 0) {
      const existing = await prisma.teacherPaymentMonth.findUnique({
        where: { teacherId_year_month: { teacherId, year, month } },
      })
      const previousStatus = existing?.paymentStatus

      await prisma.teacherPaymentMonth.upsert({
        where: {
          teacherId_year_month: { teacherId, year, month },
        },
        create: {
          teacherId,
          year,
          month,
          paymentStatus: updateData.paymentStatus ?? null,
          valorPorPeriodo: updateData.valorPorPeriodo ?? null,
          valorExtra: updateData.valorExtra ?? null,
          periodoInicio: updateData.periodoInicio ?? null,
          periodoTermino: updateData.periodoTermino ?? null,
        },
        update: updateData,
      })

      // Notificar o professor quando o pagamento for marcado como Pago
      if (wasMarkedAsPaid && previousStatus !== 'PAGO' && prisma.teacherAlert) {
        const MESES_NOMES: Record<number, string> = {
          1: 'janeiro', 2: 'fevereiro', 3: 'março', 4: 'abril', 5: 'maio', 6: 'junho',
          7: 'julho', 8: 'agosto', 9: 'setembro', 10: 'outubro', 11: 'novembro', 12: 'dezembro',
        }
        const mesNome = MESES_NOMES[month] || String(month)
        const message = `Seu pagamento referente a ${mesNome}/${year} foi realizado.`
        await prisma.teacherAlert.create({
          data: {
            teacherId,
            message,
            type: 'PAYMENT_DONE',
            level: 'INFO',
            createdById: auth.session?.sub ?? null,
          },
        })
      }
    }

    return NextResponse.json({ ok: true, message: 'Dados atualizados' })
  } catch (error) {
    console.error('[api/admin/financeiro/professores/[id] PATCH]', error)
    return NextResponse.json(
      { ok: false, message: 'Erro ao atualizar dados do professor' },
      { status: 500 }
    )
  }
}
