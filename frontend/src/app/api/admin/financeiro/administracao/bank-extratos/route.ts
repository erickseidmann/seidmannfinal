/**
 * GET  /api/admin/financeiro/administracao/bank-extratos?year=&month=
 * POST /api/admin/financeiro/administracao/bank-extratos — FormData: year, month, file
 */

import { mkdir, writeFile } from 'fs/promises'
import { join } from 'path'
import { randomUUID } from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAdmin } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { parseExtratoForExpenses } from '@/lib/bank-extrato-parse'

const MAX_BYTES = 20 * 1024 * 1024
const MAX_EXPENSE_LINES_FROM_EXTRATO = 500

const ALLOWED_EXT = new Set(['.pdf', '.ofx', '.qfx', '.csv', '.txt', '.png', '.jpg', '.jpeg', '.webp', '.gif'])

const MIME_ALLOW = new Set([
  'application/pdf',
  'text/csv',
  'text/plain',
  'application/x-ofx',
  'application/ofx',
  'application/qfx',
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
])

function extFromName(name: string): string {
  const i = name.lastIndexOf('.')
  return i >= 0 ? name.slice(i).toLowerCase() : ''
}

function extFromMime(mime: string): string {
  const m = mime.toLowerCase()
  if (m === 'application/pdf') return '.pdf'
  if (m === 'image/png') return '.png'
  if (m === 'image/jpeg') return '.jpg'
  if (m === 'image/webp') return '.webp'
  if (m === 'image/gif') return '.gif'
  if (m === 'text/csv') return '.csv'
  if (m === 'text/plain') return '.txt'
  return ''
}

const querySchema = z.object({
  year: z.coerce.number().int().min(2000).max(2100),
  month: z.coerce.number().int().min(1).max(12),
})

export async function GET(request: NextRequest) {
  try {
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
      return NextResponse.json({ ok: false, message: 'Ano e mês inválidos.' }, { status: 400 })
    }

    const { year, month } = parsed.data
    const rows = await prisma.adminBankExtrato.findMany({
      where: { year, month },
      orderBy: { criadoEm: 'asc' },
      select: {
        id: true,
        year: true,
        month: true,
        originalFilename: true,
        fileUrl: true,
        mimeType: true,
        sizeBytes: true,
        criadoEm: true,
      },
    })

    return NextResponse.json({ ok: true, data: { items: rows } })
  } catch (e) {
    console.error('[bank-extratos GET]', e)
    return NextResponse.json({ ok: false, message: 'Erro ao listar extratos.' }, { status: 500 })
  }
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
    const yearRaw = formData.get('year')
    const monthRaw = formData.get('month')

    const year = typeof yearRaw === 'string' ? parseInt(yearRaw, 10) : Number(yearRaw)
    const month = typeof monthRaw === 'string' ? parseInt(monthRaw, 10) : Number(monthRaw)

    if (!file || typeof file === 'string') {
      return NextResponse.json({ ok: false, message: 'Arquivo é obrigatório.' }, { status: 400 })
    }
    if (!Number.isFinite(year) || !Number.isFinite(month) || month < 1 || month > 12) {
      return NextResponse.json({ ok: false, message: 'Ano e mês inválidos.' }, { status: 400 })
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json({ ok: false, message: 'Arquivo muito grande (máx. 20 MB).' }, { status: 400 })
    }

    const origName = file.name || 'extrato'
    const ext = extFromName(origName)
    const mime = (file.type || '').toLowerCase()

    const extOk = Boolean(ext && ALLOWED_EXT.has(ext))
    const mimeOk = Boolean(mime && MIME_ALLOW.has(mime))
    /** Bancos costumam mandar OFX/CSV/PDF como octet-stream; se a extensão é conhecida, aceita. */
    const octetStreamBank =
      mime === 'application/octet-stream' &&
      ext &&
      ['.ofx', '.qfx', '.csv', '.txt', '.pdf'].includes(ext)
    if (!extOk && !mimeOk && !octetStreamBank) {
      return NextResponse.json(
        {
          ok: false,
          message:
            'Formato não permitido. Use PDF, OFX/QFX, CSV, imagem ou TXT (extrato).',
        },
        { status: 400 }
      )
    }

    const safeExt = extOk ? ext : extFromMime(mime) || '.bin'
    const dir = join(process.cwd(), 'public', 'uploads', 'bank-extratos', String(year), String(month))
    await mkdir(dir, { recursive: true })
    const storedName = `${randomUUID()}${safeExt}`
    const fullPath = join(dir, storedName)
    const buffer = Buffer.from(await file.arrayBuffer())
    await writeFile(fullPath, buffer)

    const fileUrl = `/uploads/bank-extratos/${year}/${month}/${storedName}`

    const row = await prisma.adminBankExtrato.create({
      data: {
        year,
        month,
        originalFilename: origName.slice(0, 250),
        fileUrl,
        mimeType: mime || null,
        sizeBytes: buffer.length,
      },
      select: {
        id: true,
        originalFilename: true,
        fileUrl: true,
        criadoEm: true,
        sizeBytes: true,
      },
    })

    let expensesCreated = 0
    let parseFormat: 'ofx' | 'csv' | 'none' = 'none'
    let parseNote: string | undefined

    const textUtf8 = buffer.toString('utf-8')
    let parsed = parseExtratoForExpenses(textUtf8, safeExt, year, month)
    if (
      parsed.format === 'ofx' &&
      parsed.lines.length === 0 &&
      /OFXHEADER|<OFX|<STMTTRN/i.test(textUtf8)
    ) {
      const latin = buffer.toString('latin1')
      const alt = parseExtratoForExpenses(latin, safeExt, year, month)
      if (alt.lines.length > 0) parsed = alt
    }

    parseFormat = parsed.format
    if (parsed.lines.length > 0) {
      const slice = parsed.lines.slice(0, MAX_EXPENSE_LINES_FROM_EXTRATO)
      await prisma.adminExpense.createMany({
        data: slice.map((l) => ({
          name: l.name.slice(0, 500),
          description: l.description,
          valor: l.valor,
          year,
          month,
          paymentStatus: 'EM_ABERTO',
          isFixed: false,
        })),
      })
      expensesCreated = slice.length
    } else if (parseFormat === 'none') {
      parseNote =
        'Arquivo anexado. PDF e imagem não geram linhas na tabela — exporte OFX ou CSV no banco para lançar despesas automaticamente.'
    } else {
      parseNote = `Arquivo anexado. Nenhuma despesa lançada para ${String(month).padStart(2, '0')}/${year}: confira se o extrato é desse mês ou se só há créditos (entradas).`
    }

    return NextResponse.json({
      ok: true,
      data: {
        ...row,
        expensesCreated,
        parseFormat,
        parseNote: expensesCreated > 0 ? undefined : parseNote,
      },
    })
  } catch (e) {
    console.error('[bank-extratos POST]', e)
    const raw = e instanceof Error ? e.message : String(e)

    let message =
      'Não foi possível importar o extrato. Verifique o formato do arquivo e tente de novo.'

    if (
      raw.includes('admin_bank_extratos') ||
      raw.includes("doesn't exist") ||
      raw.includes('does not exist') ||
      raw.includes('Unknown table')
    ) {
      message =
        'Tabela de extratos ainda não existe no banco. No servidor, rode: npx prisma migrate deploy (pasta frontend).'
    } else if (raw.includes('ENOENT') || raw.includes('EACCES') || raw.includes('EPERM')) {
      message = 'Sem permissão para gravar o arquivo em public/uploads. Verifique pastas no servidor.'
    } else if (process.env.NODE_ENV === 'development') {
      message = `[dev] ${raw.slice(0, 280)}`
    }

    return NextResponse.json({ ok: false, message }, { status: 500 })
  }
}
