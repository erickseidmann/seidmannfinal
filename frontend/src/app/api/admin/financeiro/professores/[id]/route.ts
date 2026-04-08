/**
 * PATCH /api/admin/financeiro/professores/[id]
 * Atualiza status, valores e período do professor para um mês/ano (TeacherPaymentMonth).
 * Quando periodoInicio/periodoTermino são alterados, propaga em cascata para os meses seguintes
 * (ex.: fev 25/01–25/02 → mar 25/02–25/03, abr 25/03–25/04, etc.).
 * Também atualiza Teacher quando metodoPagamento ou infosPagamento são enviados.
 * Body: year, month, paymentStatus?, valorPorPeriodo?, valorExtra?, periodoInicio?, periodoTermino?, metodoPagamento?, infosPagamento?
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/auth'
import { logFinanceAction, updateTeacherPaymentSchema } from '@/lib/finance'
import {
  inferDueDayUtcFromSavedPeriod,
  teacherPaymentBoundsFromDueDay,
} from '@/lib/teacher-paid-period'
import { syncTeacherPaymentMarkedPaidAt } from '@/lib/finance/teacher-payment-marked-paid-at'

/** Retorna (year, month) do próximo mês. */
function nextYearMonth(year: number, month: number): { year: number; month: number } {
  if (month === 12) return { year: year + 1, month: 1 }
  return { year, month: month + 1 }
}

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
    const parsed = updateTeacherPaymentSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { ok: false, message: 'Dados inválidos', details: parsed.error.flatten() },
        { status: 400 }
      )
    }
    const data = parsed.data
    const {
      year,
      month,
      dueDay,
      paymentStatus,
      valorPorPeriodo,
      valorExtra,
      periodoInicio,
      periodoTermino,
      metodoPagamento,
      infosPagamento,
    } = data

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
      if (paymentStatus === 'PAGO') updateData.paymentStatus = 'PAGO'
      else if (paymentStatus === 'NF_OK_AGUARDANDO') updateData.paymentStatus = 'NF_OK_AGUARDANDO'
      else if (paymentStatus === 'AGUARDANDO_REENVIO') updateData.paymentStatus = 'AGUARDANDO_REENVIO'
      else updateData.paymentStatus = 'EM_ABERTO'
    }
    if (valorPorPeriodo !== undefined) {
      updateData.valorPorPeriodo = valorPorPeriodo ?? null
    }
    if (valorExtra !== undefined) {
      updateData.valorExtra = valorExtra ?? null
    }
    if (periodoInicio !== undefined) {
      updateData.periodoInicio = periodoInicio ? new Date(periodoInicio) : null
    }
    if (periodoTermino !== undefined) {
      updateData.periodoTermino = periodoTermino ? new Date(periodoTermino) : null
    }
    if (dueDay !== undefined) {
      const p = teacherPaymentBoundsFromDueDay(year, month, dueDay)
      updateData.periodoInicio = p.inicio
      updateData.periodoTermino = p.termino
      if (dueDay >= 1 && dueDay <= 31) {
        await prisma.teacher.update({
          where: { id: teacherId },
          data: { paymentDueDay: dueDay },
        })
      }
    }

    // Se o período foi informado/salvo sem dueDay explícito, sincronizar paymentDueDay
    // com o dia de periodoInicio para manter o cadastro consistente.
    if (dueDay === undefined && updateData.periodoInicio instanceof Date) {
      const inferredDueDay = updateData.periodoInicio.getUTCDate()
      if (inferredDueDay >= 1 && inferredDueDay <= 31) {
        await prisma.teacher.update({
          where: { id: teacherId },
          data: { paymentDueDay: inferredDueDay },
        })
      }
    }

    if (Object.keys(updateData).length === 0 && (metodoPagamento === undefined && infosPagamento === undefined)) {
      return NextResponse.json({ ok: true, message: 'Nada a atualizar' })
    }

    const wasMarkedAsPaid = paymentStatus === 'PAGO' && updateData.paymentStatus === 'PAGO'

    if (Object.keys(updateData).length > 0) {
      // Encontrar o registro cujo período TERMINA no mês/ano selecionado, se existir.
      // Isso garante que mudar status/valores na tela de Abril, por exemplo, atualize o período que termina em abril.
      const rangeStart = new Date(Date.UTC(year, month - 1, 1))
      const rangeEnd = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999))
      const existingByEnd = await prisma.teacherPaymentMonth.findFirst({
        where: {
          teacherId,
          periodoTermino: {
            gte: rangeStart,
            lte: rangeEnd,
          },
        },
      })
      const keyYear = existingByEnd?.year ?? year
      const keyMonth = existingByEnd?.month ?? month

      const existing = await prisma.teacherPaymentMonth.findUnique({
        where: { teacherId_year_month: { teacherId, year: keyYear, month: keyMonth } },
      })
      const previousStatus = existing?.paymentStatus

      await prisma.teacherPaymentMonth.upsert({
        where: {
          teacherId_year_month: { teacherId, year: keyYear, month: keyMonth },
        },
        create: {
          teacherId,
          year: keyYear,
          month: keyMonth,
          paymentStatus: updateData.paymentStatus ?? null,
          valorPorPeriodo: updateData.valorPorPeriodo ?? null,
          valorExtra: updateData.valorExtra ?? null,
          periodoInicio: updateData.periodoInicio ?? null,
          periodoTermino: updateData.periodoTermino ?? null,
        },
        update: updateData,
      })

      await syncTeacherPaymentMarkedPaidAt(
        teacherId,
        keyYear,
        keyMonth,
        previousStatus,
        updateData.paymentStatus
      )

      // Propagação em cascata: mesmos limites que teacherPaymentBoundsFromDueDay para os meses seguintes.
      const updatedPeriod =
        updateData.periodoInicio !== undefined || updateData.periodoTermino !== undefined
      if (updatedPeriod) {
        const current = await prisma.teacherPaymentMonth.findUnique({
          where: { teacherId_year_month: { teacherId, year: keyYear, month: keyMonth } },
        })
        const cascadeDue =
          dueDay ??
          (current?.periodoInicio && current?.periodoTermino
            ? inferDueDayUtcFromSavedPeriod(current.periodoInicio, current.periodoTermino)
            : null)
        if (cascadeDue != null && cascadeDue >= 1 && cascadeDue <= 31) {
          let nextYm = nextYearMonth(keyYear, keyMonth)
          for (let i = 0; i < 12; i++) {
            const p = teacherPaymentBoundsFromDueDay(nextYm.year, nextYm.month, cascadeDue)
            await prisma.teacherPaymentMonth.upsert({
              where: {
                teacherId_year_month: {
                  teacherId,
                  year: nextYm.year,
                  month: nextYm.month,
                },
              },
              create: {
                teacherId,
                year: nextYm.year,
                month: nextYm.month,
                paymentStatus: null,
                valorPorPeriodo: null,
                valorExtra: null,
                periodoInicio: p.inicio,
                periodoTermino: p.termino,
              },
              update: {
                periodoInicio: p.inicio,
                periodoTermino: p.termino,
              },
            })
            nextYm = nextYearMonth(nextYm.year, nextYm.month)
          }
        }
      }

      if (updateData.paymentStatus !== undefined) {
        logFinanceAction({
          entityType: 'TEACHER',
          entityId: teacherId,
          action: 'PAYMENT_STATUS_CHANGED',
          oldValue: { paymentStatus: previousStatus ?? null, year, month },
          newValue: { paymentStatus: updateData.paymentStatus, year, month },
          performedBy: auth.session?.sub ?? null,
        })
      }

      // Notificar o professor quando o pagamento for marcado como Pago
      if (wasMarkedAsPaid && previousStatus !== 'PAGO' && prisma.teacherAlert) {
        const MESES_NOMES: Record<number, string> = {
          1: 'janeiro', 2: 'fevereiro', 3: 'março', 4: 'abril', 5: 'maio', 6: 'junho',
          7: 'julho', 8: 'agosto', 9: 'setembro', 10: 'outubro', 11: 'novembro', 12: 'dezembro',
        }
        const monthRow = await prisma.teacherPaymentMonth.findUnique({
          where: { teacherId_year_month: { teacherId, year: keyYear, month: keyMonth } },
          select: { periodoTermino: true },
        })
        let competenciaMonth = month
        let competenciaYear = year
        if (monthRow?.periodoTermino) {
          const lastInclusive = new Date(monthRow.periodoTermino.getTime() - 1)
          competenciaMonth = lastInclusive.getUTCMonth() + 1
          competenciaYear = lastInclusive.getUTCFullYear()
        }
        const mesNome = MESES_NOMES[competenciaMonth] || String(competenciaMonth)
        const message = `Seu pagamento referente a ${mesNome}/${competenciaYear} foi realizado.`
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
