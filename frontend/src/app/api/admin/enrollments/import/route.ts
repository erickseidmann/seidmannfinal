/**
 * API Route: POST /api/admin/enrollments/import
 * Importa alunos (matrículas) a partir de arquivo CSV
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/auth'

function generateTrackingCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let code = 'MAT-'
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return code
}

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

/** Normaliza nome de coluna: trim, minúsculas, sem espaços/underscores (ex: "Valor Mensalidade" -> "valormensalidade") */
function normalizeHeader(h: string): string {
  return h
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/_/g, '')
}

const VALID_STATUS = [
  'LEAD',
  'REGISTERED',
  'CONTRACT_ACCEPTED',
  'PAYMENT_PENDING',
  'ACTIVE',
  'INACTIVE',
  'PAUSED',
  'BLOCKED',
  'COMPLETED',
]
const VALID_CURSO = ['INGLES', 'ESPANHOL', 'INGLES_E_ESPANHOL']
const VALID_TEMPO = [30, 40, 60, 120]
const VALID_TIPO_AULA = ['PARTICULAR', 'GRUPO']

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

    const headerRow = rows[0].map((h) => normalizeHeader(h))
    const headerMap: Record<string, number> = {}
    headerRow.forEach((h, i) => {
      headerMap[h] = i
    })

    const nomeIdx = headerMap['nome'] ?? headerMap['name']
    const emailIdx = headerMap['email']
    const whatsappIdx = headerMap['whatsapp']
    if (nomeIdx === undefined || emailIdx === undefined || whatsappIdx === undefined) {
      return NextResponse.json(
        { ok: false, message: 'Colunas obrigatórias: nome, email e whatsapp' },
        { status: 400 }
      )
    }

    const get = (row: string[], key: string) => row[headerMap[normalizeHeader(key)] ?? -1]?.trim() ?? ''

    // Validação: só importa se os dados estiverem nas colunas certas (ex: valor numérico em valorMensalidade)
    const validationErrors: { row: number; message: string }[] = []
    for (let r = 1; r < rows.length; r++) {
      const row = rows[r]
      const rowNum = r + 1

      const vm = get(row, 'valormensalidade')
      if (vm !== '') {
        const n = Number(String(vm).replace(',', '.'))
        if (Number.isNaN(n)) {
          validationErrors.push({
            row: rowNum,
            message: `Coluna "Valor Mensalidade" deve conter número (valor encontrado: "${vm}"). Verifique se as colunas do CSV estão na mesma ordem do modelo.`,
          })
        }
      }

      const dp = get(row, 'diapagamento')
      if (dp !== '') {
        const n = Number(dp)
        if (Number.isNaN(n) || n < 1 || n > 31) {
          validationErrors.push({
            row: rowNum,
            message: `Coluna "Dia Pagamento" deve ser um número entre 1 e 31 (valor: "${dp}").`,
          })
        }
      }

      const ta = get(row, 'tempoaulaminutos')
      if (ta !== '' && !VALID_TEMPO.includes(Number(ta))) {
        validationErrors.push({
          row: rowNum,
          message: `Coluna "Tempo Aula Minutos" deve ser 30, 40, 60 ou 120 (valor: "${ta}").`,
        })
      }

      const metodoVal = get(row, 'metodopagamento')
      if (metodoVal !== '' && /^\d+([.,]\d+)?$/.test(metodoVal)) {
        validationErrors.push({
          row: rowNum,
          message: `Coluna "Método de Pagamento" parece conter valor numérico ("${metodoVal}"). Verifique se as colunas do CSV estão na mesma ordem do modelo.`,
        })
      }
    }

    if (validationErrors.length > 0) {
      return NextResponse.json(
        {
          ok: false,
          message: 'Arquivo com colunas em ordem incorreta ou dados inválidos. Corrija o CSV usando o modelo e tente novamente.',
          validationErrors: validationErrors.slice(0, 20),
          totalValidationErrors: validationErrors.length,
        },
        { status: 400 }
      )
    }

    const created: { id: string; nome: string; email: string }[] = []
    const errors: { row: number; message: string }[] = []

    for (let r = 1; r < rows.length; r++) {
      const row = rows[r]
      const rowNum = r + 1
      const nome = get(row, 'nome')
      const email = (get(row, 'email') || '').toLowerCase()
      const whatsapp = get(row, 'whatsapp')

      if (!nome || !email || !whatsapp) {
        errors.push({ row: rowNum, message: 'Nome, email e whatsapp são obrigatórios' })
        continue
      }

      const dataNascimentoRaw = get(row, 'datanascimento')
      let dataNascimento: Date | null = null
      if (dataNascimentoRaw) {
        const d = new Date(dataNascimentoRaw)
        if (!Number.isNaN(d.getTime())) dataNascimento = d
      }

      let status = (get(row, 'status') || 'LEAD').toUpperCase()
      if (!VALID_STATUS.includes(status)) status = 'LEAD'

      let curso: string | null = get(row, 'curso') || null
      if (curso) {
        const u = curso.toUpperCase().replace(/\s/g, '_')
        if (VALID_CURSO.includes(u)) curso = u
        else curso = null
      }

      let frequenciaSemanal: number | null = null
      const fs = get(row, 'frequenciasemanal')
      if (fs && fs !== '') {
        const n = Number(fs)
        if (!Number.isNaN(n)) frequenciaSemanal = Math.min(7, Math.max(1, Math.round(n)))
      }

      let tempoAulaMinutos: number | null = null
      const ta = get(row, 'tempoaulaminutos')
      if (ta && ta !== '') {
        const n = Number(ta)
        if (!Number.isNaN(n) && VALID_TEMPO.includes(n)) tempoAulaMinutos = n
      }

      let tipoAula: string | null = (get(row, 'tipoaula') || '').toUpperCase() || null
      if (tipoAula && !VALID_TIPO_AULA.includes(tipoAula)) tipoAula = null
      const nomeGrupo = tipoAula === 'GRUPO' ? (get(row, 'nomegrupo') || null) : null

      const moraNoExterior = /^(1|true|sim|s|yes|y)$/i.test(get(row, 'moranoexterior'))

      let valorMensalidade: number | null = null
      const vm = get(row, 'valormensalidade')
      if (vm && vm !== '') {
        const n = Number(String(vm).replace(',', '.'))
        if (!Number.isNaN(n)) valorMensalidade = n
      }

      let diaPagamento: number | null = null
      const dp = get(row, 'diapagamento')
      if (dp && dp !== '') {
        const n = Number(dp)
        if (!Number.isNaN(n)) diaPagamento = Math.min(31, Math.max(1, Math.round(n)))
      }

      let trackingCode = generateTrackingCode()
      let attempts = 0
      while (attempts < 10) {
        const existing = await prisma.enrollment.findUnique({ where: { trackingCode } })
        if (!existing) break
        trackingCode = generateTrackingCode()
        attempts++
      }

      try {
        const enrollment = await prisma.enrollment.create({
          data: {
            nome,
            email,
            whatsapp,
            status: status as any,
            trackingCode,
            dataNascimento,
            nomeResponsavel: get(row, 'nomeresponsavel') || null,
            cpf: get(row, 'cpf')?.replace(/\D/g, '').slice(0, 14) || null,
            cpfResponsavel: get(row, 'cpfresponsavel')?.replace(/\D/g, '').slice(0, 14) || null,
            curso,
            frequenciaSemanal,
            tempoAulaMinutos,
            tipoAula,
            nomeGrupo,
            cep: moraNoExterior ? null : (get(row, 'cep')?.replace(/\D/g, '').slice(0, 9) || null),
            rua: moraNoExterior ? null : (get(row, 'rua') || null),
            cidade: moraNoExterior ? null : (get(row, 'cidade') || null),
            estado: moraNoExterior ? null : (get(row, 'estado')?.slice(0, 2) || null),
            numero: moraNoExterior ? null : (get(row, 'numero') || null),
            complemento: moraNoExterior ? null : (get(row, 'complemento') || null),
            moraNoExterior,
            enderecoExterior: moraNoExterior ? (get(row, 'enderecoexterior') || null) : null,
            valorMensalidade,
            metodoPagamento: get(row, 'metodopagamento') || null,
            diaPagamento,
            melhoresHorarios: get(row, 'melhoreshorarios') || null,
            melhoresDiasSemana: get(row, 'melhoresdiassemana') || null,
            nomeVendedor: get(row, 'nomevendedor') || null,
            nomeEmpresaOuIndicador: get(row, 'nomeempresaouindicador') || null,
            observacoes: get(row, 'observacoes') || null,
          },
        })
        created.push({
          id: enrollment.id,
          nome: enrollment.nome,
          email: enrollment.email,
        })
      } catch (err) {
        console.error('[enrollments/import] Erro ao criar aluno linha', rowNum, err)
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
        enrollments: created,
        errors,
      },
    })
  } catch (error) {
    console.error('[api/admin/enrollments/import] Erro:', error)
    return NextResponse.json(
      { ok: false, message: 'Erro ao importar alunos' },
      { status: 500 }
    )
  }
}
