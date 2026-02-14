/**
 * API Route: PATCH /api/admin/users/[id]
 * Atualizar usuário do ADM (apenas admin@seidmann.com, email deve terminar @seidmann.com)
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireSuperAdmin } from '@/lib/auth'
import bcrypt from 'bcryptjs'

const SEIDMANN_SUFFIX = '@seidmann.com'

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const auth = await requireSuperAdmin(request)
    if (!auth.authorized) {
      return NextResponse.json(
        { ok: false, message: auth.message || 'Não autorizado' },
        { status: auth.message?.includes('Não autenticado') ? 401 : 403 }
      )
    }

    const { id } = params
    const body = await request.json()
    const { nome, email, whatsapp, telefone, funcao, emailPessoal, adminPages, status, senha } = body

    const existing = await prisma.user.findUnique({
      where: { id },
    })
    if (!existing) {
      return NextResponse.json(
        { ok: false, message: 'Usuário não encontrado' },
        { status: 404 }
      )
    }
    if (!existing.email.endsWith(SEIDMANN_SUFFIX)) {
      return NextResponse.json(
        { ok: false, message: 'Só é possível editar usuários do ADM (@seidmann.com)' },
        { status: 403 }
      )
    }

    // Montar objeto de atualização (tipagem explícita para Prisma aceitar senha)
    const updateData: {
      nome?: string
      email?: string
      whatsapp?: string
      status?: string
      funcao?: string | null
      emailPessoal?: string | null
      adminPages?: string[] | null
      senha?: string
    } = {}
    if (nome != null) updateData.nome = String(nome).trim()
    if (email != null) {
      const normalizedEmail = String(email).trim().toLowerCase()
      if (!normalizedEmail.endsWith(SEIDMANN_SUFFIX)) {
        return NextResponse.json(
          { ok: false, message: 'Email de acesso deve terminar com @seidmann.com' },
          { status: 400 }
        )
      }
      if (normalizedEmail !== existing.email) {
        const inUse = await prisma.user.findUnique({ where: { email: normalizedEmail } })
        if (inUse) {
          return NextResponse.json(
            { ok: false, message: 'Email já está em uso' },
            { status: 409 }
          )
        }
        updateData.email = normalizedEmail
      }
    }
    const tel = telefone ?? whatsapp
    if (tel !== undefined) updateData.whatsapp = String(tel).trim()
    if (status != null) updateData.status = status
    if (funcao !== undefined) updateData.funcao = (funcao || '').trim() || null
    if (emailPessoal !== undefined) updateData.emailPessoal = (emailPessoal || '').trim() || null
    if (adminPages !== undefined) {
      updateData.adminPages = Array.isArray(adminPages) ? adminPages : null
    }
    if (senha && String(senha).trim().length >= 6) {
      updateData.senha = await bcrypt.hash(String(senha).trim(), 10)
    }

    const user = await prisma.user.update({
      where: { id },
      data: updateData,
      select: {
        id: true,
        nome: true,
        email: true,
        whatsapp: true,
        role: true,
        status: true,
        funcao: true,
        emailPessoal: true,
        adminPages: true,
        criadoEm: true,
        atualizadoEm: true,
      },
    })

    return NextResponse.json({
      ok: true,
      data: {
        user: {
          ...user,
          adminPages: Array.isArray(user.adminPages) ? user.adminPages : [],
          criadoEm: user.criadoEm.toISOString(),
          atualizadoEm: user.atualizadoEm.toISOString(),
        },
      },
    })
  } catch (error) {
    console.error('[api/admin/users/[id]] Erro ao atualizar usuário:', error)
    return NextResponse.json(
      { ok: false, message: 'Erro ao atualizar usuário' },
      { status: 500 }
    )
  }
}

/** DELETE: excluir usuário do ADM (apenas @seidmann.com; não permite excluir admin@seidmann.com) */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const auth = await requireSuperAdmin(_request)
    if (!auth.authorized) {
      return NextResponse.json(
        { ok: false, message: auth.message || 'Não autorizado' },
        { status: auth.message?.includes('Não autenticado') ? 401 : 403 }
      )
    }

    const { id } = params
    const existing = await prisma.user.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json(
        { ok: false, message: 'Usuário não encontrado' },
        { status: 404 }
      )
    }
    if (!existing.email.endsWith(SEIDMANN_SUFFIX)) {
      return NextResponse.json(
        { ok: false, message: 'Só é possível excluir usuários do ADM (@seidmann.com)' },
        { status: 403 }
      )
    }
    const emailLower = existing.email.toLowerCase()
    if (emailLower === 'admin@seidmann.com') {
      return NextResponse.json(
        { ok: false, message: 'Não é permitido excluir o administrador principal' },
        { status: 403 }
      )
    }

    await prisma.user.delete({ where: { id } })
    return NextResponse.json({ ok: true, data: { deleted: id } })
  } catch (error) {
    console.error('[api/admin/users/[id] DELETE] Erro ao excluir usuário:', error)
    return NextResponse.json(
      { ok: false, message: 'Erro ao excluir usuário' },
      { status: 500 }
    )
  }
}
