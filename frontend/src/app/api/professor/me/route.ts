/**
 * API Route: GET /api/professor/me
 * Retorna os dados do professor logado (Dashboard Professores).
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireTeacher } from '@/lib/auth'

export async function GET(request: NextRequest) {
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
      include: {
        user: { select: { mustChangePassword: true } },
      },
    })

    if (!teacher) {
      return NextResponse.json(
        { ok: false, message: 'Professor não encontrado para este usuário' },
        { status: 404 }
      )
    }

    const mustChangePassword = teacher.user?.mustChangePassword ?? false
    const t = teacher as { cpf?: string | null; cnpj?: string | null; valorPorHora?: unknown; metodoPagamento?: string | null; infosPagamento?: string | null }
    const valorPorHora = t.valorPorHora != null ? String(t.valorPorHora) : null

    return NextResponse.json({
      ok: true,
      data: {
        professor: {
          id: teacher.id,
          nome: teacher.nome,
          nomePreferido: teacher.nomePreferido,
          email: teacher.email,
          whatsapp: teacher.whatsapp,
          cpf: t.cpf ?? null,
          cnpj: t.cnpj ?? null,
          valorPorHora,
          metodoPagamento: t.metodoPagamento ?? null,
          infosPagamento: t.infosPagamento ?? null,
          status: teacher.status,
          criadoEm: teacher.criadoEm.toISOString(),
          mustChangePassword,
        },
      },
    })
  } catch (error) {
    console.error('[api/professor/me] Erro:', error)
    return NextResponse.json(
      { ok: false, message: 'Erro ao carregar dados do professor' },
      { status: 500 }
    )
  }
}

/**
 * PATCH /api/professor/me – Professor atualiza seus próprios dados (nome, nomePreferido, whatsapp).
 */
export async function PATCH(request: NextRequest) {
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
      select: { id: true, nome: true, nomePreferido: true, whatsapp: true, cpf: true, cnpj: true },
    })

    if (!teacher) {
      return NextResponse.json(
        { ok: false, message: 'Professor não encontrado' },
        { status: 404 }
      )
    }

    const body = await request.json().catch(() => ({}))
    const { nome, nomePreferido, whatsapp, cpf, cnpj } = body

    const updateData: { nome?: string; nomePreferido?: string | null; whatsapp?: string | null; cpf?: string | null; cnpj?: string | null } = {}
    if (typeof nome === 'string' && nome.trim()) updateData.nome = nome.trim()
    if (nomePreferido !== undefined) updateData.nomePreferido = typeof nomePreferido === 'string' ? nomePreferido.trim() || null : null
    if (whatsapp !== undefined) updateData.whatsapp = typeof whatsapp === 'string' ? whatsapp.trim() || null : null
    if (cpf !== undefined) updateData.cpf = typeof cpf === 'string' ? cpf.trim() || null : null
    if (cnpj !== undefined) updateData.cnpj = typeof cnpj === 'string' ? cnpj.trim() || null : null

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json(
        { ok: false, message: 'Nenhum campo para atualizar' },
        { status: 400 }
      )
    }

    const updated = await prisma.teacher.update({
      where: { id: teacher.id },
      data: updateData,
      select: {
        id: true,
        nome: true,
        nomePreferido: true,
        email: true,
        whatsapp: true,
        cpf: true,
        cnpj: true,
        valorPorHora: true,
        metodoPagamento: true,
        infosPagamento: true,
        status: true,
        criadoEm: true,
      },
    })

    // Notificar admins: professor alterou dados
    if (prisma.adminNotification) {
      const admins = await prisma.user.findMany({
        where: { role: 'ADMIN' },
        select: { id: true },
      })
      const message = `${updated.nome} atualizou seus dados (nome, whatsapp, etc.).`
      await Promise.all(
        admins.map((admin) =>
          prisma.adminNotification.create({
            data: { userId: admin.id, message },
          })
        )
      )
    }

    const valorPorHora = updated.valorPorHora != null ? String(updated.valorPorHora) : null

    return NextResponse.json({
      ok: true,
      data: {
        professor: {
          id: updated.id,
          nome: updated.nome,
          nomePreferido: updated.nomePreferido,
          email: updated.email,
          whatsapp: updated.whatsapp,
          cpf: updated.cpf,
          cnpj: updated.cnpj,
          valorPorHora,
          metodoPagamento: updated.metodoPagamento,
          infosPagamento: updated.infosPagamento,
          status: updated.status,
          criadoEm: updated.criadoEm.toISOString(),
        },
      },
    })
  } catch (error) {
    console.error('[api/professor/me PATCH] Erro:', error)
    return NextResponse.json(
      { ok: false, message: 'Erro ao atualizar dados' },
      { status: 500 }
    )
  }
}
