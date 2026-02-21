/**
 * GET /api/admin/financeiro/alunos
 * Lista matrículas (alunos) com dados financeiros para a tabela Financeiro – Alunos.
 * Calcula data do próximo pagamento a partir de dia de vencimento (1-31) quando dueDate não existe.
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/auth'

const MONTHS_BY_PERIODO: Record<string, number> = {
  MENSAL: 1,
  TRIMESTRAL: 3,
  SEMESTRAL: 6,
  ANUAL: 12,
}

/** Retorna a próxima data de vencimento dado o dia do mês (1-31), após uma data. Só avança para o mês seguinte se afterDate já passou do dia. */
function nextDueDateFromDay(dayOfMonth: number, afterDate: Date): Date {
  const year = afterDate.getFullYear()
  const month = afterDate.getMonth()
  const safeDay = Math.min(dayOfMonth, new Date(year, month + 1, 0).getDate())
  const candidate = new Date(year, month, safeDay)
  if (candidate > afterDate) return candidate
  const nextSafe = Math.min(dayOfMonth, new Date(year, month + 2, 0).getDate())
  return new Date(year, month + 1, nextSafe)
}

/** Adiciona N meses à data (respeitando fim do mês). */
function addMonths(date: Date, months: number): Date {
  const d = new Date(date.getFullYear(), date.getMonth() + months, date.getDate())
  const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()
  if (d.getDate() > lastDay) d.setDate(lastDay)
  return d
}

/** Próxima data de pagamento quando já pagou: último pagamento + período (1, 3, 6 ou 12 meses), com dia = diaPagamento. */
function nextDueDateFromPaidAt(paidAt: Date, diaPagamento: number, periodoPagamento: string | null): Date {
  const n = MONTHS_BY_PERIODO[periodoPagamento ?? ''] ?? 1
  const next = addMonths(paidAt, n)
  const lastDay = new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate()
  next.setDate(Math.min(diaPagamento, lastDay))
  return next
}

/** Verifica se (year, month) está dentro do período já pago (do mês do paidAt até paidAt + N meses - 1). */
function isMonthWithinPaidPeriod(paidAt: Date, year: number, month: number, periodoPagamento: string | null): boolean {
  const n = MONTHS_BY_PERIODO[periodoPagamento ?? ''] ?? 1
  const paidYear = paidAt.getFullYear()
  const paidMonth = paidAt.getMonth() + 1
  const viewMonthIndex = (year - paidYear) * 12 + (month - paidMonth)
  return viewMonthIndex >= 0 && viewMonthIndex < n
}

/** Retorna a data de vencimento no mês/ano dados (dia 1-31). Usado quando o aluno ainda não pagou: mostra o vencimento do período atual, não do próximo. */
function dueDateInMonth(dayOfMonth: number, year: number, month: number): Date {
  const safeDay = Math.min(dayOfMonth, new Date(year, month, 0).getDate())
  return new Date(year, month - 1, safeDay)
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
    const yearParam = searchParams.get('year')
    const monthParam = searchParams.get('month')
    const year = yearParam ? parseInt(yearParam, 10) : null
    const month = monthParam ? parseInt(monthParam, 10) : null
    const hasMonthFilter = year != null && month != null && month >= 1 && month <= 12

    const enrollments = await prisma.enrollment.findMany({
      orderBy: { nome: 'asc' },
      include: {
        paymentInfo: true,
        paymentMonths: hasMonthFilter
          ? { where: { year, month }, take: 1 }
          : false,
        _count: { select: { financeObservations: true } },
      },
    })

    const today = new Date()
    today.setHours(0, 0, 0, 0)

    // Buscar todas as NFSe autorizadas para calcular nfEmitida automaticamente
    // Mapear por enrollmentId + year + month
    const nfseAutorizadas = await prisma.nfseInvoice.findMany({
      where: {
        status: 'autorizado',
        cancelledAt: null,
      },
      select: {
        enrollmentId: true,
        year: true,
        month: true,
      },
    })
    const nfseMap = new Map<string, boolean>()
    for (const nf of nfseAutorizadas) {
      const key = `${nf.enrollmentId}:${nf.year}:${nf.month}`
      nfseMap.set(key, true)
    }

    // Valor por hora = valor mensal ÷ total de horas do mês.
    // Total de horas do mês = (frequência semanal × duração da aula em min) × 4 semanas ÷ 60.
    const WEEKS_PER_MONTH = 4

    const rows = enrollments.map((e) => {
      const pi = e.paymentInfo
      const pm = hasMonthFilter && e.paymentMonths && 'length' in e.paymentMonths ? (e.paymentMonths as { paymentStatus: string | null; notaFiscalEmitida: boolean | null }[])[0] : null
      const valorMensal = e.valorMensalidade != null ? Number(e.valorMensalidade) : null
      const valorMensalPi = pi?.valorMensal != null ? Number(pi.valorMensal) : null
      const freq = e.frequenciaSemanal ?? 0
      const mins = e.tempoAulaMinutos ?? 0
      const totalMinutesMes = freq * mins * WEEKS_PER_MONTH
      const totalHorasMes = totalMinutesMes > 0 ? totalMinutesMes / 60 : 0
      const valorHora =
        (valorMensal ?? valorMensalPi) != null && totalHorasMes > 0
          ? (valorMensal ?? valorMensalPi)! / totalHorasMes
          : null
      const dueDate = pi?.dueDate
      const diaPagamento = e.diaPagamento ?? pi?.dueDay ?? null
      let dataProximoPagamento: string | null = dueDate ? dueDate.toISOString() : null
      if (!dataProximoPagamento && diaPagamento != null && diaPagamento >= 1 && diaPagamento <= 31) {
        if (pi?.paidAt) {
          // Já pagou: próximo vencimento conforme período (Mensal +1 mês, Trimestral +3, Semestral +6, Anual +12)
          const paidDate = new Date(pi.paidAt)
          dataProximoPagamento = nextDueDateFromPaidAt(paidDate, diaPagamento, pi?.periodoPagamento ?? null).toISOString()
        } else {
          // Ainda não pagou: mostrar o vencimento do período atual (mês corrente ou mês selecionado), não avançar para o próximo mês
          const refYear = hasMonthFilter && year != null && month != null ? year : today.getFullYear()
          const refMonth = hasMonthFilter && year != null && month != null ? month : today.getMonth() + 1
          dataProximoPagamento = dueDateInMonth(diaPagamento, refYear, refMonth).toISOString()
        }
      }

      // Determinar mês/ano de referência para NFSe:
      // 1. Se tem filtro de mês/ano na query, usar esse
      // 2. Caso contrário, usar mês do último pagamento confirmado OU mês atual
      let refYear: number
      let refMonth: number
      if (hasMonthFilter && year != null && month != null) {
        refYear = year
        refMonth = month
      } else {
        // Usar mês do último pagamento confirmado ou mês atual
        const lastPaid = pi?.paidAt
        if (lastPaid) {
          const paidDate = new Date(lastPaid)
          refYear = paidDate.getFullYear()
          refMonth = paidDate.getMonth() + 1
        } else {
          refYear = today.getFullYear()
          refMonth = today.getMonth() + 1
        }
      }
      
      // Status no mês: se tem filtro de mês e o mês está dentro do período já pago (ex.: trimestral = 3 meses), mostrar Pago
      let status: string | null = hasMonthFilter && pm ? pm.paymentStatus ?? null : pi?.paymentStatus ?? null
      if (hasMonthFilter && year != null && month != null && pi?.paidAt && pi?.periodoPagamento) {
        if (isMonthWithinPaidPeriod(new Date(pi.paidAt), year, month, pi.periodoPagamento)) {
          status = 'PAGO'
        }
      }

      // Verificar se existe NFSe autorizada para este enrollment no mês/ano de referência
      const nfseKey = `${e.id}:${refYear}:${refMonth}`
      const nfEmitida = nfseMap.has(nfseKey)
      
      const enr = e as { moraNoExterior?: boolean; enderecoExterior?: string | null; rua?: string | null; numero?: string | null; complemento?: string | null; cidade?: string | null; estado?: string | null; cep?: string | null }
      const enderecoCompleto =
        enr.moraNoExterior && enr.enderecoExterior
          ? enr.enderecoExterior.trim()
          : [enr.rua, enr.numero, enr.complemento, enr.cidade, enr.estado, enr.cep].filter(Boolean).join(', ') || null
      const enrFaturamento = e as { faturamentoTipo?: string | null; faturamentoRazaoSocial?: string | null; faturamentoCnpj?: string | null; faturamentoEmail?: string | null; faturamentoEndereco?: string | null; faturamentoDescricaoNfse?: string | null }
      return {
        id: e.id,
        nome: e.nome,
        cpf: (e as { cpf?: string | null }).cpf ?? null,
        faturamentoTipo: enrFaturamento.faturamentoTipo ?? 'ALUNO',
        faturamentoRazaoSocial: enrFaturamento.faturamentoRazaoSocial ?? null,
        faturamentoCnpj: enrFaturamento.faturamentoCnpj ?? null,
        faturamentoEmail: enrFaturamento.faturamentoEmail ?? null,
        faturamentoEndereco: enrFaturamento.faturamentoEndereco ?? null,
        faturamentoDescricaoNfse: enrFaturamento.faturamentoDescricaoNfse ?? null,
        endereco: enderecoCompleto,
        tipoAula: e.tipoAula ?? null,
        nomeGrupo: e.nomeGrupo ?? null,
        nomeResponsavel: e.nomeResponsavel ?? null,
        quemPaga: pi?.quemPaga ?? null,
        valorMensal: valorMensal ?? valorMensalPi ?? null,
        valorHora: valorHora,
        dataPagamento: pi?.dataPagamento?.toISOString() ?? null,
        status,
        enrollmentStatus: e.status,
        inactiveAt: e.inactiveAt?.toISOString() ?? null,
        metodoPagamento: e.metodoPagamento ?? pi?.metodo ?? null,
        banco: pi?.banco ?? null,
        periodoPagamento: pi?.periodoPagamento ?? null,
        dataUltimoPagamento: pi?.paidAt?.toISOString() ?? null,
        dataProximoPagamento,
        diaPagamento: diaPagamento ?? null,
        notaFiscalEmitida: nfEmitida, // Calculado automaticamente da tabela nfse_invoices
        email: e.email,
        escolaMatricula: (e as { escolaMatricula?: string | null }).escolaMatricula ?? null,
        paymentInfoId: pi?.id ?? null,
        hasFinanceObservations: ((e as { _count?: { financeObservations: number } })._count?.financeObservations ?? 0) > 0,
      }
    })

    return NextResponse.json({ ok: true, data: { alunos: rows } })
  } catch (error) {
    console.error('[api/admin/financeiro/alunos GET]', error)
    return NextResponse.json(
      { ok: false, message: 'Erro ao listar alunos financeiro' },
      { status: 500 }
    )
  }
}
