/**
 * API Route: PATCH /api/admin/enrollments/[id]
 *
 * Ações admin sobre enrollments:
 * - approve: Marca Enrollment como REGISTERED e User.status como ACTIVE
 * - complete: Marca Enrollment como COMPLETED
 * - update: Atualiza todos os dados do aluno (edição)
 *
 * Requer autenticação admin via sessão (cookie httpOnly)
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/auth'

const VALID_STATUSES = ['LEAD', 'REGISTERED', 'CONTRACT_ACCEPTED', 'PAYMENT_PENDING', 'ACTIVE', 'INACTIVE', 'PAUSED', 'BLOCKED', 'COMPLETED']

function buildUpdateData(body: Record<string, unknown>) {
  const {
    nome,
    email,
    whatsapp,
    dataNascimento,
    nomeResponsavel,
    cpf,
    cpfResponsavel,
    curso,
    frequenciaSemanal,
    tempoAulaMinutos,
    tipoAula,
    nomeGrupo,
    cep,
    rua,
    cidade,
    estado,
    numero,
    complemento,
    moraNoExterior,
    enderecoExterior,
    valorMensalidade,
    metodoPagamento,
    diaPagamento,
    melhoresHorarios,
    melhoresDiasSemana,
    nomeVendedor,
    nomeEmpresaOuIndicador,
    observacoes,
    status,
  } = body

  const update: Record<string, unknown> = {}
  if (nome != null) update.nome = String(nome).trim()
  if (email != null) update.email = String(email).trim().toLowerCase()
  if (whatsapp != null) update.whatsapp = String(whatsapp).trim()
  if (dataNascimento != null) update.dataNascimento = dataNascimento ? new Date(dataNascimento as string) : null
  if (nomeResponsavel !== undefined) update.nomeResponsavel = nomeResponsavel ? String(nomeResponsavel).trim() : null
  if (cpf !== undefined) update.cpf = cpf ? String(cpf).trim().replace(/\D/g, '').slice(0, 14) : null
  if (cpfResponsavel !== undefined) update.cpfResponsavel = cpfResponsavel ? String(cpfResponsavel).trim().replace(/\D/g, '').slice(0, 14) : null
  if (curso !== undefined) update.curso = curso || null
  if (frequenciaSemanal !== undefined && frequenciaSemanal !== '') update.frequenciaSemanal = Math.min(7, Math.max(1, Number(frequenciaSemanal)))
  if (tempoAulaMinutos !== undefined && tempoAulaMinutos !== '') update.tempoAulaMinutos = [30, 40, 60, 120].includes(Number(tempoAulaMinutos)) ? Number(tempoAulaMinutos) : null
  if (tipoAula !== undefined) update.tipoAula = tipoAula === 'PARTICULAR' || tipoAula === 'GRUPO' ? tipoAula : null
  if (nomeGrupo !== undefined) update.nomeGrupo = nomeGrupo ? String(nomeGrupo).trim() : null
  if (cep !== undefined) update.cep = cep ? String(cep).trim().replace(/\D/g, '').slice(0, 9) : null
  if (rua !== undefined) update.rua = rua ? String(rua).trim() : null
  if (cidade !== undefined) update.cidade = cidade ? String(cidade).trim() : null
  if (estado !== undefined) update.estado = estado ? String(estado).trim().slice(0, 2) : null
  if (numero !== undefined) update.numero = numero ? String(numero).trim() : null
  if (complemento !== undefined) update.complemento = complemento ? String(complemento).trim() : null
  if (moraNoExterior !== undefined) update.moraNoExterior = Boolean(moraNoExterior)
  if (enderecoExterior !== undefined) update.enderecoExterior = enderecoExterior ? String(enderecoExterior).trim() : null
  if (valorMensalidade !== undefined && valorMensalidade !== '') update.valorMensalidade = Number(String(valorMensalidade).replace(',', '.'))
  if (metodoPagamento !== undefined) update.metodoPagamento = metodoPagamento ? String(metodoPagamento).trim() : null
  if (diaPagamento !== undefined && diaPagamento !== '') update.diaPagamento = Math.min(31, Math.max(1, Number(diaPagamento)))
  if (melhoresHorarios !== undefined) update.melhoresHorarios = melhoresHorarios ? String(melhoresHorarios).trim() : null
  if (melhoresDiasSemana !== undefined) update.melhoresDiasSemana = melhoresDiasSemana ? String(melhoresDiasSemana).trim() : null
  if (nomeVendedor !== undefined) update.nomeVendedor = nomeVendedor ? String(nomeVendedor).trim() : null
  if (nomeEmpresaOuIndicador !== undefined) update.nomeEmpresaOuIndicador = nomeEmpresaOuIndicador ? String(nomeEmpresaOuIndicador).trim() : null
  if (observacoes !== undefined) update.observacoes = observacoes ? String(observacoes).trim() : null
  if (status !== undefined && VALID_STATUSES.includes(String(status))) update.status = status
  return update
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const auth = await requireAdmin(request)
    if (!auth.authorized) {
      return NextResponse.json(
        { ok: false, message: auth.message || 'Não autorizado' },
        { status: auth.message?.includes('Não autenticado') ? 401 : 403 }
      )
    }

    const { id } = params
    const body = await request.json()
    const { action } = body

    if (!action || typeof action !== 'string') {
      return NextResponse.json(
        { ok: false, message: 'Ação é obrigatória. Use "approve", "complete" ou "update"' },
        { status: 400 }
      )
    }

    if (!['approve', 'complete', 'update'].includes(action)) {
      return NextResponse.json(
        { ok: false, message: 'Ação inválida. Use "approve", "complete" ou "update"' },
        { status: 400 }
      )
    }

    const enrollment = await prisma.enrollment.findUnique({
      where: { id },
      include: { user: true },
    })

    if (!enrollment) {
      return NextResponse.json(
        { ok: false, message: 'Enrollment não encontrado' },
        { status: 404 }
      )
    }

    let updatedEnrollment

    if (action === 'update') {
      if (!body.nome || !body.email || !body.whatsapp) {
        return NextResponse.json(
          { ok: false, message: 'Nome, email e WhatsApp são obrigatórios' },
          { status: 400 }
        )
      }
      const updateData = buildUpdateData(body) as any
      updatedEnrollment = await prisma.enrollment.update({
        where: { id },
        data: updateData,
      })
      return NextResponse.json({
        ok: true,
        data: { enrollment: updatedEnrollment, message: 'Aluno atualizado com sucesso' },
      })
    }

    if (action === 'approve') {
      updatedEnrollment = await prisma.enrollment.update({
        where: { id },
        data: { status: 'REGISTERED' },
      })
      if (enrollment.userId && enrollment.user) {
        await prisma.user.update({
          where: { id: enrollment.userId },
          data: { status: 'ACTIVE' },
        })
      }
      return NextResponse.json({
        ok: true,
        data: {
          enrollment: updatedEnrollment,
          message: 'Enrollment aprovado e acesso liberado',
        },
      })
    }

    if (action === 'complete') {
      updatedEnrollment = await prisma.enrollment.update({
        where: { id },
        data: { status: 'COMPLETED' },
      })
      return NextResponse.json({
        ok: true,
        data: {
          enrollment: updatedEnrollment,
          message: 'Enrollment marcado como concluído',
        },
      })
    }

    return NextResponse.json({ ok: false, message: 'Ação inválida' }, { status: 400 })
  } catch (error) {
    console.error('[api/admin/enrollments/[id]] Erro ao processar ação:', error)
    return NextResponse.json(
      { ok: false, message: 'Erro ao processar ação no enrollment' },
      { status: 500 }
    )
  }
}
