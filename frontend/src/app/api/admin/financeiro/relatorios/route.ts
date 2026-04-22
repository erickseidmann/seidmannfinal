/**
 * GET /api/admin/financeiro/relatorios?type=receitas|despesas|inadimplencia|professores|geral&year=YYYY&month=M&format=json|csv
 * Relatórios financeiros com exportação CSV.
 */

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/auth'
import { toDateKey, filterRecordsByPausedEnrollment, computeValorAPagar, type PaymentRecord } from '@/lib/finance'
import { calendarMonthBoundsUtc } from '@/lib/teacher-paid-period'
import {
  dedupeLinhasMovimentacaoParaSoma,
  shouldIncludeValorInTotalEntradaRegis,
  extractMovimentacaoMarcadoresExtrato,
} from '@/lib/admin-movimentacao'

const querySchema = z.object({
  type: z.enum(['receitas', 'despesas', 'inadimplencia', 'professores', 'geral']),
  year: z.coerce.number().int().min(2000).max(2100),
  month: z.coerce.number().int().min(1).max(12).optional(),
  format: z.enum(['json', 'csv']).default('json'),
})

function startOfDay(d: Date): Date {
  const x = new Date(d)
  x.setUTCHours(0, 0, 0, 0)
  return x
}

function endOfDay(d: Date): Date {
  const x = new Date(d)
  x.setUTCHours(23, 59, 59, 999)
  return x
}

function firstDayOfMonth(y: number, m: number): Date {
  return startOfDay(new Date(y, m - 1, 1))
}

function lastDayOfMonth(y: number, m: number): Date {
  return endOfDay(new Date(y, m, 0))
}

function valorMensalAluno(e: {
  valorMensalidade: unknown
  paymentInfo?: { valorMensal: unknown } | null
}): number {
  const v =
    e.valorMensalidade != null
      ? Number(e.valorMensalidade)
      : e.paymentInfo?.valorMensal != null
        ? Number(e.paymentInfo.valorMensal)
        : 0
  return Math.round(v * 100) / 100
}

async function computeMatriculaKpis(year: number, month: number) {
  const matriculadosEnrollments = await prisma.enrollment.findMany({
    where: {
      status: { in: ['ACTIVE', 'INACTIVE', 'PAUSED', 'COMPLETED'] },
      criadoEm: {
        gte: new Date(year, month - 1, 1),
        lt: new Date(year, month, 1),
      },
      cadastroViaImportacaoLista: false,
    },
    include: { paymentInfo: true },
  })

  let matriculadosCount = matriculadosEnrollments.length
  let matriculadosValorTotal = 0
  for (const e of matriculadosEnrollments) {
    const v = valorMensalAluno(e)
    const bolsista = Boolean(e.bolsista)
    matriculadosValorTotal += bolsista ? 0 : v
  }

  const periodStart = firstDayOfMonth(year, month)
  const periodEnd = lastDayOfMonth(year, month)
  const inativadosRows = await prisma.enrollment.findMany({
    where: {
      status: 'INACTIVE',
      inactiveAt: { gte: periodStart, lte: periodEnd },
    },
    include: { paymentInfo: true },
  })
  let inativadosCount = inativadosRows.length
  let valorPerdidoInativos = 0
  for (const e of inativadosRows) {
    if ((e as { bolsista?: boolean | null }).bolsista) continue
    valorPerdidoInativos += valorMensalAluno(e)
  }
  valorPerdidoInativos = Math.round(valorPerdidoInativos * 100) / 100
  matriculadosValorTotal = Math.round(matriculadosValorTotal * 100) / 100

  return {
    matriculadosCount,
    matriculadosValorTotal,
    inativadosCount,
    valorPerdidoInativos,
  }
}

type MatriculaKpis = Awaited<ReturnType<typeof computeMatriculaKpis>>

async function computeMatriculaKpisYear(year: number) {
  const porMesRaw = await Promise.all(
    Array.from({ length: 12 }, (_, idx) => computeMatriculaKpis(year, idx + 1))
  )
  const porMes = porMesRaw.map((k, idx) => ({ month: idx + 1, ...k }))
  const sum = (fn: (k: MatriculaKpis) => number) => porMesRaw.reduce((s, k) => s + fn(k), 0)
  const mediaMatriculados = sum((k) => k.matriculadosCount) / 12
  const mediaValorMensalidades = sum((k) => k.matriculadosValorTotal) / 12
  const totalInativadosAno = sum((k) => k.inativadosCount)
  const valorPerdidoAno = sum((k) => k.valorPerdidoInativos)
  return {
    porMes,
    mediaMatriculados: Math.round(mediaMatriculados * 100) / 100,
    mediaValorMensalidades: Math.round(mediaValorMensalidades * 100) / 100,
    totalInativadosAno,
    valorPerdidoAno: Math.round(valorPerdidoAno * 100) / 100,
  }
}

function buildEscolaSaude(
  input: {
    saldo: number
    receita: number
    totalDespesas: number
    matriculadosCount: number
    matriculadosValorTotal: number
    inativadosCount: number
    valorPerdido: number
  },
  periodo: 'mes' | 'ano' = 'mes'
): { score: number; label: string; cor: 'green' | 'amber' | 'red'; sugestoes: string[] } {
  let score = 72
  const sugestoes: string[] = []
  const ano = periodo === 'ano'

  if (input.saldo >= 0) {
    score += 8
  } else {
    score -= 18
    sugestoes.push(
      ano
        ? 'Saldo do ano negativo: avalie cortes de despesas ou metas de receita.'
        : 'Saldo do mês negativo: avalie cortes de despesas ou metas de receita.'
    )
  }

  if (input.receita > 0 && input.totalDespesas / input.receita > 0.95) {
    score -= 5
    sugestoes.push('Despesas estão muito próximas da receita — mantenha reserva de caixa.')
  }

  if (input.inativadosCount > 0) {
    const base = input.matriculadosCount + input.inativadosCount
    const taxa = base > 0 ? input.inativadosCount / base : 0
    if (taxa > 0.08) score -= 12
    else if (taxa > 0.04) score -= 6
    sugestoes.push(
      ano
        ? `${input.inativadosCount} inativação(ões) no ano — receita estimada perdida: R$ ${formatMoney(input.valorPerdido)}.`
        : `${input.inativadosCount} aluno(s) inativado(s) neste mês — receita estimada perdida: R$ ${formatMoney(input.valorPerdido)}.`
    )
  }

  if (input.matriculadosCount > 0 && input.valorPerdido > 0 && input.matriculadosValorTotal > 0) {
    // No ano, matriculadosValorTotal é média mensal — comparar com perda anual usando base anualizada
    const baseMensalidades = ano ? input.matriculadosValorTotal * 12 : input.matriculadosValorTotal
    const impacto = input.valorPerdido / (baseMensalidades + input.valorPerdido)
    if (impacto > 0.15) {
      score -= 5
      sugestoes.push('Churn com impacto relevante na receita — acompanhe motivos de saída e retenção.')
    }
  }

  if (input.saldo > 0 && input.inativadosCount === 0 && input.receita >= input.totalDespesas * 1.1) {
    sugestoes.push(
      ano
        ? 'Bom equilíbrio no ano: considere reinvestir parte do saldo em captação ou material.'
        : 'Bom equilíbrio no mês: considere reinvestir parte do saldo em captação ou material.'
    )
  }

  score = Math.max(0, Math.min(100, Math.round(score)))
  const label = score >= 72 ? 'Boa' : score >= 48 ? 'Atenção' : 'Crítico'
  const cor = score >= 72 ? 'green' : score >= 48 ? 'amber' : 'red'
  if (sugestoes.length === 0) {
    sugestoes.push(
      ano
        ? 'Continue monitorando receitas e despesas ao longo do ano para manter a previsibilidade.'
        : 'Continue monitorando receitas e despesas mês a mês para manter a previsibilidade.'
    )
  }
  return { score, label, cor, sugestoes: [...new Set(sugestoes)].slice(0, 6) }
}

function formatMoney(v: number): string {
  return (Math.round(v * 100) / 100).toFixed(2)
}

/** Soma valores de movimentações de entrada (administração / extratos), alinhado à tela Movimentações. */
async function sumTotalEntradaMovimentacoes(monthsToProcess: { year: number; month: number }[]): Promise<number> {
  const rows = await prisma.adminExpense.findMany({
    where: { OR: monthsToProcess.map(({ year, month }) => ({ year, month })) },
    select: { valor: true, description: true, year: true, month: true, fixedSeriesId: true },
    orderBy: [{ year: 'asc' }, { month: 'asc' }, { criadoEm: 'asc' }],
  })
  const rowsUnicas = dedupeLinhasMovimentacaoParaSoma(
    rows.map((r) => ({
      valor: r.valor,
      description: r.description,
      year: r.year,
      month: r.month,
      fixedSeriesId: r.fixedSeriesId,
    }))
  )
  let t = 0
  for (const r of rowsUnicas) {
    if (shouldIncludeValorInTotalEntradaRegis(r.description)) {
      t += Number(r.valor)
    }
  }
  return Math.round(t * 100) / 100
}

async function computeMovimentacoesSaidaForReport(monthsToProcess: { year: number; month: number }[]): Promise<{
  totalSaidaRegis: number
  movimentacoesSaidaLinhas: Array<{
    id: string
    name: string
    valor: number
    year: number
    month: number
    data: string
    transacao: string
    identificacao: string
  }>
}> {
  const rows = await prisma.adminExpense.findMany({
    where: { OR: monthsToProcess.map(({ year, month }) => ({ year, month })) },
    select: {
      id: true,
      name: true,
      valor: true,
      description: true,
      year: true,
      month: true,
      fixedSeriesId: true,
      criadoEm: true,
    },
    orderBy: [{ year: 'desc' }, { month: 'desc' }, { criadoEm: 'desc' }],
  })
  const rowsUnicas = dedupeLinhasMovimentacaoParaSoma(
    rows.map((r) => ({
      id: r.id,
      name: r.name,
      valor: r.valor,
      description: r.description,
      year: r.year,
      month: r.month,
      fixedSeriesId: r.fixedSeriesId,
      criadoEm: r.criadoEm,
    }))
  )
  let totalSaida = 0
  const saidas: typeof rowsUnicas = []
  for (const r of rowsUnicas) {
    if (!shouldIncludeValorInTotalEntradaRegis(r.description)) {
      totalSaida += Number(r.valor)
      saidas.push(r)
    }
  }
  const movimentacoesSaidaLinhas = saidas
    .map((r) => {
      const m = extractMovimentacaoMarcadoresExtrato(r.description)
      return {
        id: r.id,
        name: r.name,
        valor: Math.round(Number(r.valor) * 100) / 100,
        year: r.year,
        month: r.month,
        data: m.data,
        transacao: m.transacao,
        identificacao: m.identificacao || r.name,
      }
    })
    .sort((a, b) => {
      if (b.year !== a.year) return b.year - a.year
      if (b.month !== a.month) return b.month - a.month
      return b.valor - a.valor
    })
    .slice(0, 120)

  return {
    totalSaidaRegis: Math.round(totalSaida * 100) / 100,
    movimentacoesSaidaLinhas,
  }
}

function entradasAlunosPagosFromReceitas(
  receitasData: { items?: unknown[]; totalPago?: number },
  month: number | undefined
): Array<{ aluno: string; valor: number; year: number; month: number }> {
  if (month == null) return []
  const items = receitasData.items
  if (!Array.isArray(items) || items.length === 0) return []
  const row0 = items[0] as Record<string, unknown>
  if (typeof row0.aluno !== 'string') return []
  return (
    items as Array<{
      aluno: string
      valorMensalidade: number
      status: string | null
      year: number
      month: number
    }>
  )
    .filter((i) => i.status === 'PAGO')
    .map((i) => ({
      aluno: i.aluno,
      valor: Math.round(Number(i.valorMensalidade) * 100) / 100,
      year: i.year,
      month: i.month,
    }))
    .sort((a, b) => a.aluno.localeCompare(b.aluno, 'pt-BR'))
    .slice(0, 120)
}

function escapeCsvCell(s: string): string {
  if (/[;"\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
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
      type: searchParams.get('type') ?? undefined,
      year: searchParams.get('year') ?? undefined,
      month: searchParams.get('month') ?? undefined,
      format: searchParams.get('format') ?? 'json',
    })
    if (!parsed.success) {
      return NextResponse.json(
        { ok: false, message: 'Parâmetros inválidos', details: parsed.error.flatten() },
        { status: 400 }
      )
    }
    const { type, year, month, format } = parsed.data

    const monthsToProcess: { year: number; month: number }[] = month
      ? [{ year, month }]
      : Array.from({ length: 12 }, (_, i) => ({ year, month: i + 1 }))

    if (type === 'receitas') {
      const result = await buildReceitasReport(year, month, monthsToProcess)
      return sendReport(result, type, year, month, format, 'receitas')
    }
    if (type === 'despesas') {
      const result = await buildDespesasReport(year, month, monthsToProcess)
      return sendReport(result, type, year, month, format, 'despesas')
    }
    if (type === 'inadimplencia') {
      const result = await buildInadimplenciaReport(year, month, monthsToProcess)
      return sendReport(result, type, year, month, format, 'inadimplencia')
    }
    if (type === 'professores') {
      const result = await buildProfessoresReport(year, month, monthsToProcess)
      return sendReport(result, type, year, month, format, 'professores')
    }
    if (type === 'geral') {
      const result = await buildGeralReport(year, month, monthsToProcess)
      return sendReport(result, type, year, month, format, 'geral')
    }

    return NextResponse.json({ ok: false, message: 'Tipo inválido' }, { status: 400 })
  } catch (error) {
    console.error('[api/admin/financeiro/relatorios GET]', error)
    return NextResponse.json(
      { ok: false, message: 'Erro ao gerar relatório' },
      { status: 500 }
    )
  }
}

type CsvType = 'receitas' | 'despesas' | 'inadimplencia' | 'professores' | 'geral'

function sendReport(
  data: unknown,
  type: string,
  year: number,
  month: number | undefined,
  format: string,
  csvType: CsvType
): NextResponse {
  if (format === 'csv') {
    const csv = toCsv(csvType, data, month)
    const filename = `relatorio-${type}-${year}${month != null ? `-${month}` : ''}.csv`
    return new NextResponse('\uFEFF' + csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    })
  }
  return NextResponse.json({ ok: true, data })
}

function toCsv(type: CsvType, data: unknown, month: number | undefined): string {
  const rows: string[] = []
  const sep = ';'

  if (type === 'receitas') {
    const d = data as { items?: Array<{ aluno: string; valorMensalidade: number; status: string | null; month: number; year: number }> }
    rows.push(['Aluno', 'Valor Mensalidade', 'Status', 'Mês', 'Ano'].join(sep))
    for (const r of d.items ?? []) {
      rows.push([
        escapeCsvCell(r.aluno),
        formatMoney(r.valorMensalidade),
        escapeCsvCell(r.status ?? ''),
        String(r.month),
        String(r.year),
      ].join(sep))
    }
  } else if (type === 'despesas' && month != null) {
    const d = data as {
      professores?: Array<{ professor: string; horasRegistradas: number; valorPorHora: number; valorAPagar: number; status: string | null; month: number; year: number }>
      admin?: Array<{ nome: string; valor: number; status: string | null; month: number; year: number }>
      expenses?: Array<{ name: string; valor: number; status: string | null; month: number; year: number }>
    }
    rows.push(['Professor', 'Horas Registradas', 'Valor/Hora', 'Valor a Pagar', 'Status', 'Mês', 'Ano'].join(sep))
    for (const r of d.professores ?? []) {
      rows.push([
        escapeCsvCell(r.professor),
        formatMoney(r.horasRegistradas),
        formatMoney(r.valorPorHora),
        formatMoney(r.valorAPagar),
        escapeCsvCell(r.status ?? ''),
        String(r.month),
        String(r.year),
      ].join(sep))
    }
    rows.push('')
    rows.push(['Admin/Funcionário', 'Valor', 'Status', 'Mês', 'Ano'].join(sep))
    for (const r of d.admin ?? []) {
      rows.push([escapeCsvCell(r.nome), formatMoney(r.valor), escapeCsvCell(r.status ?? ''), String(r.month), String(r.year)].join(sep))
    }
    rows.push('')
    rows.push(['Despesa', 'Valor', 'Status', 'Mês', 'Ano'].join(sep))
    for (const r of d.expenses ?? []) {
      rows.push([escapeCsvCell(r.name), formatMoney(r.valor), escapeCsvCell(r.status ?? ''), String(r.month), String(r.year)].join(sep))
    }
  } else if (type === 'inadimplencia') {
    const d = data as { items?: Array<{ aluno: string; email: string; valorMensalidade: number; dueDay: number | null; mesesAtrasados: number }> }
    rows.push(['Aluno', 'Email', 'Valor Mensalidade', 'Dia Vencimento', 'Meses Atrasados'].join(sep))
    for (const r of d.items ?? []) {
      rows.push([
        escapeCsvCell(r.aluno),
        escapeCsvCell(r.email),
        formatMoney(r.valorMensalidade),
        r.dueDay != null ? String(r.dueDay) : '',
        String(r.mesesAtrasados),
      ].join(sep))
    }
  } else if (type === 'professores') {
    const d = data as { items?: Array<{ nome: string; totalHorasRegistradas: number; valorPorHora: number; valorAPagar: number; paymentStatus: string | null }> }
    rows.push(['Professor', 'Horas Registradas', 'Valor/Hora', 'Valor a Pagar', 'Status'].join(sep))
    for (const r of d.items ?? []) {
      rows.push([
        escapeCsvCell(r.nome),
        formatMoney(r.totalHorasRegistradas),
        formatMoney(r.valorPorHora),
        formatMoney(r.valorAPagar),
        escapeCsvCell(r.paymentStatus ?? ''),
      ].join(sep))
    }
  } else if (type === 'geral') {
    const d = data as {
      items?: Array<{ mes: number; ano: number; receita: number; despesaProfessores: number; despesaAdmin: number; despesaOutras: number; totalDespesas: number; saldo: number }>
      matriculadosCount?: number
      matriculadosValorTotal?: number
      inativadosCount?: number
      valorPerdidoInativos?: number
      kpisPorMes?: Array<{
        month: number
        matriculadosCount: number
        matriculadosValorTotal: number
        inativadosCount: number
        valorPerdidoInativos: number
      }>
      resumoAnual?: {
        mediaMatriculados: number
        mediaValorMensalidades: number
        totalInativadosAno: number
        valorPerdidoAno: number
      }
    }
    const extraMes = month != null && d.matriculadosCount != null
    const kpisPorMes = d.kpisPorMes ?? []
    const extraAno = month == null && kpisPorMes.length > 0
    rows.push(
      extraMes
        ? ['Mês', 'Ano', 'Receita', 'Despesa Professores', 'Despesa Admin', 'Despesa Outras', 'Total Despesas', 'Saldo', 'Matriculados (qtd)', 'Valor mensalidades', 'Inativados (qtd)', 'Valor perdido (inativos)'].join(sep)
        : extraAno
          ? ['Mês', 'Ano', 'Receita', 'Despesa Professores', 'Despesa Admin', 'Despesa Outras', 'Total Despesas', 'Saldo', 'Matriculados (qtd)', 'Valor mensalidades', 'Inativados (qtd)', 'Valor perdido (inativos)'].join(sep)
          : ['Mês', 'Ano', 'Receita', 'Despesa Professores', 'Despesa Admin', 'Despesa Outras', 'Total Despesas', 'Saldo'].join(sep)
    )
    for (const r of d.items ?? []) {
      const base = [
        String(r.mes),
        String(r.ano),
        formatMoney(r.receita),
        formatMoney(r.despesaProfessores),
        formatMoney(r.despesaAdmin),
        formatMoney(r.despesaOutras),
        formatMoney(r.totalDespesas),
        formatMoney(r.saldo),
      ]
      if (extraMes) {
        base.push(
          String(d.matriculadosCount ?? ''),
          formatMoney(d.matriculadosValorTotal ?? 0),
          String(d.inativadosCount ?? ''),
          formatMoney(d.valorPerdidoInativos ?? 0)
        )
      } else if (extraAno) {
        const kp = kpisPorMes.find((k) => k.month === r.mes)
        base.push(
          String(kp?.matriculadosCount ?? ''),
          formatMoney(kp?.matriculadosValorTotal ?? 0),
          String(kp?.inativadosCount ?? ''),
          formatMoney(kp?.valorPerdidoInativos ?? 0)
        )
      }
      rows.push(base.join(sep))
    }
    if (extraAno && d.resumoAnual) {
      const ra = d.resumoAnual
      rows.push(
        [
          'Resumo ano',
          '',
          '',
          '',
          '',
          '',
          '',
          '',
          String(ra.mediaMatriculados),
          formatMoney(ra.mediaValorMensalidades),
          String(ra.totalInativadosAno),
          formatMoney(ra.valorPerdidoAno),
        ].join(sep)
      )
    }
  }

  return rows.join('\r\n')
}

async function buildReceitasReport(
  year: number,
  month: number | undefined,
  monthsToProcess: { year: number; month: number }[]
) {
  const where = month != null
    ? { year, month }
    : { year, month: { gte: 1, lte: 12 } }

  const list = await prisma.enrollmentPaymentMonth.findMany({
    where,
    include: {
      enrollment: {
        select: {
          nome: true,
          valorMensalidade: true,
          paymentInfo: { select: { valorMensal: true } },
        },
      },
    },
    orderBy: [{ year: 'asc' }, { month: 'asc' }],
  })

  const items = list.map((pm) => {
    const e = pm.enrollment as { nome: string; valorMensalidade: unknown; paymentInfo?: { valorMensal: unknown } }
    const valor = e.valorMensalidade != null ? Number(e.valorMensalidade) : (e.paymentInfo?.valorMensal != null ? Number(e.paymentInfo.valorMensal) : 0)
    return {
      aluno: e.nome,
      valorMensalidade: Math.round(valor * 100) / 100,
      status: pm.paymentStatus,
      year: pm.year,
      month: pm.month,
    }
  })

  let totalPago = 0
  let totalPendente = 0
  let totalAtrasado = 0
  for (const pm of list) {
    const e = pm.enrollment as { valorMensalidade: unknown; paymentInfo?: { valorMensal: unknown } }
    const v = e.valorMensalidade != null ? Number(e.valorMensalidade) : (e.paymentInfo?.valorMensal != null ? Number(e.paymentInfo.valorMensal) : 0)
    if (pm.paymentStatus === 'PAGO') totalPago += v
    else if (pm.paymentStatus === 'ATRASADO') totalAtrasado += v
    else totalPendente += v
  }
  const totalGeral = totalPago + totalPendente + totalAtrasado

  if (month == null) {
    const porMes = monthsToProcess.map(({ year: y, month: m }) => {
      let pago = 0
      let pendente = 0
      let atrasado = 0
      for (const pm of list) {
        if (pm.year !== y || pm.month !== m) continue
        const e = pm.enrollment as { valorMensalidade: unknown; paymentInfo?: { valorMensal: unknown } }
        const v = e.valorMensalidade != null ? Number(e.valorMensalidade) : (e.paymentInfo?.valorMensal != null ? Number(e.paymentInfo.valorMensal) : 0)
        if (pm.paymentStatus === 'PAGO') pago += v
        else if (pm.paymentStatus === 'ATRASADO') atrasado += v
        else pendente += v
      }
      return {
        year: y,
        month: m,
        totalPago: Math.round(pago * 100) / 100,
        totalPendente: Math.round(pendente * 100) / 100,
        totalAtrasado: Math.round(atrasado * 100) / 100,
        totalGeral: Math.round((pago + pendente + atrasado) * 100) / 100,
      }
    })
    return { items: porMes, totalPago, totalPendente, totalAtrasado, totalGeral }
  }

  return { items, totalPago, totalPendente, totalAtrasado, totalGeral }
}

async function buildDespesasReport(
  year: number,
  month: number | undefined,
  monthsToProcess: { year: number; month: number }[]
) {
  const lessonRecord = (prisma as { lessonRecord?: { findMany: (args: unknown) => Promise<unknown[]> } }).lessonRecord

  const resultByMonth = monthsToProcess.map(({ year: y, month: m }) => ({
    year: y,
    month: m,
    professores: 0,
    adminStaff: 0,
    despesasAdmin: 0,
    total: 0,
    items: { professores: [] as any[], admin: [] as any[], expenses: [] as any[] },
  }))

  for (let i = 0; i < monthsToProcess.length; i++) {
    const { year: y, month: m } = monthsToProcess[i]
    const { startMs, endExclusiveMs } = calendarMonthBoundsUtc(y, m)
    const periodStart = new Date(startMs)
    const periodEndExclusive = new Date(endExclusiveMs)
    const startKey = toDateKey(periodStart)
    const endKey = toDateKey(new Date(endExclusiveMs - 1))
    const holidayRows = await prisma.holiday.findMany({
      where: { dateKey: { gte: startKey, lte: endKey } },
      select: { dateKey: true },
    })
    const holidaySet = new Set(holidayRows.map((h) => h.dateKey))

    const adminMonths = await prisma.adminUserPaymentMonth.findMany({
      where: { year: y, month: m },
      include: { user: { select: { nome: true } } },
    })
    let adminTotal = 0
    const adminItems: { nome: string; valor: number; status: string | null; month: number; year: number }[] = []
    for (const am of adminMonths) {
      const v = am.valor != null ? Number(am.valor) : 0
      adminTotal += v
      adminItems.push({ nome: (am.user as { nome: string }).nome, valor: v, status: am.paymentStatus, month: m, year: y })
    }

    const expenses = await prisma.adminExpense.findMany({
      where: { year: y, month: m },
    })
    let expensesTotal = 0
    const expenseItems: { name: string; valor: number; status: string | null; month: number; year: number }[] = []
    for (const ex of expenses) {
      if (shouldIncludeValorInTotalEntradaRegis(ex.description)) continue
      const v = Number(ex.valor)
      expensesTotal += v
      expenseItems.push({ name: ex.name, valor: v, status: ex.paymentStatus, month: m, year: y })
    }

    let professoresTotal = 0
    const professorItems: { professor: string; horasRegistradas: number; valorPorHora: number; valorAPagar: number; status: string | null; month: number; year: number }[] = []

    if (lessonRecord?.findMany) {
      const teachers = await prisma.teacher.findMany({
        where: { status: 'ACTIVE' },
        select: {
          id: true,
          nome: true,
          valorPorHora: true,
          valorPorPeriodo: true,
          valorExtra: true,
        },
      })
      const paymentMonthsThisMonth = await prisma.teacherPaymentMonth.findMany({
        where: { year: y, month: m },
        select: { teacherId: true, valorPorPeriodo: true, valorExtra: true, paymentStatus: true },
      })
      const recordsInRange = await (lessonRecord as any).findMany({
        where: {
          lesson: {
            teacherId: { in: teachers.map((t) => t.id) },
            startAt: { gte: periodStart, lt: periodEndExclusive },
            status: 'CONFIRMED',
            enrollment: {
              OR: [{ status: { not: 'PAUSED' } }, { pausedAt: null }],
            },
          },
          status: 'CONFIRMED',
        },
        select: {
          tempoAulaMinutos: true,
          lesson: {
            select: {
              teacherId: true,
              startAt: true,
              durationMinutes: true,
              enrollment: { select: { status: true, pausedAt: true } },
            },
          },
        },
      })
      const filteredRecords = filterRecordsByPausedEnrollment(recordsInRange as PaymentRecord[])

      for (const t of teachers) {
        const pm = paymentMonthsThisMonth.find((p) => p.teacherId === t.id)
        const valorPorHora = t.valorPorHora != null ? Number(t.valorPorHora) : 0
        const valorPorPeriodo = pm?.valorPorPeriodo != null ? Number(pm.valorPorPeriodo) : (t.valorPorPeriodo != null ? Number(t.valorPorPeriodo) : 0)
        const valorExtra = pm?.valorExtra != null ? Number(pm.valorExtra) : (t.valorExtra != null ? Number(t.valorExtra) : 0)
        const { totalHorasRegistradas, valorAPagar } = computeValorAPagar({
          records: filteredRecords,
          teacherId: t.id,
          periodStart: startMs,
          periodEndExclusive: endExclusiveMs,
          holidaySet,
          valorPorHora,
          valorPorPeriodo,
          valorExtra,
        })
        professoresTotal += valorAPagar
        professorItems.push({
          professor: t.nome,
          horasRegistradas: totalHorasRegistradas,
          valorPorHora,
          valorAPagar,
          status: pm?.paymentStatus ?? null,
          month: m,
          year: y,
        })
      }
    }

    const total = professoresTotal + adminTotal + expensesTotal
    resultByMonth[i].professores = Math.round(professoresTotal * 100) / 100
    resultByMonth[i].adminStaff = Math.round(adminTotal * 100) / 100
    resultByMonth[i].despesasAdmin = Math.round(expensesTotal * 100) / 100
    resultByMonth[i].total = Math.round(total * 100) / 100
    resultByMonth[i].items = { professores: professorItems, admin: adminItems, expenses: expenseItems }
  }

  if (month != null) {
    const single = resultByMonth[0]
    return {
      professores: single.items.professores,
      admin: single.items.admin,
      expenses: single.items.expenses,
      totalProfessores: single.professores,
      totalAdminStaff: single.adminStaff,
      totalDespesasAdmin: single.despesasAdmin,
      total: single.total,
    }
  }
  return {
    items: resultByMonth,
    totalProfessores: Math.round(resultByMonth.reduce((s, d) => s + d.professores, 0) * 100) / 100,
    totalAdminStaff: Math.round(resultByMonth.reduce((s, d) => s + d.adminStaff, 0) * 100) / 100,
    totalDespesasAdmin: Math.round(resultByMonth.reduce((s, d) => s + d.despesasAdmin, 0) * 100) / 100,
    total: Math.round(resultByMonth.reduce((s, d) => s + d.total, 0) * 100) / 100,
  }
}

async function buildInadimplenciaReport(
  _year: number,
  month: number | undefined,
  monthsToProcess: { year: number; month: number }[]
) {
  const where =
    month != null
      ? { paymentStatus: 'ATRASADO' as const, year: monthsToProcess[0].year, month }
      : { paymentStatus: 'ATRASADO' as const, year: monthsToProcess[0].year, month: { gte: 1, lte: 12 } }

  const atrasados = await prisma.enrollmentPaymentMonth.findMany({
    where,
    include: {
      enrollment: {
        select: {
          id: true,
          nome: true,
          email: true,
          valorMensalidade: true,
          diaPagamento: true,
          user: { select: { email: true } },
          paymentInfo: { select: { valorMensal: true, dueDay: true } },
        },
      },
    },
  })

  const countByEnrollment = new Map<string, number>()
  for (const pm of atrasados) {
    const n = countByEnrollment.get(pm.enrollmentId) ?? 0
    countByEnrollment.set(pm.enrollmentId, n + 1)
  }

  const byEnrollment = new Map<string, { enrollment: typeof atrasados[0]['enrollment']; mesesAtrasados: number }>()
  for (const pm of atrasados) {
    const mesesAtrasados = countByEnrollment.get(pm.enrollmentId) ?? 1
    const existing = byEnrollment.get(pm.enrollmentId)
    if (!existing || existing.mesesAtrasados < mesesAtrasados) {
      byEnrollment.set(pm.enrollmentId, { enrollment: pm.enrollment, mesesAtrasados })
    }
  }

  const items = Array.from(byEnrollment.entries())
    .map(([, v]) => {
      const e = v.enrollment as {
        nome: string
        email: string
        valorMensalidade: unknown
        diaPagamento: number | null
        user?: { email: string } | null
        paymentInfo?: { valorMensal: unknown; dueDay: number | null } | null
      }
      const valor = e.valorMensalidade != null ? Number(e.valorMensalidade) : (e.paymentInfo?.valorMensal != null ? Number(e.paymentInfo.valorMensal) : 0)
      return {
        aluno: e.nome,
        email: e.user?.email ?? e.email,
        valorMensalidade: Math.round(valor * 100) / 100,
        dueDay: e.diaPagamento ?? e.paymentInfo?.dueDay ?? null,
        mesesAtrasados: v.mesesAtrasados,
      }
    })
    .sort((a, b) => b.mesesAtrasados - a.mesesAtrasados)

  return { items }
}

async function buildProfessoresReport(
  year: number,
  month: number | undefined,
  monthsToProcess: { year: number; month: number }[]
) {
  const target = month != null ? { year, month } : monthsToProcess[0]
  const y = target.year
  const m = target.month
  const { startMs, endExclusiveMs } = calendarMonthBoundsUtc(y, m)
  const periodStart = new Date(startMs)
  const periodEndExclusive = new Date(endExclusiveMs)
  const startKey = toDateKey(periodStart)
  const endKey = toDateKey(new Date(endExclusiveMs - 1))
  const holidayRows = await prisma.holiday.findMany({
    where: { dateKey: { gte: startKey, lte: endKey } },
    select: { dateKey: true },
  })
  const holidaySet = new Set(holidayRows.map((h) => h.dateKey))

  const lessonRecord = (prisma as { lessonRecord?: { findMany: (args: unknown) => Promise<unknown[]> } }).lessonRecord
  const teachers = await prisma.teacher.findMany({
    where: { status: 'ACTIVE' },
    select: {
      id: true,
      nome: true,
      valorPorHora: true,
      valorPorPeriodo: true,
      valorExtra: true,
      paymentMonths: { where: { year: y, month: m }, take: 1 },
    },
  })

  let filteredRecords: PaymentRecord[] = []
  if (lessonRecord?.findMany) {
    const recordsInRange = await (lessonRecord as any).findMany({
      where: {
        lesson: {
          teacherId: { in: teachers.map((t) => t.id) },
          startAt: { gte: periodStart, lt: periodEndExclusive },
          status: 'CONFIRMED',
          enrollment: {
            OR: [{ status: { not: 'PAUSED' } }, { pausedAt: null }],
          },
        },
        status: 'CONFIRMED',
      },
      select: {
        tempoAulaMinutos: true,
        lesson: {
          select: {
            teacherId: true,
            startAt: true,
            durationMinutes: true,
            enrollment: { select: { status: true, pausedAt: true } },
          },
        },
      },
    })
    filteredRecords = filterRecordsByPausedEnrollment(recordsInRange as PaymentRecord[])
  }

  const items: { nome: string; totalHorasRegistradas: number; valorPorHora: number; valorAPagar: number; paymentStatus: string | null }[] = []
  let totalGeral = 0
  for (const t of teachers) {
    const pm = t.paymentMonths?.[0] as { paymentStatus: string | null; valorPorPeriodo: unknown; valorExtra: unknown } | undefined
    const valorPorHora = t.valorPorHora != null ? Number(t.valorPorHora) : 0
    const valorPorPeriodo = pm?.valorPorPeriodo != null ? Number(pm.valorPorPeriodo) : (t.valorPorPeriodo != null ? Number(t.valorPorPeriodo) : 0)
    const valorExtra = pm?.valorExtra != null ? Number(pm.valorExtra) : (t.valorExtra != null ? Number(t.valorExtra) : 0)
    const { totalHorasRegistradas, valorAPagar } = computeValorAPagar({
      records: filteredRecords,
      teacherId: t.id,
      periodStart: startMs,
      periodEndExclusive: endExclusiveMs,
      holidaySet,
      valorPorHora,
      valorPorPeriodo,
      valorExtra,
    })
    totalGeral += valorAPagar
    items.push({
      nome: t.nome,
      totalHorasRegistradas,
      valorPorHora,
      valorAPagar,
      paymentStatus: pm?.paymentStatus ?? null,
    })
  }

  return { items, totalGeral: Math.round(totalGeral * 100) / 100 }
}

async function buildGeralReport(
  year: number,
  month: number | undefined,
  monthsToProcess: { year: number; month: number }[]
) {
  const [receitasData, despesasData, totalEntradaRegis, saidaBlock] = await Promise.all([
    buildReceitasReport(year, month, monthsToProcess),
    buildDespesasReport(year, month, monthsToProcess),
    sumTotalEntradaMovimentacoes(monthsToProcess),
    computeMovimentacoesSaidaForReport(monthsToProcess),
  ])
  const { totalSaidaRegis, movimentacoesSaidaLinhas } = saidaBlock
  const totalPagoAlunos = Math.round(((receitasData as { totalPago?: number }).totalPago ?? 0) * 100) / 100
  const entradasAlunosPagosLinhas = entradasAlunosPagosFromReceitas(receitasData as { items?: unknown[] }, month)

  const movimentacaoResumo = {
    totalEntradaRegis,
    totalSaidaRegis,
    movimentacoesSaidaLinhas,
    totalPagoAlunos,
    entradasAlunosPagosLinhas,
  }

  const receitasPorMes = Array.isArray(receitasData.items)
    ? (receitasData.items as Array<{ year: number; month: number; totalPago?: number }>)
    : []
  const despesasPorMes = Array.isArray(despesasData.items)
    ? (despesasData.items as Array<{ year: number; month: number; professores: number; adminStaff: number; despesasAdmin: number; total: number }>)
    : []

  const items = monthsToProcess.map(({ year: y, month: m }) => {
    let receita = 0
    if (month != null && monthsToProcess.length === 1) {
      receita = (receitasData as { totalPago?: number }).totalPago ?? 0
    } else {
      const rec = receitasPorMes.find((r) => r.year === y && r.month === m)
      receita = rec?.totalPago ?? 0
    }
    let despesaProfessores = 0
    let despesaAdmin = 0
    let despesaOutras = 0
    let totalDespesas = 0
    if (month != null && monthsToProcess.length === 1 && !Array.isArray(despesasData.items)) {
      const d = despesasData as { totalProfessores?: number; totalAdminStaff?: number; totalDespesasAdmin?: number; total?: number }
      despesaProfessores = d.totalProfessores ?? 0
      despesaAdmin = d.totalAdminStaff ?? 0
      despesaOutras = d.totalDespesasAdmin ?? 0
      totalDespesas = d.total ?? 0
    } else {
      const des = despesasPorMes.find((d) => d.year === y && d.month === m)
      despesaProfessores = des?.professores ?? 0
      despesaAdmin = des?.adminStaff ?? 0
      despesaOutras = des?.despesasAdmin ?? 0
      totalDespesas = des?.total ?? 0
    }
    const saldo = receita - totalDespesas
    return {
      mes: m,
      ano: y,
      receita: Math.round(receita * 100) / 100,
      despesaProfessores: Math.round(despesaProfessores * 100) / 100,
      despesaAdmin: Math.round(despesaAdmin * 100) / 100,
      despesaOutras: Math.round(despesaOutras * 100) / 100,
      totalDespesas: Math.round(totalDespesas * 100) / 100,
      saldo: Math.round(saldo * 100) / 100,
    }
  })

  if (month != null && items.length === 1) {
    const row = items[0]
    const kpis = await computeMatriculaKpis(year, month)
    const escolaSaude = buildEscolaSaude(
      {
        saldo: row.saldo,
        receita: row.receita,
        totalDespesas: row.totalDespesas,
        matriculadosCount: kpis.matriculadosCount,
        matriculadosValorTotal: kpis.matriculadosValorTotal,
        inativadosCount: kpis.inativadosCount,
        valorPerdido: kpis.valorPerdidoInativos,
      },
      'mes'
    )
    return {
      items,
      matriculadosCount: kpis.matriculadosCount,
      matriculadosValorTotal: kpis.matriculadosValorTotal,
      inativadosCount: kpis.inativadosCount,
      valorPerdidoInativos: kpis.valorPerdidoInativos,
      escolaSaude,
      ...movimentacaoResumo,
    }
  }

  if (month == null && items.length > 0) {
    const kpisYear = await computeMatriculaKpisYear(year)
    const receitaAno = items.reduce((s, i) => s + i.receita, 0)
    const totalDespAno = items.reduce((s, i) => s + i.totalDespesas, 0)
    const saldoAno = items.reduce((s, i) => s + i.saldo, 0)
    const escolaSaude = buildEscolaSaude(
      {
        saldo: saldoAno,
        receita: receitaAno,
        totalDespesas: totalDespAno,
        matriculadosCount: Math.round(kpisYear.mediaMatriculados),
        matriculadosValorTotal: kpisYear.mediaValorMensalidades,
        inativadosCount: kpisYear.totalInativadosAno,
        valorPerdido: kpisYear.valorPerdidoAno,
      },
      'ano'
    )
    return {
      items,
      kpisPorMes: kpisYear.porMes.map((p) => ({
        month: p.month,
        matriculadosCount: p.matriculadosCount,
        matriculadosValorTotal: p.matriculadosValorTotal,
        inativadosCount: p.inativadosCount,
        valorPerdidoInativos: p.valorPerdidoInativos,
      })),
      resumoAnual: {
        mediaMatriculados: kpisYear.mediaMatriculados,
        mediaValorMensalidades: kpisYear.mediaValorMensalidades,
        totalInativadosAno: kpisYear.totalInativadosAno,
        valorPerdidoAno: kpisYear.valorPerdidoAno,
      },
      escolaSaude,
      ...movimentacaoResumo,
    }
  }

  return { items, ...movimentacaoResumo }
}
