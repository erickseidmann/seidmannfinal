/**
 * GET /api/admin/financeiro/validacao
 * Valida dados dos alunos ativos para gerar cobranças (CPF, email, valor mensalidade, dia pagamento).
 * Retorna apenas alunos com problemas.
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/auth'
import { getEnrollmentFinanceData } from '@/lib/finance'
import { isValidCPF, validateEmail } from '@/lib/finance/validators'

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAdmin(request)
    if (!auth.authorized) {
      return NextResponse.json(
        { ok: false, message: auth.message || 'Não autorizado' },
        { status: auth.message?.includes('Não autenticado') ? 401 : 403 }
      )
    }

    const enrollments = await prisma.enrollment.findMany({
      where: { status: 'ACTIVE' },
      include: {
        user: { select: { email: true } },
        paymentInfo: { select: { valorMensal: true, dueDay: true } },
      },
      orderBy: { nome: 'asc' },
    })

    const alunosComProblema: Array<{
      enrollmentId: string
      nome: string
      email: string | null
      cpf: string | null
      whatsapp: string | null
      valorMensalidade: number | null
      dueDay: number | null
      problemas: string[]
    }> = []

    for (const enrollment of enrollments) {
      const problemas: string[] = []
      const finance = getEnrollmentFinanceData(enrollment)

      // Validação CPF (financeiro: aluno ou responsável)
      const cpf = finance.cpf
      if (!cpf || !cpf.trim()) {
        problemas.push('CPF não informado (aluno ou responsável)')
      } else {
        const cpfDigits = cpf.replace(/\D/g, '')
        if (cpfDigits.length !== 11) {
          problemas.push(`CPF inválido (${cpfDigits.length} dígitos em vez de 11)`)
        } else if (!isValidCPF(cpfDigits)) {
          problemas.push('CPF inválido (não passa na validação dos dígitos verificadores)')
        }
      }

      // Validação Email (financeiro: aluno ou responsável)
      const email = finance.email
      if (!email || !email.trim()) {
        problemas.push('Email não informado (aluno ou responsável)')
      } else {
        const emailValidation = validateEmail(email)
        if (!emailValidation.valid) {
          if (emailValidation.suggestion) {
            problemas.push(`Email com possível typo (${emailValidation.message})`)
          } else {
            problemas.push(`Email inválido (${emailValidation.message})`)
          }
        }
      }

      // Validação Valor Mensalidade
      const valorMensalidade =
        enrollment.valorMensalidade != null ? Number(enrollment.valorMensalidade) : null
      const valorMensalPi = enrollment.paymentInfo?.valorMensal != null ? Number(enrollment.paymentInfo.valorMensal) : null
      const valorFinal = valorMensalidade ?? valorMensalPi ?? null
      if (!valorFinal || valorFinal <= 0) {
        problemas.push('Valor de mensalidade não definido')
      }

      // Validação Dia de Pagamento
      const dueDay = enrollment.diaPagamento ?? enrollment.paymentInfo?.dueDay ?? null
      if (!dueDay || dueDay < 1 || dueDay > 31) {
        problemas.push('Dia de pagamento não definido')
      }

      if (problemas.length > 0) {
        alunosComProblema.push({
          enrollmentId: enrollment.id,
          nome: enrollment.nome,
          email,
          cpf: cpf ?? null,
          whatsapp: enrollment.whatsapp ?? null,
          valorMensalidade: valorFinal,
          dueDay,
          problemas,
        })
      }
    }

    // Ordenar por quantidade de problemas (mais problemas primeiro)
    alunosComProblema.sort((a, b) => b.problemas.length - a.problemas.length)

    return NextResponse.json({
      ok: true,
      total: enrollments.length,
      comProblema: alunosComProblema.length,
      semProblema: enrollments.length - alunosComProblema.length,
      alunos: alunosComProblema,
    })
  } catch (error) {
    console.error('[api/admin/financeiro/validacao GET]', error)
    return NextResponse.json(
      { ok: false, message: 'Erro ao validar dados dos alunos' },
      { status: 500 }
    )
  }
}
