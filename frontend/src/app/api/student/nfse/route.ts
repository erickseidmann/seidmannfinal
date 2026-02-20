/**
 * GET /api/student/nfse?year=2026
 * 
 * Aluno consulta suas notas fiscais (apenas autorizadas).
 */

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { requireStudent } from '@/lib/auth'

const NFSE_ENABLED = process.env.NFSE_ENABLED === 'true'

const querySchema = z.object({
  year: z.coerce.number().int().min(2000).max(2100).optional(),
})

export async function GET(request: NextRequest) {
  try {
    if (!NFSE_ENABLED) {
      return NextResponse.json({
        enabled: false,
        message: 'NFSe desabilitada',
      })
    }

    const auth = await requireStudent(request)
    if (!auth.authorized || !auth.session) {
      return NextResponse.json(
        { ok: false, message: auth.message || 'Não autorizado' },
        { status: auth.message?.includes('Não autenticado') ? 401 : 403 }
      )
    }

    // Busca enrollment ativo do aluno
    const enrollment = await prisma.enrollment.findFirst({
      where: {
        userId: auth.session.userId,
        status: 'ACTIVE',
      },
      orderBy: { criadoEm: 'desc' },
    })

    if (!enrollment) {
      return NextResponse.json({
        ok: true,
        notas: [],
        message: 'Nenhuma matrícula ativa encontrada',
      })
    }

    const { searchParams } = new URL(request.url)
    const parsed = querySchema.safeParse({
      year: searchParams.get('year'),
    })

    const year = parsed.success && parsed.data.year ? parsed.data.year : new Date().getFullYear()

    // Busca apenas notas autorizadas (não canceladas) do aluno
    const notas = await prisma.nfseInvoice.findMany({
      where: {
        enrollmentId: enrollment.id,
        year,
        status: 'autorizado',
        cancelledAt: null,
      },
      orderBy: [
        { month: 'desc' },
        { criadoEm: 'desc' },
      ],
    })

    const notasFormatadas = notas.map((nota) => ({
      numero: nota.numero || null,
      mes: nota.month,
      ano: nota.year,
      valor: Number(nota.amount),
      pdfUrl: nota.pdfUrl || null,
      status: nota.status,
      codigoVerificacao: nota.codigoVerificacao || null,
      dataEmissao: nota.criadoEm.toISOString(),
    }))

    return NextResponse.json({
      ok: true,
      notas: notasFormatadas,
    })
  } catch (error) {
    console.error('[api/student/nfse GET]', error)
    return NextResponse.json(
      { ok: false, message: 'Erro ao consultar notas fiscais' },
      { status: 500 }
    )
  }
}
