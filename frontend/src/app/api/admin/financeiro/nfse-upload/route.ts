import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { promises as fs } from 'fs'
import path from 'path'

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAdmin(request)
    if (!auth.authorized) {
      return NextResponse.json(
        { ok: false, message: auth.message || 'Não autorizado' },
        { status: auth.message?.includes('Não autenticado') ? 401 : 403 }
      )
    }

    const formData = await request.formData()
    const file = formData.get('file')

    if (!(file instanceof File)) {
      return NextResponse.json(
        { ok: false, message: 'Arquivo não enviado' },
        { status: 400 }
      )
    }

    if (file.type !== 'application/pdf') {
      return NextResponse.json(
        { ok: false, message: 'Envie um arquivo PDF da NF.' },
        { status: 400 }
      )
    }

    const bytes = await file.arrayBuffer()
    const buffer = Buffer.from(bytes)

    const uploadsDir = path.join(process.cwd(), 'public', 'uploads', 'nfse')
    await fs.mkdir(uploadsDir, { recursive: true })

    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
    const fileName = `${Date.now()}-${safeName || 'nf.pdf'}`
    const fullPath = path.join(uploadsDir, fileName)

    await fs.writeFile(fullPath, buffer)

    const publicPath = `/uploads/nfse/${fileName}`

    return NextResponse.json({
      ok: true,
      path: publicPath,
      filename: file.name,
    })
  } catch (error) {
    console.error('[api/admin/financeiro/nfse-upload POST]', error)
    return NextResponse.json(
      { ok: false, message: 'Erro ao salvar arquivo da NF' },
      { status: 500 }
    )
  }
}

