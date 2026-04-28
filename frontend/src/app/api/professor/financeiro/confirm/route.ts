/**
 * POST /api/professor/financeiro/confirm
 * Professor confirma o valor a receber do mês. No admin aparece "pagamento pronto para fazer".
 *
 * O par year/month efetivo é sempre resolvido pelo período ativo do professor.
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireTeacher } from '@/lib/auth'
import { logFinanceAction } from '@/lib/finance'
import { resolveTeacherPaymentMonthKeyContaining } from '@/lib/teacher-payment-month-resolve'

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

    const now = new Date()
    const resolved = await resolveTeacherPaymentMonthKeyContaining(teacher.id, now)
    if (!resolved) {
      return NextResponse.json(
        { ok: false, message: 'Nenhum período ativo encontrado para este professor' },
        { status: 400 }
      )
    }
    const { year, month } = resolved

    const MESES_NOMES: Record<number, string> = {
      1: 'janeiro', 2: 'fevereiro', 3: 'março', 4: 'abril', 5: 'maio', 6: 'junho',
      7: 'julho', 8: 'agosto', 9: 'setembro', 10: 'outubro', 11: 'novembro', 12: 'dezembro',
    }
    const mesNome = MESES_NOMES[month] || String(month)

    await prisma.teacherPaymentMonth.upsert({
      where: {
        teacherId_year_month: { teacherId: teacher.id, year, month },
      },
      create: {
        teacherId: teacher.id,
        year,
        month,
        teacherConfirmedAt: now,
      },
      update: { teacherConfirmedAt: now },
    })

    logFinanceAction({
      entityType: 'TEACHER',
      entityId: teacher.id,
      action: 'TEACHER_CONFIRMED',
      performedBy: auth.session?.userId ?? null,
      metadata: { year, month, resolvedFromPeriod: true },
    })

    // Notificar admins: professor confirmou valor (pronto para pagar)
    if (prisma.adminNotification) {
      const admins = await prisma.user.findMany({
        where: { role: 'ADMIN' },
        select: { id: true },
      })
      const message = `${teacher.nome} confirmou o valor a receber (pronto para pagar) – ${mesNome}/${year}.`
      await Promise.all(
        admins.map((admin) =>
          prisma.adminNotification.create({
            data: { userId: admin.id, message },
          })
        )
      )
    }

    return NextResponse.json({
      ok: true,
      data: { teacherConfirmedAt: now.toISOString(), year, month },
      message: 'Valor confirmado. O admin verá "pagamento pronto para fazer".',
    })
  } catch (error) {
    console.error('[api/professor/financeiro/confirm POST]', error)
    return NextResponse.json(
      { ok: false, message: 'Erro ao confirmar valor' },
      { status: 500 }
    )
  }
}
