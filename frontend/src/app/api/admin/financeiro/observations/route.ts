/**
 * GET /api/admin/financeiro/observations?enrollmentId=xxx | ?teacherId=xxx – lista observações
 * POST /api/admin/financeiro/observations – adiciona (body: enrollmentId? ou teacherId?, message)
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/auth'

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAdmin(request)
    if (!auth.authorized) {
      return NextResponse.json(
        { ok: false, message: auth.message || 'Não autorizado' },
        { status: auth.message?.includes('Não autenticado') ? 401 : 403 }
      )
    }
    const enrollmentId = request.nextUrl.searchParams.get('enrollmentId') ?? null
    const teacherId = request.nextUrl.searchParams.get('teacherId') ?? null
    if (!enrollmentId && !teacherId) {
      return NextResponse.json(
        { ok: false, message: 'Informe enrollmentId ou teacherId' },
        { status: 400 }
      )
    }
    const where: { enrollmentId?: string; teacherId?: string } = {}
    if (enrollmentId) where.enrollmentId = enrollmentId
    if (teacherId) where.teacherId = teacherId

    const list = await prisma.financeObservation.findMany({
      where,
      orderBy: { criadoEm: 'desc' },
      select: { id: true, message: true, criadoEm: true },
    })
    return NextResponse.json({
      ok: true,
      data: list.map((o) => ({
        id: o.id,
        message: o.message,
        criadoEm: o.criadoEm.toISOString(),
      })),
    })
  } catch (error) {
    console.error('[api/admin/financeiro/observations GET]', error)
    return NextResponse.json(
      { ok: false, message: 'Erro ao listar observações' },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAdmin(request)
    if (!auth.authorized) {
      return NextResponse.json(
        { ok: false, message: auth.message || 'Não autorizado' },
        { status: auth.message?.includes('Não autenticado') ? 401 : 403 }
      )
    }
    const body = await request.json()
    const { enrollmentId, teacherId, message } = body
    const msg = typeof message === 'string' ? message.trim() : ''
    if (!msg) {
      return NextResponse.json(
        { ok: false, message: 'Mensagem é obrigatória' },
        { status: 400 }
      )
    }
    if (!enrollmentId && !teacherId) {
      return NextResponse.json(
        { ok: false, message: 'Informe enrollmentId ou teacherId' },
        { status: 400 }
      )
    }
    const data: { message: string; enrollmentId?: string; teacherId?: string } = { message: msg }
    if (enrollmentId) data.enrollmentId = enrollmentId
    if (teacherId) data.teacherId = teacherId

    const created = await prisma.financeObservation.create({ data })
    return NextResponse.json({
      ok: true,
      data: {
        id: created.id,
        message: created.message,
        criadoEm: created.criadoEm.toISOString(),
      },
    }, { status: 201 })
  } catch (error) {
    console.error('[api/admin/financeiro/observations POST]', error)
    return NextResponse.json(
      { ok: false, message: 'Erro ao criar observação' },
      { status: 500 }
    )
  }
}
