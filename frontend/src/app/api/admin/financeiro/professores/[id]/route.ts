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

/** Adiciona um mês à data mantendo o dia (ex.: 25/02 → 25/03). Usa UTC para não mudar o dia por causa do fuso. */
function addMonth(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate()))
}

function addDaysUtc(d: Date, days: number): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + days))
}

/** Retorna (year, month) do próximo mês. */
function nextYearMonth(year: number, month: number): { year: number; month: number } {
  if (month === 12) return { year: year + 1, month: 1 }
  return { year, month: month + 1 }
}

function lastDayOfMonthUtc(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate()
}

function buildPeriodFromDueDay(year: number, month: number, dueDay: number): { inicio: Date; termino: Date } {
  const safeDueCurrent = Math.min(Math.max(1, dueDay), lastDayOfMonthUtc(year, month))
  // Pagamento no dia X fecha o período no dia X-1 do mês selecionado.
  const pagamentoDate = new Date(Date.UTC(year, month - 1, safeDueCurrent))
  const termino = addDaysUtc(pagamentoDate, -1)
  const prev = month === 1 ? { year: year - 1, month: 12 } : { year, month: month - 1 }
  const safeDuePrev = Math.min(Math.max(1, dueDay), lastDayOfMonthUtc(prev.year, prev.month))
  const inicio = new Date(Date.UTC(prev.year, prev.month - 1, safeDuePrev))
  return { inicio, termino }
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
      updateData.paymentStatus = paymentStatus === 'PAGO' ? 'PAGO' : 'EM_ABERTO'
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
      const p = buildPeriodFromDueDay(year, month, dueDay)
      updateData.periodoInicio = p.inicio
      updateData.periodoTermino = p.termino
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

      // Propagação em cascata: ao alterar período deste mês, atualizar os próximos meses (ex.: fev 25/01–25/02 → mar 25/02–25/03)
      const updatedPeriod =
        updateData.periodoInicio !== undefined || updateData.periodoTermino !== undefined
      if (updatedPeriod) {
        const current = await prisma.teacherPaymentMonth.findUnique({
          where: { teacherId_year_month: { teacherId, year: keyYear, month: keyMonth } },
        })
        const terminoDate = current?.periodoTermino
        if (terminoDate) {
          let lastTermino = new Date(terminoDate)
          let nextYm = nextYearMonth(keyYear, keyMonth)
          const maxMonths = 12
          for (let i = 0; i < maxMonths; i++) {
            // Próximo período começa no dia seguinte ao término atual
            // e termina um mês depois menos 1 dia (ex.: 25/03–24/04).
            const nextInicio = addDaysUtc(lastTermino, 1)
            const nextTermino = addDaysUtc(addMonth(nextInicio), -1)
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
                periodoInicio: nextInicio,
                periodoTermino: nextTermino,
              },
              update: {
                periodoInicio: nextInicio,
                periodoTermino: nextTermino,
              },
            })
            lastTermino = nextTermino
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
