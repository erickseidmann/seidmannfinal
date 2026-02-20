/**
 * GET /api/admin/nfse/[ref]
 * DELETE /api/admin/nfse/[ref]
 * 
 * Consultar e cancelar NFSe por referência.
 */

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAdmin } from '@/lib/auth'
import { atualizarStatusNfse, cancelarNfseDoAluno } from '@/lib/nfse/service'
import { prisma } from '@/lib/prisma'
import { NfseRecord } from '@/lib/nfse/types'

const NFSE_ENABLED = process.env.NFSE_ENABLED === 'true'

const deleteSchema = z.object({
  justificativa: z.string().min(15, 'Justificativa deve ter no mínimo 15 caracteres'),
})

function mapToNfseRecord(prismaRecord: any): NfseRecord {
  return {
    id: prismaRecord.id,
    enrollmentId: prismaRecord.enrollmentId,
    studentName: prismaRecord.studentName,
    cpf: prismaRecord.cpf,
    year: prismaRecord.year,
    month: prismaRecord.month,
    amount: Number(prismaRecord.amount),
    focusRef: prismaRecord.focusRef,
    status: prismaRecord.status as any,
    numero: prismaRecord.numero || undefined,
    codigoVerificacao: prismaRecord.codigoVerificacao || undefined,
    pdfUrl: prismaRecord.pdfUrl || undefined,
    xmlUrl: prismaRecord.xmlUrl || undefined,
    errorMessage: prismaRecord.errorMessage || undefined,
    createdAt: prismaRecord.criadoEm.toISOString(),
    updatedAt: prismaRecord.atualizadoEm.toISOString(),
    cancelledAt: prismaRecord.cancelledAt?.toISOString(),
    cancelReason: prismaRecord.cancelReason || undefined,
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: { ref: string } }
) {
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

    const { ref } = params

    // Consulta status atualizado na Focus NFe
    const notaAtualizada = await atualizarStatusNfse(ref)

    return NextResponse.json({
      ok: true,
      nota: notaAtualizada,
    })
  } catch (error) {
    console.error('[api/admin/nfse/[ref] GET]', error)
    const errorMessage = error instanceof Error ? error.message : String(error)
    return NextResponse.json(
      { ok: false, message: 'Erro ao consultar NFSe', error: errorMessage },
      { status: 500 }
    )
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { ref: string } }
) {
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

    const { ref } = params
    const body = await request.json().catch(() => ({}))
    const parsed = deleteSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json(
        { ok: false, message: 'Dados inválidos', details: parsed.error.flatten() },
        { status: 400 }
      )
    }

    const { justificativa } = parsed.data

    const notaCancelada = await cancelarNfseDoAluno(ref, justificativa)

    return NextResponse.json({
      ok: true,
      nota: notaCancelada,
    })
  } catch (error) {
    console.error('[api/admin/nfse/[ref] DELETE]', error)
    const errorMessage = error instanceof Error ? error.message : String(error)
    return NextResponse.json(
      { ok: false, message: 'Erro ao cancelar NFSe', error: errorMessage },
      { status: 500 }
    )
  }
}
