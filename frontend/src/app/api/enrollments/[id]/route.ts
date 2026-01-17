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

    // Preparar dados para atualização (apenas campos permitidos)
    const updateData: any = {}

    if (body.fullName !== undefined) updateData.fullName = body.fullName
    if (body.email !== undefined) updateData.email = body.email
    if (body.whatsapp !== undefined) updateData.whatsapp = body.whatsapp
    if (body.language !== undefined) updateData.language = body.language
    if (body.level !== undefined) updateData.level = body.level
    if (body.goal !== undefined) updateData.goal = body.goal
    if (body.availability !== undefined) updateData.availability = body.availability
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
            name: true,
            email: true,
            whatsapp: true,
          },
        },
      },
    })

    // Retornar resposta (sem dados sensíveis)
    const response: any = {
      id: updated.id,
      code: updated.code,
      status: updated.status,
      fullName: updated.fullName,
      email: updated.email,
      whatsapp: updated.whatsapp,
      language: updated.language,
      level: updated.level,
      goal: updated.goal,
      availability: updated.availability,
      createdAt: updated.createdAt,
      updatedAt: updated.updatedAt,
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
