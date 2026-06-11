/**
 * GET /api/admin/minhas-financas?year=&month=
 * Resumo financeiro do usuário ADM logado (salário + aulas se vinculado a professor).
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/auth'
import { buildAdminMyFinanceSummary } from '@/lib/admin-my-finance-summary'

async function fetchTeacherValorForMonth(
  request: NextRequest,
  teacherId: string,
  year: number,
  month: number
): Promise<number | null> {
  try {
    const origin = request.nextUrl.origin
    const cookie = request.headers.get('cookie') ?? ''
    const res = await fetch(`${origin}/api/admin/financeiro/professores?year=${year}&month=${month}`, {
      headers: { cookie },
      cache: 'no-store',
    })
    const json = await res.json()
    if (!json.ok || !Array.isArray(json.data?.professores)) return null
    const prof = (json.data.professores as { id: string; valorAPagar?: number }[]).find(
      (p) => p.id === teacherId
    )
    return typeof prof?.valorAPagar === 'number' ? prof.valorAPagar : null
  } catch {
    return null
  }
}

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAdmin(request)
    if (!auth.authorized || !auth.session) {
      return NextResponse.json(
        { ok: false, message: auth.message || 'Não autorizado' },
        { status: auth.message?.includes('Não autenticado') ? 401 : 403 }
      )
    }

    const userId = auth.session.sub
    const { searchParams } = new URL(request.url)
    const year = searchParams.get('year')
      ? parseInt(searchParams.get('year')!, 10)
      : new Date().getFullYear()
    const month = searchParams.get('month')
      ? parseInt(searchParams.get('month')!, 10)
      : new Date().getMonth() + 1

    if (Number.isNaN(year) || Number.isNaN(month) || month < 1 || month > 12) {
      return NextResponse.json(
        { ok: false, message: 'year e month (1-12) inválidos' },
        { status: 400 }
      )
    }

    const user = await prisma.user.findFirst({
      where: { id: userId, role: 'ADMIN' },
      select: { linkedTeacherId: true },
    })

    let valorProfessorAulas: number | null = null
    if (user?.linkedTeacherId) {
      valorProfessorAulas = await fetchTeacherValorForMonth(
        request,
        user.linkedTeacherId,
        year,
        month
      )
    }

    const summary = await buildAdminMyFinanceSummary(prisma, {
      userId,
      year,
      month,
      valorProfessorAulas,
    })

    if (!summary) {
      return NextResponse.json(
        { ok: false, message: 'Usuário administrativo não encontrado.' },
        { status: 404 }
      )
    }

    return NextResponse.json({ ok: true, data: summary })
  } catch (error) {
    console.error('[api/admin/minhas-financas GET]', error)
    return NextResponse.json(
      { ok: false, message: 'Erro ao carregar suas finanças' },
      { status: 500 }
    )
  }
}
