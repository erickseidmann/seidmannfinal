/**
 * API Route: POST /api/professor/alterar-senha
 * Professor altera a própria senha (obrigatório no primeiro acesso).
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireTeacher } from '@/lib/auth'
import bcrypt from 'bcryptjs'

export async function POST(request: NextRequest) {
  try {
    const auth = await requireTeacher(request)
    if (!auth.authorized || !auth.session) {
      return NextResponse.json(
        { ok: false, message: auth.message || 'Não autorizado' },
        { status: auth.message?.includes('Não autenticado') ? 401 : 403 }
      )
    }

    const body = await request.json()
    const { senhaAtual, senhaNova } = body

    if (!senhaAtual || typeof senhaAtual !== 'string' || !senhaAtual.trim()) {
      return NextResponse.json(
        { ok: false, message: 'Senha atual é obrigatória' },
        { status: 400 }
      )
    }
    if (!senhaNova || typeof senhaNova !== 'string' || senhaNova.trim().length < 6) {
      return NextResponse.json(
        { ok: false, message: 'Nova senha deve ter no mínimo 6 caracteres' },
        { status: 400 }
      )
    }

    const user = await prisma.user.findUnique({
      where: { id: auth.session.userId },
      select: { id: true, senha: true },
    })

    if (!user) {
      return NextResponse.json(
        { ok: false, message: 'Usuário não encontrado' },
        { status: 404 }
      )
    }

    const senhaAtualValida = await bcrypt.compare(senhaAtual.trim(), user.senha)
    if (!senhaAtualValida) {
      return NextResponse.json(
        { ok: false, message: 'Senha atual incorreta' },
        { status: 400 }
      )
    }

    const passwordHash = await bcrypt.hash(senhaNova.trim(), 10)
    await prisma.user.update({
      where: { id: user.id },
      data: { senha: passwordHash, mustChangePassword: false },
    })

    return NextResponse.json({
      ok: true,
      data: { message: 'Senha alterada com sucesso. Use a nova senha no próximo login.' },
    })
  } catch (error) {
    console.error('[api/professor/alterar-senha] Erro:', error)
    return NextResponse.json(
      { ok: false, message: 'Erro ao alterar senha' },
      { status: 500 }
    )
  }
}
