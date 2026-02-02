/**
 * GET /api/student/me
 * Retorna os dados do aluno logado (matrícula/enrollment ativa vinculada ao user).
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireStudent } from '@/lib/auth'

export async function GET(request: NextRequest) {
  try {
    const auth = await requireStudent(request)
    if (!auth.authorized || !auth.session) {
      return NextResponse.json(
        { ok: false, message: auth.message || 'Não autorizado' },
        { status: auth.message?.includes('Não autenticado') ? 401 : 403 }
      )
    }

    const enrollment = await prisma.enrollment.findFirst({
      where: { userId: auth.session.userId, status: 'ACTIVE' },
      orderBy: { criadoEm: 'desc' },
      include: { paymentInfo: true, user: { select: { mustChangePassword: true } } },
    })

    if (!enrollment) {
      return NextResponse.json(
        { ok: false, message: 'Matrícula ativa não encontrada' },
        { status: 404 }
      )
    }

    const valorMensalidade = enrollment.valorMensalidade != null ? String(enrollment.valorMensalidade) : null

    const mustChangePassword = (enrollment as { user?: { mustChangePassword: boolean } | null }).user?.mustChangePassword ?? false

    return NextResponse.json({
      ok: true,
      data: {
        aluno: {
          id: enrollment.id,
          nome: enrollment.nome,
          email: enrollment.email,
          whatsapp: enrollment.whatsapp,
          idioma: enrollment.idioma,
          nivel: enrollment.nivel,
          objetivo: enrollment.objetivo,
          disponibilidade: enrollment.disponibilidade,
          dataNascimento: enrollment.dataNascimento?.toISOString() ?? null,
          nomeResponsavel: enrollment.nomeResponsavel ?? null,
          curso: enrollment.curso ?? null,
          frequenciaSemanal: enrollment.frequenciaSemanal ?? null,
          tempoAulaMinutos: enrollment.tempoAulaMinutos ?? null,
          tipoAula: enrollment.tipoAula ?? null,
          nomeGrupo: enrollment.nomeGrupo ?? null,
          valorMensalidade,
          metodoPagamento: enrollment.metodoPagamento ?? null,
          diaPagamento: enrollment.diaPagamento ?? null,
          status: enrollment.status,
          criadoEm: enrollment.criadoEm.toISOString(),
        },
        mustChangePassword,
      },
    })
  } catch (error) {
    console.error('[api/student/me] Erro:', error)
    return NextResponse.json(
      { ok: false, message: 'Erro ao carregar dados do aluno' },
      { status: 500 }
    )
  }
}

/**
 * PATCH /api/student/me
 * Atualiza dados editáveis do aluno (nome, whatsapp).
 */
export async function PATCH(request: NextRequest) {
  try {
    const auth = await requireStudent(request)
    if (!auth.authorized || !auth.session) {
      return NextResponse.json(
        { ok: false, message: auth.message || 'Não autorizado' },
        { status: auth.message?.includes('Não autenticado') ? 401 : 403 }
      )
    }

    const body = await request.json().catch(() => ({}))
    const nome = typeof body.nome === 'string' ? body.nome.trim() : undefined
    const whatsapp = body.whatsapp !== undefined ? (typeof body.whatsapp === 'string' ? body.whatsapp.trim() || null : null) : undefined

    const enrollment = await prisma.enrollment.findFirst({
      where: { userId: auth.session.userId, status: 'ACTIVE' },
      orderBy: { criadoEm: 'desc' },
    })

    if (!enrollment) {
      return NextResponse.json(
        { ok: false, message: 'Matrícula ativa não encontrada' },
        { status: 404 }
      )
    }

    const updateData: { nome?: string; whatsapp?: string | null } = {}
    if (nome !== undefined) updateData.nome = nome
    if (whatsapp !== undefined) updateData.whatsapp = whatsapp

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json(
        { ok: false, message: 'Nenhum campo válido para atualizar' },
        { status: 400 }
      )
    }

    const updated = await prisma.enrollment.update({
      where: { id: enrollment.id },
      data: updateData,
      include: { paymentInfo: true },
    })

    const valorMensalidade = updated.valorMensalidade != null ? String(updated.valorMensalidade) : null

    return NextResponse.json({
      ok: true,
      data: {
        aluno: {
          id: updated.id,
          nome: updated.nome,
          email: updated.email,
          whatsapp: updated.whatsapp,
          idioma: updated.idioma,
          nivel: updated.nivel,
          objetivo: updated.objetivo,
          disponibilidade: updated.disponibilidade,
          dataNascimento: updated.dataNascimento?.toISOString() ?? null,
          nomeResponsavel: updated.nomeResponsavel ?? null,
          curso: updated.curso ?? null,
          frequenciaSemanal: updated.frequenciaSemanal ?? null,
          tempoAulaMinutos: updated.tempoAulaMinutos ?? null,
          tipoAula: updated.tipoAula ?? null,
          nomeGrupo: updated.nomeGrupo ?? null,
          valorMensalidade,
          metodoPagamento: updated.metodoPagamento ?? null,
          diaPagamento: updated.diaPagamento ?? null,
          status: updated.status,
          criadoEm: updated.criadoEm.toISOString(),
        },
      },
    })
  } catch (error) {
    console.error('[api/student/me PATCH] Erro:', error)
    return NextResponse.json(
      { ok: false, message: 'Erro ao atualizar dados do aluno' },
      { status: 500 }
    )
  }
}
