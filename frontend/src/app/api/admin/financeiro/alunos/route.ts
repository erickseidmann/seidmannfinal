/**
 * GET /api/admin/financeiro/alunos
 * Lista matrículas (alunos) com dados financeiros para a tabela Financeiro – Alunos.
 * Calcula data do próximo pagamento a partir de dia de vencimento (1-31) quando dueDate não existe.
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/auth'

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

/** Retorna a data de vencimento no mês/ano dados (dia 1-31). */
function dueDateInMonth(dayOfMonth: number, year: number, month: number): Date {
  const safeDay = Math.min(dayOfMonth, new Date(year, month, 0).getDate())
  return new Date(year, month - 1, safeDay)
}

/**
 * Regra: cada mês é independente; a data de vencimento é fixa (ex.: dia 10).
 * O "próximo pagamento" é sempre a próxima ocorrência desse dia no calendário a partir de hoje,
 * e NÃO depende de quando o aluno pagou o mês anterior (evita mudar ao quitar fevereiro em março).
 */
function nextDueDateFixed(dayOfMonth: number, refDate: Date): Date {
  return nextDueDateFromDay(dayOfMonth, refDate)
}

/** Ano/mês calendário em UTC (evita deslocar o mês por fuso quando a data veio como meia-noite UTC). */
function getYearMonthUtc(d: Date): { year: number; month: number } {
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1 }
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
        coraInvoices: { orderBy: { criadoEm: 'desc' }, take: 1 },
      },
    })

    // Se estiver filtrando por mês/ano: remover inativos a partir do mês de inativação;
    // e só incluir alunos cuja data de início seja no mês selecionado ou antes (não aparecem antes do mês de início)
    const removedThisMonthIds = new Set<string>()

    const filteredEnrollments =
      hasMonthFilter && year != null && month != null
        ? enrollments.filter((e) => {
            // 1) Com data de início preenchida: só aparece no financeiro a partir desse mês (ano/mês em UTC para bater com o calendário salvo)
            const dataInicio = (e as { dataInicio?: Date | null }).dataInicio
            if (dataInicio) {
              const { year: y0, month: m0 } = getYearMonthUtc(new Date(dataInicio))
              if (year < y0 || (year === y0 && month < m0)) return false
            }
            // Inativos: não constar a partir do mês de inativação
            if (e.status === 'INACTIVE') {
              if (!e.inactiveAt) return false
              const d = new Date(e.inactiveAt)
              const anoInativo = d.getFullYear()
              const mesInativo = d.getMonth() + 1
              const viewingAfterOrSameInactiveMonth =
                year > anoInativo || (year === anoInativo && month >= mesInativo)
              if (viewingAfterOrSameInactiveMonth) return false
              // Mesmo sendo INACTIVE ainda visível, verificar se foi removido manualmente do mês
              const pmArr = (e as any).paymentMonths as { paymentStatus: string | null }[] | undefined
              const pm = Array.isArray(pmArr) && pmArr.length > 0 ? pmArr[0] : null
              if (pm && pm.paymentStatus === 'REMOVIDO') {
                removedThisMonthIds.add(e.id)
                return false
              }
              return true
            }
            // Esconder só quem foi explicitamente "Removido deste mês". PENDING = no mês, aguardando pagamento (ex.: boleto gerado).
            const pmArr = (e as any).paymentMonths as { paymentStatus: string | null }[] | undefined
            const pm = Array.isArray(pmArr) && pmArr.length > 0 ? pmArr[0] : null
            if (pm && pm.paymentStatus === 'REMOVIDO') {
              removedThisMonthIds.add(e.id)
              return false
            }
            return true
          })
        : enrollments

    const enrollmentIds = filteredEnrollments.map((e) => e.id)

    // Último e-mail de cobrança enviado (manual e/ou automações)
    const [invoiceSentAuditMax, paymentNotificationMax] = await Promise.all([
      prisma.financeAuditLog.groupBy({
        by: ['entityId'],
        where: {
          entityType: 'ENROLLMENT',
          action: 'INVOICE_SENT',
          entityId: { in: enrollmentIds },
        },
        _max: { criadoEm: true },
      }),
      prisma.paymentNotification.groupBy({
        by: ['enrollmentId'],
        where: {
          enrollmentId: { in: enrollmentIds },
          success: true,
        },
        _max: { sentAt: true },
      }),
    ])

    const emailSentMap = new Map<string, Date>()
    for (const row of invoiceSentAuditMax) {
      const d = row._max.criadoEm
      if (d) emailSentMap.set(row.entityId, d)
    }
    for (const row of paymentNotificationMax) {
      const d = row._max.sentAt
      if (!d) continue
      const prev = emailSentMap.get(row.enrollmentId)
      if (!prev || d > prev) emailSentMap.set(row.enrollmentId, d)
    }

    const today = new Date()
    today.setHours(0, 0, 0, 0)

    // Buscar todas as NFSe autorizadas para calcular nfEmitida automaticamente
    // Mapear por enrollmentId + year + month
    const nfseAutorizadasPromise = prisma.nfseInvoice.findMany({
      where: { status: 'autorizado', cancelledAt: null },
      select: { enrollmentId: true, year: true, month: true },
    })

    let removedWithReasons: { id: string; nome: string; motivo: string | null }[] = []
    if (removedThisMonthIds.size > 0) {
      const removedArray = Array.from(removedThisMonthIds)
      const obs = await prisma.financeObservation.findMany({
        where: { enrollmentId: { in: removedArray } },
        orderBy: { criadoEm: 'desc' },
        select: { enrollmentId: true, message: true, criadoEm: true },
      })
      const latestByEnrollment = new Map<string, string>()
      for (const o of obs) {
        if (!o.enrollmentId) continue
        if (!latestByEnrollment.has(o.enrollmentId)) {
          latestByEnrollment.set(o.enrollmentId, o.message)
        }
      }
      removedWithReasons = enrollments
        .filter((e) => removedThisMonthIds.has(e.id))
        .map((e) => ({
          id: e.id,
          nome: e.nome,
          motivo: latestByEnrollment.get(e.id) ?? null,
        }))
    }

    const nfseAutorizadas = await nfseAutorizadasPromise
    const nfseMap = new Map<string, boolean>()
    for (const nf of nfseAutorizadas) {
      const key = `${nf.enrollmentId}:${nf.year}:${nf.month}`
      nfseMap.set(key, true)
    }

    // NFSe por enrollment (ref + status + errorMessage) para a coluna Status NF e Ações NF
    const nfsePorEnrollment = await prisma.nfseInvoice.findMany({
      where: {
        enrollmentId: { in: filteredEnrollments.map((e) => e.id) },
        ...(hasMonthFilter && year != null && month != null ? { year, month } : {}),
      },
      select: {
        enrollmentId: true,
        focusRef: true,
        status: true,
        errorMessage: true,
        pdfUrl: true,
        year: true,
        month: true,
      },
    })
    const nfseInfoMap = new Map<
      string,
      { focusRef: string; status: string; errorMessage: string | null; pdfUrl: string | null }
    >()
    for (const nf of nfsePorEnrollment) {
      const key = `${nf.enrollmentId}:${nf.year}:${nf.month}`
      nfseInfoMap.set(key, {
        focusRef: nf.focusRef,
        status: nf.status,
        errorMessage: nf.errorMessage ?? null,
        pdfUrl: nf.pdfUrl ?? null,
      })
    }

    // Agendamentos de NF (para exibir "Agendada" no Status NF)
    const nfseSchedules = await prisma.nfseSchedule.findMany({
      where: { enrollmentId: { in: enrollmentIds } },
      select: { enrollmentId: true, year: true, month: true },
    })
    const nfAgendadaSet = new Set(nfseSchedules.map((s) => `${s.enrollmentId}:${s.year}:${s.month}`))

    // E-mails de NF já enviados (agendamento processado) – exibir "E-mail enviado" e bloquear novo envio no mesmo mês
    const nfseEmailSentList =
      hasMonthFilter && year != null && month != null
        ? await prisma.nfseEmailSent.findMany({
            where: { enrollmentId: { in: enrollmentIds }, year, month },
            select: { enrollmentId: true },
          })
        : []
    const nfseEmailEnviadoSet = new Set(
      hasMonthFilter && year != null && month != null
        ? nfseEmailSentList.map((e) => e.enrollmentId)
        : []
    )

    // Valor por hora = valor mensal ÷ total de horas do mês.
    // Total de horas do mês = (frequência semanal × duração da aula em min) × 4 semanas ÷ 60.
    const WEEKS_PER_MONTH = 4

    const rows = filteredEnrollments.map((e) => {
      const pi = e.paymentInfo
      const pm = hasMonthFilter && e.paymentMonths && 'length' in e.paymentMonths ? (e.paymentMonths as { paymentStatus: string | null; paidAt: Date | null; notaFiscalEmitida: boolean | null }[])[0] : null
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
      const diaPagamento = e.diaPagamento ?? pi?.dueDay ?? null
      // Cada mês independente; vencimento fixo pelo dia (ex.: sempre dia 10). Não usa data do último pagamento.
      let dataProximoPagamento: string | null = null
      if (diaPagamento != null && diaPagamento >= 1 && diaPagamento <= 31) {
        dataProximoPagamento = nextDueDateFixed(diaPagamento, today).toISOString()
      } else if (pi?.dueDate) {
        dataProximoPagamento = pi.dueDate.toISOString()
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
      
      // Status no mês: cada mês é independente; vem de EnrollmentPaymentMonth quando há filtro, senão do PaymentInfo global
      const rawStatus: string | null = hasMonthFilter && pm ? pm.paymentStatus ?? null : pi?.paymentStatus ?? null
      const bolsista = Boolean((e as { bolsista?: boolean | null }).bolsista)
      // Bolsista: exibir como quitado no financeiro (sem cobrança/NF)
      const status: string | null = bolsista ? 'PAGO' : rawStatus

      // Verificar se existe NFSe autorizada para este enrollment no mês/ano de referência
      const nfseKey = `${e.id}:${refYear}:${refMonth}`
      const nfEmitida = nfseMap.has(nfseKey)
      const nfseInfo = nfseInfoMap.get(nfseKey)
      const nfAgendada = nfAgendadaSet.has(nfseKey)
      const nfseEmailEnviado = hasMonthFilter && year != null && month != null && refYear === year && refMonth === month ? nfseEmailEnviadoSet.has(e.id) : false
      
      const enr = e as { moraNoExterior?: boolean; enderecoExterior?: string | null; rua?: string | null; numero?: string | null; complemento?: string | null; cidade?: string | null; estado?: string | null; cep?: string | null }
      const enderecoCompleto =
        enr.moraNoExterior && enr.enderecoExterior
          ? enr.enderecoExterior.trim()
          : [enr.rua, enr.numero, enr.complemento, enr.cidade, enr.estado, enr.cep].filter(Boolean).join(', ') || null
      const enrFaturamento = e as { faturamentoTipo?: string | null; faturamentoRazaoSocial?: string | null; faturamentoCnpj?: string | null; faturamentoEmail?: string | null; faturamentoEndereco?: string | null; faturamentoDescricaoNfse?: string | null }

      const manualChargeAt = pi?.ultimaCobrancaManualAt ?? null
      const emailSentAt = emailSentMap.get(e.id) ?? null
      const coraCreatedAt = (e as { coraInvoices?: { criadoEm: Date }[] }).coraInvoices?.[0]?.criadoEm ?? null
      const lastChargeAt = [manualChargeAt, emailSentAt, coraCreatedAt].reduce<Date | null>((acc, d) => {
        if (!d) return acc
        if (!acc) return d
        return d > acc ? d : acc
      }, null)

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
        // Cada mês independente: data de pagamento só do mês selecionado (EnrollmentPaymentMonth.paidAt), não do último mês
        dataPagamento: (() => {
          if (!hasMonthFilter) return pi?.dataPagamento?.toISOString() ?? null
          if (pm?.paymentStatus !== 'PAGO') return null
          if (pm.paidAt) return pm.paidAt.toISOString()
          // Registros antigos PAGO sem paidAt: usar PaymentInfo.dataPagamento só se cair no mês selecionado
          const dp = pi?.dataPagamento
          if (dp && refYear === dp.getFullYear() && refMonth === dp.getMonth() + 1) return dp.toISOString()
          return null
        })(),
        status,
        enrollmentStatus: e.status,
        inactiveAt: e.inactiveAt?.toISOString() ?? null,
        metodoPagamento: e.metodoPagamento ?? pi?.metodo ?? null,
        banco: pi?.banco ?? null,
        periodoPagamento: pi?.periodoPagamento ?? null,
        dataUltimoPagamento: pi?.paidAt?.toISOString() ?? null,
        dataProximoPagamento,
        dataUltimaCobranca: lastChargeAt ? lastChargeAt.toISOString() : null,
        diaPagamento: diaPagamento ?? null,
        bolsista,
        notaFiscalEmitida: nfEmitida, // Calculado automaticamente da tabela nfse_invoices
        nfseFocusRef: nfseInfo?.focusRef ?? null,
        nfseStatus: nfseInfo?.status ?? null,
        nfseErrorMessage: nfseInfo?.errorMessage ?? null,
        nfsePdfUrl: nfseInfo?.pdfUrl ?? null,
        nfAgendada,
        nfseEmailEnviado,
        email: e.email,
        escolaMatricula: (e as { escolaMatricula?: string | null }).escolaMatricula ?? null,
        paymentInfoId: pi?.id ?? null,
        hasFinanceObservations: ((e as { _count?: { financeObservations: number } })._count?.financeObservations ?? 0) > 0,
      }
    })

    return NextResponse.json({ ok: true, data: { alunos: rows, removidosNesteMes: removedWithReasons } })
  } catch (error) {
    console.error('[api/admin/financeiro/alunos GET]', error)
    return NextResponse.json(
      { ok: false, message: 'Erro ao listar alunos financeiro' },
      { status: 500 }
    )
  }
}
