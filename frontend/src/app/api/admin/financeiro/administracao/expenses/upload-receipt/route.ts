/**
 * POST /api/admin/financeiro/administracao/expenses/upload-receipt
 * FormData: file (obrigatório)
 * Retorna { url } relativo a /public para gravar em AdminExpense.receiptUrl
 */

import { mkdir, writeFile } from 'fs/promises'
import { join } from 'path'
import { randomUUID } from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'

const MAX_BYTES = 8 * 1024 * 1024
const ALLOWED = new Set([
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
])

function extFromMime(mime: string): string {
  if (mime === 'application/pdf') return '.pdf'
  if (mime === 'image/png') return '.png'
  if (mime === 'image/jpeg') return '.jpg'
  if (mime === 'image/webp') return '.webp'
  if (mime === 'image/gif') return '.gif'
  return ''
}

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
    const file = formData.get('file') as File | null
    if (!file || typeof file === 'string') {
      return NextResponse.json({ ok: false, message: 'Arquivo é obrigatório.' }, { status: 400 })
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json({ ok: false, message: 'Arquivo muito grande (máx. 8 MB).' }, { status: 400 })
    }
    const mime = file.type || 'application/octet-stream'
    if (!ALLOWED.has(mime)) {
      return NextResponse.json(
        { ok: false, message: 'Formato não permitido. Use PDF ou imagem (PNG, JPG, WebP).' },
        { status: 400 }
      )
    }

    const ext = extFromMime(mime) || '.bin'
    const dir = join(process.cwd(), 'public', 'uploads', 'admin-expenses')
    await mkdir(dir, { recursive: true })
    const name = `${randomUUID()}${ext}`
    const fullPath = join(dir, name)
    const buffer = Buffer.from(await file.arrayBuffer())
    await writeFile(fullPath, buffer)

    const url = `/uploads/admin-expenses/${name}`
    return NextResponse.json({ ok: true, data: { url } })
  } catch (e) {
    console.error('[upload-receipt expense]', e)
    return NextResponse.json({ ok: false, message: 'Erro ao salvar comprovante.' }, { status: 500 })
  }
}
