/**
 * GET /api/admin/teacher-requests - Lista solicitações de professor
 * POST /api/admin/teacher-requests - Cria solicitação (horarios, idiomas)
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
    const list = await prisma.teacherRequest.findMany({
      orderBy: { criadoEm: 'desc' },
    })
    return NextResponse.json({
      ok: true,
      data: list.map((r) => ({
        id: r.id,
        horarios: r.horarios,
        idiomas: r.idiomas,
        criadoEm: r.criadoEm.toISOString(),
      })),
    })
  } catch (error) {
    console.error('[api/admin/teacher-requests GET]', error)
    return NextResponse.json(
      { ok: false, message: 'Erro ao listar solicitações' },
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
    const { horarios, idiomas } = body
    if (!horarios || typeof horarios !== 'string' || !horarios.trim()) {
      return NextResponse.json(
        { ok: false, message: 'Horários são obrigatórios' },
        { status: 400 }
      )
    }
    const req = await prisma.teacherRequest.create({
      data: {
        horarios: String(horarios).trim(),
        idiomas: idiomas != null ? String(idiomas).trim() : '',
      },
    })
    return NextResponse.json({
      ok: true,
      data: {
        id: req.id,
        horarios: req.horarios,
        idiomas: req.idiomas,
        criadoEm: req.criadoEm.toISOString(),
      },
    }, { status: 201 })
  } catch (error) {
    console.error('[api/admin/teacher-requests POST]', error)
    return NextResponse.json(
      { ok: false, message: 'Erro ao criar solicitação' },
      { status: 500 }
    )
  }
}
