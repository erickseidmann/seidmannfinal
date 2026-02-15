/**
 * GET /api/student/holidays?start=YYYY-MM-DD&end=YYYY-MM-DD
 * Lista feriados no intervalo (somente leitura, para o calendário do aluno).
 * Os feriados são os mesmos definidos pelo admin na agenda.
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireStudent } from '@/lib/auth'

export async function GET(request: NextRequest) {
  try {
    const auth = await requireStudent(request)
    if (!auth.authorized) {
      return NextResponse.json(
        { ok: false, message: auth.message || 'Não autorizado' },
        { status: auth.message?.includes('Não autenticado') ? 401 : 403 }
      )
    }

    const { searchParams } = new URL(request.url)
    const startParam = searchParams.get('start')
    const endParam = searchParams.get('end')
    if (!startParam || !endParam) {
      return NextResponse.json(
        { ok: false, message: 'Parâmetros start e end (YYYY-MM-DD) são obrigatórios' },
        { status: 400 }
      )
    }

    const holidays = await prisma.holiday.findMany({
      where: {
        dateKey: { gte: startParam, lte: endParam },
      },
      orderBy: { dateKey: 'asc' },
    })

    return NextResponse.json({
      ok: true,
      data: { holidays: holidays.map((h) => h.dateKey) },
    })
  } catch (error) {
    console.error('[api/student/holidays GET]', error)
    return NextResponse.json(
      { ok: false, message: 'Erro ao listar feriados' },
      { status: 500 }
    )
  }
}
