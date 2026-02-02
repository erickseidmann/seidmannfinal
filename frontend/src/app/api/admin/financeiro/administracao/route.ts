/**
 * GET /api/admin/financeiro/administracao?year=YYYY&month=M
 * Lista usuários do ADM (exceto super admin) com valor e status do mês, e despesas administrativas do mês.
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdmin, isSuperAdminEmail } from '@/lib/auth'

const SUPER_ADMIN_EMAIL = 'admin@seidmann.com'

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
    const yearParam = searchParams.get('year')
    const monthParam = searchParams.get('month')
    const year = yearParam ? parseInt(yearParam, 10) : new Date().getFullYear()
    const month = monthParam ? parseInt(monthParam, 10) : new Date().getMonth() + 1
    if (Number.isNaN(year) || Number.isNaN(month) || month < 1 || month > 12) {
      return NextResponse.json(
        { ok: false, message: 'year e month (1-12) são obrigatórios' },
        { status: 400 }
      )
    }

    // Usuários do ADM (role ADMIN), exceto o super admin
    const adminUsers = await prisma.user.findMany({
      where: {
        role: 'ADMIN',
        email: { not: SUPER_ADMIN_EMAIL },
      },
      select: {
        id: true,
        nome: true,
        email: true,
        funcao: true,
        emailPessoal: true,
      },
      orderBy: { nome: 'asc' },
    })

    const currentUserIsSuperAdmin = auth.session?.email ? isSuperAdminEmail(auth.session.email) : false

    let adminUsersWithPayment: {
      id: string
      nome: string
      email: string
      funcao: string | null
      emailPessoal: string | null
      valor: number | null
      paymentStatus: string | null
      valorPendente: number | null
      valorPendenteRequestedAt: string | null
      valorRepetido: number | null
    }[] = adminUsers.map((u) => ({
      id: u.id,
      nome: u.nome,
      email: u.email,
      funcao: u.funcao ?? null,
      emailPessoal: u.emailPessoal ?? null,
      valor: null,
      paymentStatus: null,
      valorPendente: null,
      valorPendenteRequestedAt: null,
      valorRepetido: null,
    }))

    if (prisma.adminUserPaymentMonth) {
      const payments = await prisma.adminUserPaymentMonth.findMany({
        where: { year, month },
      })
      const byUser = new Map(payments.map((p) => [p.userId, p]))

      // Valor repetido: se o mês não tem valor aprovado, usar o último mês anterior que tinha
      const previousPayments = await prisma.adminUserPaymentMonth.findMany({
        where: {
          OR: [
            { year: { lt: year } },
            { year, month: { lt: month } },
          ],
        },
        select: { userId: true, year: true, month: true, valor: true },
      })
      const previousByUser = new Map<string, { year: number; month: number; valor: number }[]>()
      for (const p of previousPayments) {
        if (p.valor != null) {
          const list = previousByUser.get(p.userId) ?? []
          list.push({ year: p.year, month: p.month, valor: Number(p.valor) })
          previousByUser.set(p.userId, list)
        }
      }
      for (const list of previousByUser.values()) {
        list.sort((a, b) => (a.year !== b.year ? b.year - a.year : b.month - a.month))
      }

      adminUsersWithPayment = adminUsers.map((u) => {
        const pm = byUser.get(u.id)
        const valor = pm?.valor != null ? Number(pm.valor) : null
        const list = previousByUser.get(u.id)
        const valorRepetido =
          valor == null && list && list.length > 0 ? list[0].valor : null
        return {
          id: u.id,
          nome: u.nome,
          email: u.email,
          funcao: u.funcao ?? null,
          emailPessoal: u.emailPessoal ?? null,
          valor,
          paymentStatus: pm?.paymentStatus ?? null,
          valorPendente: pm?.valorPendente != null ? Number(pm.valorPendente) : null,
          valorPendenteRequestedAt: pm?.valorPendenteRequestedAt?.toISOString() ?? null,
          valorRepetido,
        }
      })
    }

    let expenses: { id: string; name: string; description: string | null; valor: number; year: number; month: number; paymentStatus: string | null }[] = []
    if (prisma.adminExpense) {
      const rows = await prisma.adminExpense.findMany({
        where: { year, month },
        orderBy: { criadoEm: 'asc' },
      })
      expenses = rows.map((e) => ({
        id: e.id,
        name: e.name,
        description: e.description ?? null,
        valor: Number(e.valor),
        year: e.year,
        month: e.month,
        paymentStatus: e.paymentStatus ?? null,
      }))
    }

    return NextResponse.json({
      ok: true,
      data: {
        year,
        month,
        adminUsers: adminUsersWithPayment,
        expenses,
        currentUserIsSuperAdmin,
      },
    })
  } catch (error) {
    console.error('[api/admin/financeiro/administracao GET]', error)
    return NextResponse.json(
      { ok: false, message: 'Erro ao carregar dados' },
      { status: 500 }
    )
  }
}
