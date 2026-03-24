/**
 * POST /api/admin/financeiro/administracao/upload-receipt
 * Salva NF/recibo no sistema (pasta public/uploads), sem Google Drive.
 * Body: FormData com file (arquivo), nome (nome da pessoa), year, month.
 * O arquivo é renomeado para: "nome-da-pessoa-mes-ano-uuid.ext"
 */

import { mkdir, writeFile } from 'fs/promises'
import { join } from 'path'
import { randomUUID } from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'

const MESES_LABELS: Record<number, string> = {
  1: 'Janeiro', 2: 'Fevereiro', 3: 'Março', 4: 'Abril', 5: 'Maio', 6: 'Junho',
  7: 'Julho', 8: 'Agosto', 9: 'Setembro', 10: 'Outubro', 11: 'Novembro', 12: 'Dezembro',
}

const MAX_BYTES = 8 * 1024 * 1024
const ALLOWED = new Set([
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
])

/** Remove caracteres inválidos para nome de arquivo */
function sanitizeFileName(name: string): string {
  return name
    .replace(/[/\\:*?"<>|]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function getExtension(filename: string): string {
  const i = filename.lastIndexOf('.')
  if (i <= 0) return ''
  return filename.slice(i)
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
    const nome = formData.get('nome') as string | null
    const yearParam = formData.get('year') as string | null
    const monthParam = formData.get('month') as string | null

    if (!file || typeof file === 'string') {
      return NextResponse.json(
        { ok: false, message: 'Arquivo é obrigatório.' },
        { status: 400 }
      )
    }
    if (!nome || !nome.trim()) {
      return NextResponse.json(
        { ok: false, message: 'Nome da pessoa é obrigatório.' },
        { status: 400 }
      )
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json({ ok: false, message: 'Arquivo muito grande (máx. 8 MB).' }, { status: 400 })
    }
    const mime = file.type || 'application/octet-stream'
    if (!ALLOWED.has(mime)) {
      return NextResponse.json(
        { ok: false, message: 'Formato não permitido. Use PDF, imagem, DOC ou DOCX.' },
        { status: 400 }
      )
    }
    const year = yearParam ? parseInt(yearParam, 10) : new Date().getFullYear()
    const month = monthParam ? parseInt(monthParam, 10) : new Date().getMonth() + 1
    if (Number.isNaN(year) || Number.isNaN(month) || month < 1 || month > 12) {
      return NextResponse.json(
        { ok: false, message: 'Ano e mês inválidos.' },
        { status: 400 }
      )
    }

    const mesNome = MESES_LABELS[month] ?? String(month)
    const safeNome = sanitizeFileName(nome.trim()).toLowerCase().replace(/\s+/g, '-')
    const ext = getExtension(file.name) || '.bin'
    const name = `${safeNome}-${mesNome.toLowerCase()}-${year}-${randomUUID()}${ext}`
    const dir = join(process.cwd(), 'public', 'uploads', 'admin-receipts')
    await mkdir(dir, { recursive: true })
    const fullPath = join(dir, name)
    const buffer = Buffer.from(await file.arrayBuffer())
    await writeFile(fullPath, buffer)
    const url = `/uploads/admin-receipts/${name}`

    return NextResponse.json({
      ok: true,
      message: 'Arquivo salvo no sistema com sucesso.',
      data: { name, url },
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Erro ao salvar arquivo.'
    return NextResponse.json(
      { ok: false, message },
      { status: 500 }
    )
  }
}
