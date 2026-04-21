/**
 * Extrai lançamentos de extrato OFX/OFC/QFX e CSV simples (exportação bancária BR)
 * para criar linhas em AdminExpense (outras despesas).
 */

export type ParsedExtratoLine = {
  name: string
  description: string | null
  valor: number
  /** Ano/mês da data do lançamento (OFX DTPOSTED ou CSV) */
  year: number
  month: number
}

const INCOME_TRNTYPES = new Set(['CREDIT', 'DEP', 'DIRECTDEP', 'INT', 'DIV'])

const EXPENSE_TRNTYPES = new Set([
  'DEBIT',
  'POS',
  'ATM',
  'CHECK',
  'FEE',
  'SRVCHG',
  'PAYMENT',
  'WITHDRAWAL',
  'XFER',
])

function parseOfxDate(dt: string): { year: number; month: number; day: number } | null {
  const cleaned = dt.replace(/\[.*?\]$/, '').trim()
  const m = cleaned.match(/^(\d{4})(\d{2})(\d{2})/)
  if (!m) return null
  return { year: Number(m[1]), month: Number(m[2]), day: Number(m[3]) }
}

function getTag(block: string, tag: string): string {
  const patterns = [
    new RegExp(`<${tag}>([^<\\r\\n]+)`, 'i'),
    new RegExp(`^${tag}>([^<\\r\\n]+)`, 'im'),
  ]
  for (const re of patterns) {
    const x = block.match(re)
    if (x?.[1]) return x[1].trim()
  }
  return ''
}

/**
 * Quebra OFX em blocos STMTTRN (com ou sem tag de fechamento).
 */
function splitOfxStmtTrn(content: string): string[] {
  const normalized = content.replace(/\r\n/g, '\n')
  const blocks: string[] = []
  const re =
    /<STMTTRN>([\s\S]*?)(?=<\/STMTTRN>|<STMTTRN>|<\/BANKTRANLIST>|<\/STMTTRNS>|$)/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(normalized)) !== null) {
    if (m[1].trim()) blocks.push(m[1])
  }
  if (blocks.length > 0) return blocks
  const parts = normalized.split(/<STMTTRN>/i)
  for (let i = 1; i < parts.length; i++) {
    const chunk = parts[i].split(/<\/STMTTRN>/i)[0]
    if (chunk.trim()) blocks.push(chunk)
  }
  return blocks
}

function pushOfxBlock(
  block: string,
  out: ParsedExtratoLine[],
  relaxedAmount: boolean
): void {
  const trntype = getTag(block, 'TRNTYPE').toUpperCase()
  const trnamtRaw = getTag(block, 'TRNAMT')
  const dtposted = getTag(block, 'DTPOSTED')
  const memo = getTag(block, 'MEMO')
  const nameTag = getTag(block, 'NAME')
  const fitid = getTag(block, 'FITID')

  if (!trnamtRaw) return
  const amount = Number.parseFloat(trnamtRaw.replace(',', '.'))
  if (Number.isNaN(amount) || amount === 0) return

  const dateParsed = dtposted ? parseOfxDate(dtposted) : null
  if (!dateParsed) return

  const t = trntype || 'OTHER'
  if (INCOME_TRNTYPES.has(t) && amount > 0) return

  if (!relaxedAmount) {
    if (amount > 0 && !EXPENSE_TRNTYPES.has(t)) return
  }

  const valor = Math.abs(amount)
  const label = (memo || nameTag || 'Movimentação').slice(0, 200)
  const descParts = [fitid ? `FITID ${fitid}` : null, dtposted.slice(0, 8)].filter(Boolean)
  out.push({
    name: label || 'Movimentação',
    description: descParts.length ? descParts.join(' · ') : null,
    valor: Math.round(valor * 100) / 100,
    year: dateParsed.year,
    month: dateParsed.month,
  })
}

export function parseOfxContent(text: string): ParsedExtratoLine[] {
  const blocks = splitOfxStmtTrn(text)
  const out: ParsedExtratoLine[] = []
  for (const block of blocks) {
    pushOfxBlock(block, out, false)
  }
  if (blocks.length > 0 && out.length === 0) {
    for (const block of blocks) {
      pushOfxBlock(block, out, true)
    }
  }
  return out
}

/** CSV com separador ; ou , — tenta achar coluna de valor e data (dd/mm/aaaa ou yyyy-mm-dd) */
export function parseBankCsvContent(text: string): ParsedExtratoLine[] {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
  if (lines.length < 1) return []

  const sep = lines[0].split(';').length >= lines[0].split(',').length ? ';' : ','
  const header = lines[0].toLowerCase().split(sep).map((c) => c.trim().replace(/^\ufeff/, ''))

  const dateIdx = header.findIndex((h) => /data|date|dt|lan[cç]amento/i.test(h))
  const valueIdx = header.findIndex((h) => /valor|amount|value|d[eé]bito|cr[eé]dito/i.test(h))
  const histIdx = header.findIndex((h) => /hist|descri|memo|detalhe|lan[cç]amento/i.test(h))

  if (dateIdx >= 0 && valueIdx >= 0) {
    const rows: ParsedExtratoLine[] = []
    for (const line of lines.slice(1)) {
      const cols = splitCsvLine(line, sep)
      if (cols.length <= Math.max(dateIdx, valueIdx)) continue
      const dateStr = cols[dateIdx]?.trim() ?? ''
      let valStr = cols[valueIdx]?.trim() ?? ''
      valStr = valStr.replace(/R\$\s*/gi, '').replace(/\./g, '').replace(',', '.')
      const hist = histIdx >= 0 ? cols[histIdx]?.trim() : null
      const d = parseBrOrIsoDate(dateStr)
      const valor = Number.parseFloat(valStr.replace(/[^\d.-]/g, ''))
      if (!d || Number.isNaN(valor) || valor === 0) continue
      rows.push({
        name: (hist || 'Movimentação').slice(0, 200),
        description: dateStr,
        valor: Math.round(Math.abs(valor) * 100) / 100,
        year: d.year,
        month: d.month,
      })
    }
    return rows
  }

  return tryDetectCsvWithoutHeader(lines, sep)
}

function splitCsvLine(line: string, sep: string): string[] {
  const out: string[] = []
  let cur = ''
  let q = false
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (c === '"') {
      q = !q
      continue
    }
    if (c === sep && !q) {
      out.push(cur)
      cur = ''
      continue
    }
    cur += c
  }
  out.push(cur)
  return out
}

function parseBrOrIsoDate(s: string): { year: number; month: number } | null {
  const br = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/)
  if (br) {
    return { year: Number(br[3]), month: Number(br[2]) }
  }
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (iso) {
    return { year: Number(iso[1]), month: Number(iso[2]) }
  }
  return null
}

/** Sem cabeçalho reconhecido: linhas com data BR e número no fim */
function tryDetectCsvWithoutHeader(lines: string[], sep: string): ParsedExtratoLine[] {
  const rows: ParsedExtratoLine[] = []
  for (const line of lines) {
    const dateM = line.match(/(\d{1,2}\/\d{1,2}\/\d{4})/)
    if (!dateM) continue
    const d = parseBrOrIsoDate(dateM[1])
    if (!d) continue
    const nums = line.match(/-?\s*R\$\s*([\d.,]+)|(-?[\d.,]+)\s*$/)
    let valStr = nums?.[1] || nums?.[2] || ''
    valStr = valStr.replace(/\./g, '').replace(',', '.')
    const valor = Number.parseFloat(valStr)
    if (Number.isNaN(valor) || valor === 0) continue
    const name = line
      .replace(dateM[0], '')
      .replace(nums?.[0] || '', '')
      .replace(/[;,\s]+/g, ' ')
      .trim()
      .slice(0, 200)
    rows.push({
      name: name || 'Movimentação',
      description: dateM[1],
      valor: Math.round(Math.abs(valor) * 100) / 100,
      year: d.year,
      month: d.month,
    })
  }
  return rows
}

export function parseExtratoForExpenses(
  text: string,
  ext: string,
  competenciaYear: number,
  competenciaMonth: number
): { lines: ParsedExtratoLine[]; format: 'ofx' | 'csv' | 'none' } {
  const e = ext.toLowerCase()
  if (['.ofx', '.qfx', '.ofc'].includes(e) || (e === '.txt' && /OFXHEADER|<OFX/i.test(text))) {
    const all = parseOfxContent(text)
    const lines = all.filter((l) => l.year === competenciaYear && l.month === competenciaMonth)
    return { lines, format: 'ofx' }
  }
  if (e === '.csv' || (e === '.txt' && text.includes(';') && /\d{1,2}\/\d{1,2}\/\d{4}/.test(text))) {
    const all = parseBankCsvContent(text)
    const lines = all.filter((l) => l.year === competenciaYear && l.month === competenciaMonth)
    return { lines, format: 'csv' }
  }
  return { lines: [], format: 'none' }
}
