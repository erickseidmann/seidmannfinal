/**
 * GET /api/admin/financeiro/recebimentos/[id]/candidatos
 * Alunos sugeridos pelo documento do pagador (cadastro / PayerLink).
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { findEnrollmentCandidatesByDocumento } from '@/lib/payments/reconcile'

export async function GET(
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

    const rp = await prisma.receivedPayment.findUnique({
      where: { id: params.id },
      select: { documentoPagador: true },
    })
    if (!rp) {
      return NextResponse.json(
        { ok: false, message: 'Recebimento não encontrado' },
        { status: 404 }
      )
    }

    const items = await findEnrollmentCandidatesByDocumento(rp.documentoPagador)

    return NextResponse.json({ ok: true, data: { items } })
  } catch (error) {
    console.error('[recebimentos/candidatos GET]', error)
    return NextResponse.json(
      { ok: false, message: 'Erro ao buscar candidatos' },
      { status: 500 }
    )
  }
}
