/**
 * GET /api/admin/financeiro/administracao/bank-extratos/download?year=&month=
 * Um arquivo: download direto. Vários: ZIP.
 */

import { createReadStream } from 'fs'
import { readFile } from 'fs/promises'
import { join } from 'path'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAdmin } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const querySchema = z.object({
  year: z.coerce.number().int().min(2000).max(2100),
  month: z.coerce.number().int().min(1).max(12),
})

function diskPathFromPublicUrl(fileUrl: string): string {
  const rel = fileUrl.replace(/^\//, '')
  return join(process.cwd(), 'public', rel)
}

function safeZipName(original: string, index: number): string {
  const base = original.replace(/[/\\?*:|"<>]/g, '_').slice(0, 180)
  return base || `extrato_${index + 1}`
}

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
    })

    if (rows.length === 0) {
      return NextResponse.json(
        { ok: false, message: 'Nenhum extrato enviado para este mês.' },
        { status: 404 }
      )
    }

    if (rows.length === 1) {
      const r = rows[0]
      const path = diskPathFromPublicUrl(r.fileUrl)
      const buf = await readFile(path)
      const mime = r.mimeType || 'application/octet-stream'
      return new NextResponse(buf, {
        headers: {
          'Content-Type': mime,
          'Content-Disposition': `attachment; filename="${encodeURIComponent(r.originalFilename)}"`,
        },
      })
    }

    try {
      const archiver = require('archiver') as typeof import('archiver')
      return await new Promise<NextResponse>((resolve, reject) => {
        const archive = archiver('zip', { zlib: { level: 6 } })
        const chunks: Buffer[] = []
        archive.on('error', (err: Error) => reject(err))
        archive.on('data', (chunk: Buffer) => chunks.push(chunk))
        archive.on('end', () => {
          const zipBuffer = Buffer.concat(chunks)
          resolve(
            new NextResponse(zipBuffer, {
              headers: {
                'Content-Type': 'application/zip',
                'Content-Disposition': `attachment; filename="extratos-banco_${year}-${String(month).padStart(2, '0')}.zip"`,
              },
            })
          )
        })

        rows.forEach((r, i) => {
          const path = diskPathFromPublicUrl(r.fileUrl)
          const nameInZip = `${String(i + 1).padStart(2, '0')}_${safeZipName(r.originalFilename, i)}`
          archive.append(createReadStream(path), { name: nameInZip })
        })
        archive.finalize()
      })
    } catch (archErr) {
      console.error('[bank-extratos download zip]', archErr)
      return NextResponse.json(
        { ok: false, message: 'Não foi possível gerar o ZIP. Tente baixar os arquivos individualmente.' },
        { status: 500 }
      )
    }
  } catch (e) {
    console.error('[bank-extratos download GET]', e)
    return NextResponse.json({ ok: false, message: 'Erro ao baixar extratos.' }, { status: 500 })
  }
}
