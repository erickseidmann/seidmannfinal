/**
 * DELETE /api/admin/certificates/[id] — desativa certificado (somente admin autenticado)
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/auth'

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const auth = await requireAdmin(request)
    if (!auth.authorized || !auth.session) {
      return NextResponse.json(
        { ok: false, message: auth.message || 'Não autorizado' },
        { status: auth.message?.includes('Não autenticado') ? 401 : 403 }
      )
    }

    const existing = await prisma.onlineCertificate.findUnique({
      where: { id: params.id },
    })
    if (!existing) {
      return NextResponse.json({ ok: false, message: 'Certificado não encontrado' }, { status: 404 })
    }

    await prisma.onlineCertificate.update({
      where: { id: params.id },
      data: { active: false },
    })

    return NextResponse.json({ ok: true, data: { id: params.id } })
  } catch (error) {
    console.error('[api/admin/certificates DELETE]', error)
    return NextResponse.json({ ok: false, message: 'Erro ao excluir certificado' }, { status: 500 })
  }
}
