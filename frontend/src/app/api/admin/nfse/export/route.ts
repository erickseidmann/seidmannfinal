/**
 * GET /api/admin/nfse/export?year=2026&month=1&format=xml|csv
 * 
 * Exportar XMLs (ZIP) ou CSV das notas do mês.
 */

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAdmin } from '@/lib/auth'
import { exportarXmlsDoMes, listarNfseDoMes } from '@/lib/nfse/service'

const NFSE_ENABLED = process.env.NFSE_ENABLED === 'true'

const querySchema = z.object({
  year: z.coerce.number().int().min(2000).max(2100),
  month: z.coerce.number().int().min(1).max(12),
  format: z.enum(['xml', 'csv']).default('xml'),
})

const MESES = [
  '',
  'Janeiro',
  'Fevereiro',
  'Março',
  'Abril',
  'Maio',
  'Junho',
  'Julho',
  'Agosto',
  'Setembro',
  'Outubro',
  'Novembro',
  'Dezembro',
]

function escapeCsvCell(s: string): string {
  if (/[;"\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
}

export async function GET(request: NextRequest) {
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

    const { searchParams } = new URL(request.url)
    const parsed = querySchema.safeParse({
      year: searchParams.get('year'),
      month: searchParams.get('month'),
      format: searchParams.get('format') || 'xml',
    })

    if (!parsed.success) {
      return NextResponse.json(
        { ok: false, message: 'Parâmetros inválidos', details: parsed.error.flatten() },
        { status: 400 }
      )
    }

    const { year, month, format } = parsed.data

    if (format === 'csv') {
      // Exportar CSV
      const notas = await listarNfseDoMes(year, month)

      const headers = ['Número', 'Data Emissão', 'Aluno', 'CPF', 'Valor', 'Status', 'Código Verificação']
      const rows = notas.map((nota) => [
        nota.numero || '-',
        nota.createdAt ? new Date(nota.createdAt).toLocaleDateString('pt-BR') : '-',
        nota.studentName,
        nota.cpf,
        nota.amount.toFixed(2).replace('.', ','),
        nota.status,
        nota.codigoVerificacao || '-',
      ])

      const csvLines = [
        headers.map(escapeCsvCell).join(';'),
        ...rows.map((row) => row.map(escapeCsvCell).join(';')),
      ]

      const csvContent = csvLines.join('\n')

      return new NextResponse(csvContent, {
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="NFSe_Seidmann_${month}_${year}.csv"`,
        },
      })
    }

    // Exportar XMLs em ZIP
    const { xmls } = await exportarXmlsDoMes(year, month)

    if (xmls.length === 0) {
      return NextResponse.json(
        { ok: false, message: 'Nenhuma nota encontrada para exportar' },
        { status: 404 }
      )
    }

    // Tentar usar archiver se disponível, senão retornar JSON com instruções
    try {
      const archiver = require('archiver')

      return new Promise<NextResponse>((resolve, reject) => {
        const archive = archiver('zip', { zlib: { level: 9 } })
        const chunks: Buffer[] = []

        archive.on('error', (err: Error) => reject(err))
        archive.on('data', (chunk: Buffer) => chunks.push(chunk))
        archive.on('end', () => {
          const zipBuffer = Buffer.concat(chunks)
          resolve(
            new NextResponse(zipBuffer, {
              headers: {
                'Content-Type': 'application/zip',
                'Content-Disposition': `attachment; filename="NFSe_Seidmann_${MESES[month]}_${year}.zip"`,
              },
            })
          )
        })

        for (const xml of xmls) {
          archive.append(xml.content, { name: xml.filename })
        }

        archive.finalize()
      })
    } catch (archiverError) {
      // Se archiver não estiver instalado, retornar JSON com instruções
      return NextResponse.json({
        ok: false,
        message: 'Biblioteca archiver não encontrada. Para exportar ZIP, instale: npm install archiver @types/archiver',
        xmls: xmls.map((x) => ({ filename: x.filename, size: x.content.length })),
        total: xmls.length,
        installCommand: 'npm install archiver @types/archiver',
      })
    }
  } catch (error) {
    console.error('[api/admin/nfse/export GET]', error)
    return NextResponse.json(
      { ok: false, message: 'Erro ao exportar NFSe' },
      { status: 500 }
    )
  }
}
