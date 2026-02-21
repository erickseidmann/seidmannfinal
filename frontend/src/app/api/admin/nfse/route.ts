/**
 * GET /api/admin/nfse?year=2026&month=1
 * POST /api/admin/nfse
 * 
 * Listar e emitir NFSe (individual ou em lote).
 */

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/auth'
import { getEnrollmentFinanceData } from '@/lib/finance'
import { emitirNfseParaAluno, listarNfseDoMes } from '@/lib/nfse/service'
import { NfseRecord } from '@/lib/nfse/types'

const NFSE_ENABLED = process.env.NFSE_ENABLED === 'true'

const querySchema = z.object({
  year: z.coerce.number().int().min(2000).max(2100),
  month: z.coerce.number().int().min(1).max(12).optional(),
})

const postSchema = z.object({
  enrollmentId: z.string().optional(),
  year: z.number().int().min(2000).max(2100).optional(),
  month: z.number().int().min(1).max(12).optional(),
  manual: z.boolean().optional(),
  amount: z.number().min(0).optional(),
  extraDescription: z.string().optional(),
  observacoes: z.record(z.string(), z.string()).optional(), // enrollmentId -> texto extra (lote)
})

export async function GET(request: NextRequest) {
  try {
    if (!NFSE_ENABLED) {
      return NextResponse.json({
        enabled: false,
        message: 'NFSe desabilitada',
      })
    }

    const auth = await requireAdmin(request)
    if (!auth.authorized) {
      return NextResponse.json(
        { ok: false, message: auth.message || 'Não autorizado' },
        { status: auth.message?.includes('Não autenticado') ? 401 : 403 }
      )
    }

    const { searchParams } = new URL(request.url)
    const parsed = querySchema.safeParse({
      year: searchParams.get('year'),
      month: searchParams.get('month'),
    })

    if (!parsed.success) {
      return NextResponse.json(
        { ok: false, message: 'Parâmetros inválidos', details: parsed.error.flatten() },
        { status: 400 }
      )
    }

    const { year, month } = parsed.data

    // Busca todas as notas do mês (ou do ano se month não especificado)
    const where: any = { year }
    if (month) {
      where.month = month
    }

    const notas = await prisma.nfseInvoice.findMany({
      where,
      orderBy: [
        { year: 'desc' },
        { month: 'desc' },
        { criadoEm: 'desc' },
      ],
    })

    const notasMapeadas: NfseRecord[] = notas.map((n) => ({
      id: n.id,
      enrollmentId: n.enrollmentId,
      studentName: n.studentName,
      cpf: n.cpf,
      year: n.year,
      month: n.month,
      amount: Number(n.amount),
      focusRef: n.focusRef,
      status: n.status as any,
      numero: n.numero || undefined,
      codigoVerificacao: n.codigoVerificacao || undefined,
      pdfUrl: n.pdfUrl || undefined,
      xmlUrl: n.xmlUrl || undefined,
      errorMessage: n.errorMessage || undefined,
      createdAt: n.criadoEm.toISOString(),
      updatedAt: n.atualizadoEm.toISOString(),
      cancelledAt: n.cancelledAt?.toISOString(),
      cancelReason: n.cancelReason || undefined,
    }))

    const autorizadas = notasMapeadas.filter((n) => n.status === 'autorizado' && !n.cancelledAt).length
    const canceladas = notasMapeadas.filter((n) => n.cancelledAt != null).length
    const pendentes = notasMapeadas.filter((n) => n.status === 'processando_autorizacao').length
    const erros = notasMapeadas.filter((n) => n.status === 'erro_autorizacao').length

    return NextResponse.json({
      ok: true,
      enabled: true,
      notas: notasMapeadas,
      total: notasMapeadas.length,
      autorizadas,
      canceladas,
      pendentes,
      erros,
    })
  } catch (error) {
    console.error('[api/admin/nfse GET]', error)
    return NextResponse.json(
      { ok: false, message: 'Erro ao listar NFSe' },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    if (!NFSE_ENABLED) {
      return NextResponse.json({
        enabled: false,
        message: 'NFSe desabilitada',
      })
    }

    const auth = await requireAdmin(request)
    if (!auth.authorized) {
      return NextResponse.json(
        { ok: false, message: auth.message || 'Não autorizado' },
        { status: auth.message?.includes('Não autenticado') ? 401 : 403 }
      )
    }

    const body = await request.json().catch(() => ({}))
    const parsed = postSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json(
        { ok: false, message: 'Dados inválidos', details: parsed.error.flatten() },
        { status: 400 }
      )
    }

    const { enrollmentId, year: bodyYear, month: bodyMonth, manual, amount: bodyAmount, extraDescription, observacoes } = parsed.data

    // Emissão individual (retry ou manual)
    if (enrollmentId) {
      const now = new Date()
      const year = bodyYear ?? now.getFullYear()
      const month = bodyMonth ?? now.getMonth() + 1

      try {
        const enrollment = await prisma.enrollment.findUnique({
          where: { id: enrollmentId },
          include: {
            user: { select: { email: true } },
            paymentInfo: true,
          },
        })

        if (!enrollment) {
          return NextResponse.json(
            { ok: false, message: 'Enrollment não encontrado' },
            { status: 404 }
          )
        }

        const finance = getEnrollmentFinanceData(enrollment)
        let valorMensalidade: number | null =
          enrollment.valorMensalidade != null
            ? Number(enrollment.valorMensalidade)
            : enrollment.paymentInfo?.valorMensal != null
              ? Number(enrollment.paymentInfo.valorMensal)
              : null

        if (manual) {
          if (bodyAmount != null && bodyAmount > 0) valorMensalidade = bodyAmount
        }

        if (!finance.cpf && !finance.cnpj) {
          return NextResponse.json(
            { ok: false, message: 'CPF do aluno/responsável ou CNPJ da empresa não cadastrado' },
            { status: 400 }
          )
        }

        if (!valorMensalidade || valorMensalidade <= 0) {
          return NextResponse.json(
            { ok: false, message: 'Valor de mensalidade não definido' },
            { status: 400 }
          )
        }

        // Constraint UNIQUE: se já existe nota autorizada para este aluno/mês, não permitir
        const existente = await prisma.nfseInvoice.findUnique({
          where: {
            enrollmentId_year_month: { enrollmentId, year, month },
          },
        })
        if (existente && existente.status === 'autorizado' && !existente.cancelledAt) {
          console.log('[api/admin/nfse POST] Já existe nota autorizada para enrollment/mês', { enrollmentId, year, month })
          return NextResponse.json(
            { ok: false, message: 'Já existe uma nota fiscal emitida para este aluno neste mês/ano. Não é possível emitir outra.' },
            { status: 409 }
          )
        }

        const nota = await emitirNfseParaAluno({
          enrollmentId,
          studentName: finance.nome,
          cpf: finance.cpf || undefined,
          cnpj: finance.cnpj || undefined,
          email: finance.email || undefined,
          amount: valorMensalidade,
          year,
          month,
          extraDescription: extraDescription?.trim() || undefined,
          alunoNome: enrollment.nome,
          frequenciaSemanal: enrollment.frequenciaSemanal ?? undefined,
          curso: enrollment.curso ?? undefined,
          customDescricaoEmpresa: enrollment.faturamentoDescricaoNfse ?? undefined,
        })

        console.log('[api/admin/nfse POST] NFSe emitida (individual)', { enrollmentId, year, month, manual: !!manual })
        return NextResponse.json({
          ok: true,
          emitidas: 1,
          erros: 0,
          detalhes: [
            {
              aluno: enrollment.nome,
              status: nota.status,
              focusRef: nota.focusRef,
            },
          ],
        })
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error)
        console.error('[api/admin/nfse POST] Erro emissão individual', { enrollmentId, error: errorMessage })
        return NextResponse.json({
          ok: false,
          message: 'Erro ao emitir NFSe',
          error: errorMessage,
        })
      }
    }

    // Emissão em lote: exige year e month
    const year = bodyYear
    const month = bodyMonth
    if (year == null || month == null) {
      return NextResponse.json(
        { ok: false, message: 'Para emissão em lote são obrigatórios year e month' },
        { status: 400 }
      )
    }

    // Emissão em lote: busca todos os pagamentos confirmados do mês sem NFSe
    const pagamentosPagos = await prisma.enrollmentPaymentMonth.findMany({
      where: {
        year,
        month,
        paymentStatus: 'PAGO',
      },
      include: {
        enrollment: {
          include: {
            user: { select: { email: true } },
            paymentInfo: true,
          },
        },
      },
    })

    const notasExistentes = await prisma.nfseInvoice.findMany({
      where: {
        year,
        month,
        status: 'autorizado',
        cancelledAt: null,
      },
      select: { enrollmentId: true },
    })

    const enrollmentIdsComNota = new Set(notasExistentes.map((n) => n.enrollmentId))
    const pagamentosSemNota = pagamentosPagos.filter((p) => !enrollmentIdsComNota.has(p.enrollmentId))

    let emitidas = 0
    let erros = 0
    const detalhes: Array<{ aluno: string; status: string; erro?: string }> = []

    for (const pagamento of pagamentosSemNota) {
      const enrollment = pagamento.enrollment
      if (!enrollment) continue

      const finance = getEnrollmentFinanceData(enrollment)
      const valorMensalidade =
        enrollment.valorMensalidade != null
          ? Number(enrollment.valorMensalidade)
          : enrollment.paymentInfo?.valorMensal != null
            ? Number(enrollment.paymentInfo.valorMensal)
            : null

      if ((!finance.cpf && !finance.cnpj) || !valorMensalidade || valorMensalidade <= 0) {
        erros++
        detalhes.push({
          aluno: enrollment.nome,
          status: 'erro',
          erro: (!finance.cpf && !finance.cnpj) ? 'CPF/CNPJ não cadastrado' : 'Valor mensalidade não definido',
        })
        continue
      }

      try {
        const obs = observacoes?.[enrollment.id]?.trim()
        const nota = await emitirNfseParaAluno({
          enrollmentId: enrollment.id,
          studentName: finance.nome,
          cpf: finance.cpf || undefined,
          cnpj: finance.cnpj || undefined,
          email: finance.email || undefined,
          amount: valorMensalidade,
          year,
          month,
          extraDescription: obs || undefined,
          alunoNome: enrollment.nome,
          frequenciaSemanal: enrollment.frequenciaSemanal ?? undefined,
          curso: enrollment.curso ?? undefined,
          customDescricaoEmpresa: enrollment.faturamentoDescricaoNfse ?? undefined,
        })
        emitidas++
        detalhes.push({
          aluno: enrollment.nome,
          status: nota.status,
        })
      } catch (error) {
        erros++
        const errorMessage = error instanceof Error ? error.message : String(error)
        detalhes.push({
          aluno: enrollment.nome,
          status: 'erro',
          erro: errorMessage,
        })
      }
    }

    console.log('[api/admin/nfse POST] Lote concluído', { year, month, emitidas, erros })
    return NextResponse.json({
      ok: true,
      emitidas,
      erros,
      detalhes,
    })
  } catch (error) {
    console.error('[api/admin/nfse POST]', error)
    return NextResponse.json(
      { ok: false, message: 'Erro ao emitir NFSe' },
      { status: 500 }
    )
  }
}
