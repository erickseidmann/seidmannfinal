/**
 * API Route: POST /api/admin/teachers/import
 * Importa professores a partir de arquivo CSV
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/auth'

function parseCSVLine(line: string): string[] {
  const result: string[] = []
  let current = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (c === '"') {
      inQuotes = !inQuotes
    } else if (c === ',' && !inQuotes) {
      result.push(current.trim())
      current = ''
    } else {
      current += c
    }
  }
  result.push(current.trim())
  return result
}

function parseCSV(text: string): string[][] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim())
  return lines.map((l) => parseCSVLine(l))
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

    if (!prisma.teacher) {
      return NextResponse.json(
        { ok: false, message: 'Modelo Teacher não disponível' },
        { status: 503 }
      )
    }

    const formData = await request.formData()
    const file = formData.get('file') as File | null
    if (!file || !(file instanceof File)) {
      return NextResponse.json(
        { ok: false, message: 'Envie um arquivo CSV' },
        { status: 400 }
      )
    }

    const ext = file.name.split('.').pop()?.toLowerCase()
    if (ext !== 'csv') {
      return NextResponse.json(
        { ok: false, message: 'Formato inválido. Use arquivo .csv' },
        { status: 400 }
      )
    }

    const buffer = await file.arrayBuffer()
    const text = new TextDecoder('utf-8').decode(buffer)
    const rows = parseCSV(text)
    if (rows.length < 2) {
      return NextResponse.json(
        { ok: false, message: 'Arquivo deve ter cabeçalho e ao menos uma linha de dados' },
        { status: 400 }
      )
    }

    const headerRow = rows[0].map((h) => h.trim().toLowerCase())
    const headerMap: Record<string, number> = {}
    headerRow.forEach((h, i) => {
      headerMap[h] = i
    })

    const nomeIdx = headerMap['nome'] ?? headerMap['name']
    const emailIdx = headerMap['email']
    if (nomeIdx === undefined || emailIdx === undefined) {
      return NextResponse.json(
        { ok: false, message: 'Colunas obrigatórias: nome e email' },
        { status: 400 }
      )
    }

    const created: { id: string; nome: string; email: string }[] = []
    const errors: { row: number; message: string }[] = []
    const seenEmails = new Set<string>()

    for (let r = 1; r < rows.length; r++) {
      const row = rows[r]
      const rowNum = r + 1
      const nome = row[nomeIdx]?.trim()
      const email = (row[emailIdx]?.trim() ?? '').toLowerCase()
      if (!nome || !email) {
        errors.push({ row: rowNum, message: 'Nome e email obrigatórios' })
        continue
      }
      if (seenEmails.has(email)) {
        errors.push({ row: rowNum, message: `Email duplicado no arquivo: ${email}` })
        continue
      }
      seenEmails.add(email)

      const existing = await prisma.teacher.findUnique({
        where: { email },
      })
      if (existing) {
        errors.push({ row: rowNum, message: `Email já cadastrado: ${email}` })
        continue
      }

      const metodoPagamento = row[headerMap['metodopagamento']]?.trim() || null
      if (
        metodoPagamento &&
        !['PIX', 'CARTAO', 'OUTRO'].includes(metodoPagamento.toUpperCase())
      ) {
        errors.push({
          row: rowNum,
          message: `Método de pagamento inválido: ${metodoPagamento}`,
        })
        continue
      }

      const statusRaw = (row[headerMap['status']]?.trim() || 'ACTIVE').toUpperCase()
      const status =
        statusRaw === 'INACTIVE' || statusRaw === 'INATIVO' ? 'INACTIVE' : 'ACTIVE'

      let valorPorHora: number | null = null
      const vph = row[headerMap['valorporhora']]?.trim()
      if (vph && vph !== '') {
        const num = Number(String(vph).replace(',', '.'))
        if (!Number.isNaN(num)) valorPorHora = num
      }

      let nota: number | null = null
      const notaStr = row[headerMap['nota']]?.trim()
      if (notaStr && notaStr !== '') {
        const n = Number(notaStr)
        if (!Number.isNaN(n)) nota = Math.min(5, Math.max(1, Math.round(n)))
      }

      try {
        const teacher = await prisma.teacher.create({
          data: {
            nome: nome.trim(),
            nomePreferido: row[headerMap['nomepreferido']]?.trim() || null,
            email,
            whatsapp: row[headerMap['whatsapp']]?.trim() || null,
            cpf: row[headerMap['cpf']]?.trim() || null,
            cnpj: row[headerMap['cnpj']]?.trim() || null,
            valorPorHora,
            metodoPagamento: metodoPagamento?.toUpperCase() || null,
            infosPagamento: row[headerMap['infospagamento']]?.trim() || null,
            nota,
            status,
          },
        })
        created.push({
          id: teacher.id,
          nome: teacher.nome,
          email: teacher.email,
        })
      } catch (err) {
        console.error('[import] Erro ao criar professor linha', rowNum, err)
        errors.push({
          row: rowNum,
          message: err instanceof Error ? err.message : 'Erro ao salvar',
        })
      }
    }

    return NextResponse.json({
      ok: true,
      data: {
        created: created.length,
        teachers: created,
        errors,
      },
    })
  } catch (error) {
    console.error('[api/admin/teachers/import] Erro:', error)
    return NextResponse.json(
      { ok: false, message: 'Erro ao importar professores' },
      { status: 500 }
    )
  }
}
