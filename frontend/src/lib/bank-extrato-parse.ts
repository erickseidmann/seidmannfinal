/**
 * Extrai lançamentos de extrato OFX/OFC/QFX e CSV simples (exportação bancária BR)
 * para criar linhas em AdminExpense (outras despesas).
 */

export type ParsedExtratoLine = {
  name: string
  description: string | null
  valor: number
  movementType: 'ENTRADA' | 'SAIDA'
  rawDate?: string | null
  rawTransaction?: string | null
  rawTransactionType?: string | null
  rawIdentification?: string | null
  /** Ano/mês da data do lançamento (OFX DTPOSTED ou CSV) */
  year: number
  month: number
}

/**
 * Valor no CSV do banco: pode vir como "1.234,56" (BR), "260" ou "-986.52" / "270.23" (ponto = decimal, ex.: Cora).
 * Remover todos os pontos quebra o último caso (virava -98652).
 */
function parseValorCampoExtratoCsv(raw: string): number | null {
  let s = raw.replace(/R\$\s*/gi, '').trim()
  if (!s) return null
  const negative = /^-/.test(s)
  s = s.replace(/^[-+]\s*/, '')

  const hasComma = s.includes(',')
  const dotCount = (s.match(/\./g) || []).length

  if (hasComma) {
    s = s.replace(/\./g, '').replace(',', '.')
  } else if (dotCount === 1) {
    const [whole, frac = ''] = s.split('.')
    if (frac.length >= 1 && frac.length <= 2 && /^\d+$/.test(whole) && /^\d+$/.test(frac)) {
      s = `${whole}.${frac}`
    } else if (frac.length === 3 && /^\d+$/.test(whole) && /^\d+$/.test(frac)) {
      s = whole + frac
    } else if (frac === '') {
      s = whole
    } else {
      s = whole + frac
    }
  } else if (dotCount > 1) {
    s = s.replace(/\./g, '')
  }

  const n = Number.parseFloat((negative ? '-' : '') + s.replace(/[^\d.]/g, ''))
  if (Number.isNaN(n) || n === 0) return null
  return n
}

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

/**
 * Classifica crédito/débito OFX priorizando TRNTYPE; só usa o sinal de TRNAMT se o tipo for ambíguo.
 * Evita marcar pagamentos/débitos como ENTRADA quando o banco segue o padrão OFX mas o sinal veio invertido.
 */
function movementTypeFromOfxTrntype(trntypeRaw: string, amount: number): 'ENTRADA' | 'SAIDA' {
  const tt = trntypeRaw.trim().toUpperCase()
  if (!tt) return amount < 0 ? 'SAIDA' : 'ENTRADA'

  const debitLike =
    tt.includes('DEBIT') ||
    tt.includes('DEBITO') ||
    tt === 'ATM' ||
    tt === 'POS' ||
    tt === 'FEE' ||
    tt === 'SRVCHG' ||
    tt === 'SRVCHARG' ||
    tt === 'CHECK' ||
    tt.includes('WITHDRAW')
  const creditLike =
    tt.includes('CREDIT') ||
    tt.includes('CREDITO') ||
    tt === 'DEP' ||
    tt === 'DIRECTDEP' ||
    tt === 'INT' ||
    tt === 'DIV' ||
    tt.includes('INTEREST')

  if (debitLike && !creditLike) return 'SAIDA'
  if (creditLike && !debitLike) return 'ENTRADA'

  if (tt === 'XFER' || tt === 'PAYMENT') return amount < 0 ? 'SAIDA' : 'ENTRADA'

  return amount < 0 ? 'SAIDA' : 'ENTRADA'
}

function pushOfxBlock(
  block: string,
  out: ParsedExtratoLine[]
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

  const valor = Math.abs(amount)
  const movementType = movementTypeFromOfxTrntype(trntype, amount)
  const label = (memo || nameTag || 'Movimentação').slice(0, 200)
  const descParts = [fitid ? `FITID ${fitid}` : null, dtposted.slice(0, 8), trntype || null].filter(Boolean)
  out.push({
    name: label || 'Movimentação',
    description: descParts.length ? descParts.join(' · ') : null,
    valor: Math.round(valor * 100) / 100,
    movementType,
    rawDate: dtposted ? `${dtposted.slice(6, 8)}/${dtposted.slice(4, 6)}/${dtposted.slice(0, 4)}` : null,
    rawTransaction: memo || nameTag || null,
    rawTransactionType: trntype || null,
    rawIdentification: fitid || null,
    year: dateParsed.year,
    month: dateParsed.month,
  })
}

export function parseOfxContent(text: string): ParsedExtratoLine[] {
  const blocks = splitOfxStmtTrn(text)
  const out: ParsedExtratoLine[] = []
  for (const block of blocks) {
    pushOfxBlock(block, out)
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
  const transacaoIdx = header.findIndex((h) => /transa[cç][aã]o|hist|descri|memo|detalhe|lan[cç]amento/i.test(h))
  const tipoTransacaoIdx = header.findIndex((h) => /tipo.*transa[cç][aã]o|d[eé]bito|cr[eé]dito|tipo/i.test(h))
  const identificacaoIdx = header.findIndex((h) => /identifica[cç][aã]o|favorecido|nome|documento/i.test(h))

  if (dateIdx >= 0 && valueIdx >= 0) {
    const rows: ParsedExtratoLine[] = []
    for (const line of lines.slice(1)) {
      const cols = splitCsvLine(line, sep)
      if (cols.length <= Math.max(dateIdx, valueIdx)) continue
      const dateStr = cols[dateIdx]?.trim() ?? ''
      const valStr = cols[valueIdx]?.trim() ?? ''
      const hist = transacaoIdx >= 0 ? cols[transacaoIdx]?.trim() : null
      const tipoRaw = tipoTransacaoIdx >= 0 ? cols[tipoTransacaoIdx]?.trim() : ''
      const identificacao = identificacaoIdx >= 0 ? cols[identificacaoIdx]?.trim() : null
      const d = parseBrOrIsoDate(dateStr)
      const valor = parseValorCampoExtratoCsv(valStr)
      if (!d || valor == null) continue
      const tipoNorm = tipoRaw.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase()
      const movementType: 'ENTRADA' | 'SAIDA' =
        tipoNorm.includes('CREDITO') ? 'ENTRADA' : (tipoNorm.includes('DEBITO') ? 'SAIDA' : (valor < 0 ? 'SAIDA' : 'ENTRADA'))
      rows.push({
        name: (identificacao || hist || 'Movimentação').slice(0, 200),
        description: [hist, identificacao].filter(Boolean).join(' · ') || null,
        valor: Math.round(Math.abs(valor) * 100) / 100,
        movementType,
        rawDate: dateStr || null,
        rawTransaction: hist || null,
        rawTransactionType: tipoRaw || null,
        rawIdentification: identificacao || null,
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
    const valStr = nums?.[1] || nums?.[2] || ''
    const valor = parseValorCampoExtratoCsv(valStr)
    if (valor == null) continue
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
      movementType: valor < 0 ? 'SAIDA' : 'ENTRADA',
      rawDate: dateM[1],
      rawTransaction: name || 'Movimentação',
      rawTransactionType: valor < 0 ? 'DÉBITO' : 'CRÉDITO',
      rawIdentification: null,
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
