/**
 * API Route: POST /api/contrato
 * 
 * Aceita o contrato do Enrollment.
 * Atualiza contractAcceptedAt, contractVersion e status para CONTRACT_ACCEPTED.
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { isValidEmail } from '@/lib/validators'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { enrollmentId, userId, email, aceite } = body

    // Validações
    if (aceite !== true) {
      return NextResponse.json(
        {
          ok: false,
          message: 'Você precisa aceitar o contrato para continuar'
        },
        { status: 400 }
      )
    }

    // Identificar Enrollment por enrollmentId OU userId/email
    let enrollment = null

    if (enrollmentId) {
      enrollment = await prisma.enrollment.findUnique({
        where: { id: enrollmentId },
      })
    } else if (userId) {
      // Buscar Enrollment mais recente do usuário
      enrollment = await prisma.enrollment.findFirst({
        where: {
          userId,
          status: { in: ['REGISTERED', 'CONTRACT_ACCEPTED', 'PAYMENT_PENDING'] },
        },
        orderBy: { criadoEm: 'desc' },
      })
    } else if (email && isValidEmail(email)) {
      const normalizedEmail = email.trim().toLowerCase()
      // Buscar Enrollment mais recente por email
      enrollment = await prisma.enrollment.findFirst({
        where: {
          email: normalizedEmail,
          status: { in: ['REGISTERED', 'CONTRACT_ACCEPTED', 'PAYMENT_PENDING'] },
        },
        orderBy: { criadoEm: 'desc' },
      })
    }

    if (!enrollment) {
      return NextResponse.json(
        {
          ok: false,
          message: 'Enrollment não encontrado. Verifique os dados fornecidos.'
        },
        { status: 404 }
      )
    }

    // Verificar se já foi aceito
    if (enrollment.status === 'CONTRACT_ACCEPTED' || enrollment.status === 'PAYMENT_PENDING' || enrollment.status === 'ACTIVE') {
      // Já aceito, retornar sucesso mas avisar que pode prosseguir
      return NextResponse.json(
        {
          ok: true,
          data: {
            enrollment: {
              id: enrollment.id,
              status: enrollment.status,
            },
            next: '/pagamento',
          },
        },
        { status: 200 }
      )
    }

    // Atualizar Enrollment: aceitar contrato
    const updatedEnrollment = await prisma.enrollment.update({
      where: { id: enrollment.id },
      data: {
        contractAcceptedAt: new Date(),
        contractVersion: 'v1',
        status: 'CONTRACT_ACCEPTED',
      },
    })

    console.log('[api/contrato] Contrato aceito para enrollment:', updatedEnrollment.id)

    // Retornar sucesso com próximo passo
    return NextResponse.json(
      {
        ok: true,
        data: {
          enrollment: {
            id: updatedEnrollment.id,
            status: updatedEnrollment.status,
            contractAcceptedAt: updatedEnrollment.contractAcceptedAt?.toISOString(),
            contractVersion: updatedEnrollment.contractVersion,
          },
          next: '/pagamento', // Próximo passo: configurar pagamento
        },
      },
      { status: 200 }
    )
  } catch (error) {
    console.error('[api/contrato] Erro ao aceitar contrato:', error)
    return NextResponse.json(
      {
        ok: false,
        message: 'Erro ao processar aceite do contrato. Tente novamente.'
      },
      { status: 500 }
    )
  }
}
