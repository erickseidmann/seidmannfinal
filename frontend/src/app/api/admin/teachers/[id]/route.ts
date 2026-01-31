/**
 * API Route: PATCH /api/admin/teachers/[id]
 * 
 * Atualizar professor
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/auth'

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const auth = await requireAdmin(request)
    if (!auth.authorized) {
      return NextResponse.json(
        { ok: false, message: auth.message || 'Não autorizado' },
        { status: auth.message?.includes('Não autenticado') ? 401 : 403 }
      )
    }

    const { id } = params
    const body = await request.json()
    const {
      nome,
      email,
      whatsapp,
      status,
      nomePreferido,
      valorPorHora,
      metodoPagamento,
      infosPagamento,
      cpf,
      cnpj,
      nota,
    } = body

    // Verificar se o model existe no Prisma Client
    if (!prisma.teacher) {
      console.error('[api/admin/teachers/[id]] Model Teacher não encontrado no Prisma Client. Execute: npx prisma generate')
      return NextResponse.json(
        { ok: false, message: 'Modelo Teacher não disponível. Execute: npx prisma generate' },
        { status: 503 }
      )
    }

    // Verificar se professor existe
    const existing = await prisma.teacher.findUnique({
      where: { id },
    })

    if (!existing) {
      return NextResponse.json(
        { ok: false, message: 'Professor não encontrado' },
        { status: 404 }
      )
    }

    // Se email mudou, verificar se não está em uso
    if (email && email !== existing.email) {
      const normalizedEmail = email.trim().toLowerCase()
      const emailInUse = await prisma.teacher.findUnique({
        where: { email: normalizedEmail },
      })

      if (emailInUse) {
        return NextResponse.json(
          { ok: false, message: 'Email já está em uso' },
          { status: 409 }
        )
      }
    }

    if (metodoPagamento && !['PIX', 'CARTAO', 'OUTRO'].includes(metodoPagamento)) {
      return NextResponse.json(
        { ok: false, message: 'Método de pagamento inválido' },
        { status: 400 }
      )
    }

    const updateData: Record<string, unknown> = {}
    if (nome) updateData.nome = nome.trim()
    if (email) updateData.email = email.trim().toLowerCase()
    if (whatsapp !== undefined) updateData.whatsapp = whatsapp?.trim() || null
    if (status) updateData.status = status
    if (nomePreferido !== undefined) updateData.nomePreferido = nomePreferido?.trim() || null
    if (valorPorHora !== undefined) updateData.valorPorHora = valorPorHora != null && valorPorHora !== '' ? Number(valorPorHora) : null
    if (metodoPagamento !== undefined) updateData.metodoPagamento = metodoPagamento || null
    if (infosPagamento !== undefined) updateData.infosPagamento = infosPagamento?.trim() || null
    if (cpf !== undefined) updateData.cpf = cpf?.trim() || null
    if (cnpj !== undefined) updateData.cnpj = cnpj?.trim() || null
    if (nota !== undefined) updateData.nota = nota != null && nota !== '' ? Math.min(5, Math.max(1, Number(nota))) : null

    const teacher = await prisma.teacher.update({
      where: { id },
      data: updateData,
    })

    return NextResponse.json({
      ok: true,
      data: {
        teacher: {
          id: teacher.id,
          nome: teacher.nome,
          nomePreferido: teacher.nomePreferido,
          email: teacher.email,
          whatsapp: teacher.whatsapp,
          cpf: teacher.cpf,
          cnpj: teacher.cnpj,
          valorPorHora: teacher.valorPorHora != null ? Number(teacher.valorPorHora) : null,
          metodoPagamento: teacher.metodoPagamento,
          infosPagamento: teacher.infosPagamento,
          nota: teacher.nota,
          status: teacher.status,
          criadoEm: teacher.criadoEm.toISOString(),
          atualizadoEm: teacher.atualizadoEm.toISOString(),
        },
      },
    })
  } catch (error) {
    console.error('[api/admin/teachers/[id]] Erro ao atualizar professor:', error)
    return NextResponse.json(
      { ok: false, message: 'Erro ao atualizar professor' },
      { status: 500 }
    )
  }
}
