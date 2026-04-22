/**
 * DELETE /api/admin/financeiro/administracao/bank-extratos/[id]
 */

import { unlink } from 'fs/promises'
import { join } from 'path'
import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

function diskPathFromPublicUrl(fileUrl: string): string {
  const rel = fileUrl.replace(/^\//, '')
  return join(process.cwd(), 'public', rel)
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAdmin(request)
    if (!auth.authorized) {
      return NextResponse.json(
        { ok: false, message: auth.message || 'Não autorizado' },
        { status: auth.message?.includes('Não autenticado') ? 401 : 403 }
      )
    }

    const { id } = await context.params
    if (!id) {
      return NextResponse.json({ ok: false, message: 'ID inválido.' }, { status: 400 })
    }

    const row = await prisma.adminBankExtrato.findUnique({ where: { id } })
    if (!row) {
      return NextResponse.json({ ok: false, message: 'Extrato não encontrado.' }, { status: 404 })
    }

    try {
      await unlink(diskPathFromPublicUrl(row.fileUrl))
    } catch {
      // arquivo já removido do disco — segue para apagar registro
    }

    // Remove também as movimentações importadas por este extrato.
    // O vínculo é salvo no campo description como [EXTRATO_ID:<id>].
    await prisma.adminExpense.deleteMany({
      where: {
        year: row.year,
        month: row.month,
        description: { contains: `[EXTRATO_ID:${row.id}]` },
      },
    })

    await prisma.adminBankExtrato.delete({ where: { id } })
    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('[bank-extratos DELETE]', e)
    return NextResponse.json({ ok: false, message: 'Erro ao remover extrato.' }, { status: 500 })
  }
}
