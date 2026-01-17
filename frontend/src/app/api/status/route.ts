/**
 * API Route: GET /api/status
 * 
 * Consulta o status de uma matrícula usando o código de acompanhamento (trackingCode).
 * Não retorna dados sensíveis (email, whatsapp, nome completo).
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// Mapeamento de status para mensagens e próximos passos
const STATUS_MESSAGES: Record<string, { message: string; nextSteps: string }> = {
  LEAD: {
    message: 'Matrícula recebida. Crie seu cadastro para continuar.',
    nextSteps: 'Acesse /cadastro para criar sua conta.',
  },
  REGISTERED: {
    message: 'Cadastro criado. Assine o contrato para continuar.',
    nextSteps: 'Acesse /contrato para aceitar os termos.',
  },
  CONTRACT_ACCEPTED: {
    message: 'Contrato aceito. Finalize o pagamento.',
    nextSteps: 'Acesse /pagamento para configurar seu pagamento.',
  },
  PAYMENT_PENDING: {
    message: 'Pagamento em análise. Aguarde a confirmação.',
    nextSteps: 'Aguarde a confirmação do pagamento pela equipe. Você receberá um e-mail quando o acesso for liberado.',
  },
  ACTIVE: {
    message: 'Acesso liberado! Você já pode fazer login.',
    nextSteps: 'Acesse /login para entrar no sistema.',
  },
  BLOCKED: {
    message: 'Acesso bloqueado. Entre em contato com a escola.',
    nextSteps: 'Entre em contato via WhatsApp ou e-mail para resolver.',
  },
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const code = searchParams.get('code')

    if (!code || typeof code !== 'string' || !code.trim()) {
      return NextResponse.json(
        {
          ok: false,
          message: 'Código de acompanhamento é obrigatório'
        },
        { status: 400 }
      )
    }

    // Normalizar código (uppercase, remover espaços)
    const normalizedCode = code.trim().toUpperCase()

    // Buscar Enrollment por trackingCode
    const enrollment = await prisma.enrollment.findUnique({
      where: { trackingCode: normalizedCode },
      select: {
        id: true,
        trackingCode: true,
        status: true,
        nome: true, // Usar apenas para extrair primeiro nome
        criadoEm: true,
      },
    })

    if (!enrollment) {
      return NextResponse.json(
        {
          ok: false,
          message: 'Código não encontrado'
        },
        { status: 404 }
      )
    }

    // Extrair primeiro nome (não retornar nome completo)
    const primeiroNome = enrollment.nome.split(' ')[0] || 'Aluno'

    // Obter mensagem e próximos passos baseado no status
    const statusInfo = STATUS_MESSAGES[enrollment.status] || {
      message: 'Status desconhecido. Entre em contato com a escola.',
      nextSteps: 'Entre em contato via WhatsApp ou e-mail.',
    }

    // Retornar dados sem informações sensíveis
    return NextResponse.json(
      {
        ok: true,
        data: {
          code: enrollment.trackingCode,
          status: enrollment.status,
          message: `Olá, ${primeiroNome}! ${statusInfo.message}`,
          nextSteps: statusInfo.nextSteps,
          createdAt: enrollment.criadoEm.toISOString(),
        },
      },
      { status: 200 }
    )
  } catch (error) {
    console.error('[api/status] Erro ao consultar status:', error)
    return NextResponse.json(
      {
        ok: false,
        message: 'Erro ao consultar status. Tente novamente.'
      },
      { status: 500 }
    )
  }
}
