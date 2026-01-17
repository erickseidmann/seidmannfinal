/**
 * API Route: POST /api/pagamento
 * 
 * Cria ou atualiza informações de pagamento do Enrollment.
 * Atualiza status para PAYMENT_PENDING.
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { isValidEmail } from '@/lib/validators'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { enrollmentId, userId, email, plan, valorCombinado, metodo, vencimento, lembrete } = body

    // Validações
    const errors: string[] = []

    if (!enrollmentId && !userId && !email) {
      errors.push('É necessário fornecer enrollmentId, userId ou email')
    }

    if (metodo && metodo !== 'PIX') {
      errors.push('Método de pagamento deve ser PIX')
    }

    if (vencimento !== undefined) {
      const vencimentoNum = Number(vencimento)
      if (isNaN(vencimentoNum) || vencimentoNum < 1 || vencimentoNum > 31) {
        errors.push('Dia de vencimento deve ser entre 1 e 31')
      }
    }

    if (valorCombinado !== undefined) {
      const valorNum = Number(valorCombinado)
      if (isNaN(valorNum) || valorNum <= 0) {
        errors.push('Valor combinado deve ser um número positivo')
      }
    }

    if (errors.length > 0) {
      return NextResponse.json(
        {
          ok: false,
          message: 'Dados inválidos: ' + errors.join(', ')
        },
        { status: 400 }
      )
    }

    // Identificar Enrollment
    let enrollment = null

    if (enrollmentId) {
      enrollment = await prisma.enrollment.findUnique({
        where: { id: enrollmentId },
      })
    } else if (userId) {
      enrollment = await prisma.enrollment.findFirst({
        where: {
          userId,
          status: { in: ['CONTRACT_ACCEPTED', 'PAYMENT_PENDING', 'ACTIVE'] },
        },
        orderBy: { criadoEm: 'desc' },
      })
    } else if (email && isValidEmail(email)) {
      const normalizedEmail = email.trim().toLowerCase()
      enrollment = await prisma.enrollment.findFirst({
        where: {
          email: normalizedEmail,
          status: { in: ['CONTRACT_ACCEPTED', 'PAYMENT_PENDING', 'ACTIVE'] },
        },
        orderBy: { criadoEm: 'desc' },
      })
    }

    if (!enrollment) {
      return NextResponse.json(
        {
          ok: false,
          message: 'Enrollment não encontrado ou contrato ainda não foi aceito.'
        },
        { status: 404 }
      )
    }

    // Preparar dados do pagamento
    const paymentData: any = {
      metodo: metodo || 'PIX',
      paymentStatus: 'PENDING',
      reminderEnabled: lembrete !== false, // default true
    }

    if (plan !== undefined) {
      paymentData.plan = plan
    }

    if (valorCombinado !== undefined) {
      const valorDecimal = Number(valorCombinado)
      paymentData.valorMensal = valorDecimal
      paymentData.monthlyValue = valorDecimal
    }

    if (vencimento !== undefined) {
      paymentData.dueDay = Number(vencimento)
    }

    // Verificar se PaymentInfo já existe
    const existingPaymentInfo = await prisma.paymentInfo.findUnique({
      where: { enrollmentId: enrollment.id },
    })

    let paymentInfo

    if (existingPaymentInfo) {
      // Atualizar PaymentInfo existente
      paymentInfo = await prisma.paymentInfo.update({
        where: { id: existingPaymentInfo.id },
        data: paymentData,
      })
      console.log('[api/pagamento] PaymentInfo atualizado:', paymentInfo.id)
    } else {
      // Criar novo PaymentInfo
      paymentInfo = await prisma.paymentInfo.create({
        data: {
          enrollmentId: enrollment.id,
          ...paymentData,
        },
      })
      console.log('[api/pagamento] PaymentInfo criado:', paymentInfo.id)
    }

    // Atualizar status do Enrollment para PAYMENT_PENDING (se ainda não estiver ACTIVE)
    if (enrollment.status !== 'ACTIVE') {
      await prisma.enrollment.update({
        where: { id: enrollment.id },
        data: {
          status: 'PAYMENT_PENDING',
        },
      })
      console.log('[api/pagamento] Enrollment atualizado para PAYMENT_PENDING:', enrollment.id)
    }

    // Retornar sucesso
    return NextResponse.json(
      {
        ok: true,
        data: {
          paymentInfo: {
            id: paymentInfo.id,
            plan: paymentInfo.plan,
            valorMensal: paymentInfo.valorMensal?.toString(),
            metodo: paymentInfo.metodo,
            dueDay: paymentInfo.dueDay,
            paymentStatus: paymentInfo.paymentStatus,
          },
          message: 'Recebemos. Aguarde confirmação.',
        },
      },
      { status: 200 }
    )
  } catch (error) {
    console.error('[api/pagamento] Erro ao processar pagamento:', error)
    return NextResponse.json(
      {
        ok: false,
        message: 'Erro ao processar informações de pagamento. Tente novamente.'
      },
      { status: 500 }
    )
  }
}
