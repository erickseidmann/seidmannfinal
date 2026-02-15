/**
 * API Route: PUT /api/enrollments/[id]
 * 
 * Atualiza um Enrollment existente
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params
    const body = await request.json()

    // Verificar se enrollment existe
    const existing = await prisma.enrollment.findUnique({
      where: { id },
    })

    if (!existing) {
      return NextResponse.json(
        { error: 'Enrollment não encontrado' },
        { status: 404 }
      )
    }

    // Preparar dados para atualização (apenas campos permitidos; schema usa nome, idioma, etc.)
    const updateData: Record<string, unknown> = {}

    if (body.fullName !== undefined) updateData.nome = body.fullName
    if (body.email !== undefined) updateData.email = body.email
    if (body.whatsapp !== undefined) updateData.whatsapp = body.whatsapp
    if (body.language !== undefined) updateData.idioma = body.language
    if (body.level !== undefined) updateData.nivel = body.level
    if (body.goal !== undefined) updateData.objetivo = body.goal
    if (body.availability !== undefined) updateData.disponibilidade = body.availability
    if (body.status !== undefined) updateData.status = body.status
    if (body.userId !== undefined) updateData.userId = body.userId

    // Atualizar
    const updated = await prisma.enrollment.update({
      where: { id },
      data: updateData,
      include: {
        user: {
          select: {
            id: true,
            nome: true,
            email: true,
            whatsapp: true,
          },
        },
      },
    })

    // Retornar resposta (sem dados sensíveis; expõe nomes da API para o frontend)
    const response: Record<string, unknown> = {
      id: updated.id,
      code: updated.trackingCode ?? undefined,
      status: updated.status,
      fullName: updated.nome,
      email: updated.email,
      whatsapp: updated.whatsapp,
      language: updated.idioma ?? undefined,
      level: updated.nivel ?? undefined,
      goal: updated.objetivo ?? undefined,
      availability: updated.disponibilidade ?? undefined,
      createdAt: updated.criadoEm,
      updatedAt: updated.atualizadoEm,
    }

    if (updated.user) {
      response.user = updated.user
    }

    return NextResponse.json(response)
  } catch (error) {
    console.error('Erro ao atualizar enrollment:', error)
    return NextResponse.json(
      { error: 'Erro interno do servidor' },
      { status: 500 }
    )
  }
}
