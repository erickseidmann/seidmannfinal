/**
 * GET /api/public/certificates/validate/[code] — validação pública de certificado
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { serializeCertificatePublic } from '@/lib/certificate-serialize'

export async function GET(
  _request: NextRequest,
  { params }: { params: { code: string } }
) {
  try {
    const code = decodeURIComponent(params.code || '').trim()
    if (!code) {
      return NextResponse.json({ ok: false, message: 'Código inválido' }, { status: 400 })
    }

    const row = await prisma.onlineCertificate.findUnique({
      where: { certificateNo: code },
    })

    if (!row || !row.active) {
      return NextResponse.json(
        { ok: false, message: 'Certificado não encontrado ou não está mais ativo' },
        { status: 404 }
      )
    }

    return NextResponse.json({
      ok: true,
      data: serializeCertificatePublic(row),
    })
  } catch (error) {
    console.error('[api/public/certificates/validate GET]', error)
    return NextResponse.json({ ok: false, message: 'Erro ao validar certificado' }, { status: 500 })
  }
}
