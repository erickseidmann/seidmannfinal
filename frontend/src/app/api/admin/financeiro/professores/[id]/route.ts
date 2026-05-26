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
  nextCompetenceYearMonth,
  teacherPaymentBoundsForCompetenceMonth,
  teacherPaymentCompetenceKeyFromPeriodoTermino,
} from '@/lib/teacher-paid-period'
import {
  findTeacherPaymentMonthByCompetenceBrt,
  upsertKeysForCompetenceMonth,
} from '@/lib/teacher-payment-month-db'
import { syncTeacherPaymentMarkedPaidAt } from '@/lib/finance/teacher-payment-marked-paid-at'

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
      const p = teacherPaymentBoundsForCompetenceMonth(year, month, dueDay)
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
      const existingByEnd = await findTeacherPaymentMonthByCompetenceBrt(teacherId, year, month)
      const periodoTerminoForKey =
        updateData.periodoTermino instanceof Date
          ? updateData.periodoTermino
          : existingByEnd?.periodoTermino ?? null
      const { year: keyYear, month: keyMonth } = upsertKeysForCompetenceMonth(
        year,
        month,
        existingByEnd,
        periodoTerminoForKey
      )

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
        updateData.paymentStatus ?? undefined
      )

      // Propagação em cascata: teacherPaymentBoundsForCompetenceMonth para os 12 meses seguintes.
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
          let compYm = { year: keyYear, month: keyMonth }
          for (let i = 0; i < 12; i++) {
            compYm = nextCompetenceYearMonth(compYm.year, compYm.month)
            const p = teacherPaymentBoundsForCompetenceMonth(compYm.year, compYm.month, cascadeDue)
            const cascadeKey = teacherPaymentCompetenceKeyFromPeriodoTermino(p.termino)
            await prisma.teacherPaymentMonth.upsert({
              where: {
                teacherId_year_month: {
                  teacherId,
                  year: cascadeKey.year,
                  month: cascadeKey.month,
                },
              },
              create: {
                teacherId,
                year: cascadeKey.year,
                month: cascadeKey.month,
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
          const key = teacherPaymentCompetenceKeyFromPeriodoTermino(monthRow.periodoTermino)
          competenciaMonth = key.month
          competenciaYear = key.year
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
