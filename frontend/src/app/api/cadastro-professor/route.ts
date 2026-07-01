/**
 * POST /api/cadastro-professor
 *
 * Endpoint público (sem autenticação) que recebe o cadastro do professor.
 * Cria o registro com status `PENDING` para o admin revisar e aprovar.
 * Não cria o User de login automaticamente — isso é feito quando o admin libera o acesso.
 */

import { NextRequest, NextResponse } from 'next/server'
import { readFile } from 'fs/promises'
import { join } from 'path'
import { prisma } from '@/lib/prisma'
import { isValidEmail, isValidWhatsApp, normalizePhone } from '@/lib/validators'
import { isValidCPF, isValidCNPJ } from '@/lib/finance/validators'
import { sendEmail } from '@/lib/email'
import {
  CONTRATO_PDF_FILENAME,
  CONTRATO_PDF_PATH,
  gerarEmailCadastroProfessor,
} from '@/lib/contrato-professor'
import { DEFAULT_TEACHER_PAYMENT_DUE_DAY } from '@/lib/finance/teacher-nf-window'

const IDIOMAS_VALIDOS = ['PORTUGUES', 'INGLES', 'ESPANHOL', 'ITALIANO', 'FRANCES'] as const
type IdiomaValido = (typeof IDIOMAS_VALIDOS)[number]

const METODOS_PAGAMENTO_VALIDOS = ['PIX', 'CARTAO', 'OUTRO'] as const
type MetodoPagamentoValido = (typeof METODOS_PAGAMENTO_VALIDOS)[number]

interface SlotInput {
  dayOfWeek: number
  startMinutes: number
  endMinutes: number
}

function formatarCpf(d: string): string {
  const s = d.replace(/\D/g, '').padStart(11, '0').slice(-11)
  return `${s.slice(0, 3)}.${s.slice(3, 6)}.${s.slice(6, 9)}-${s.slice(9, 11)}`
}

function formatarCnpj(d: string): string {
  const s = d.replace(/\D/g, '').padStart(14, '0').slice(-14)
  return `${s.slice(0, 2)}.${s.slice(2, 5)}.${s.slice(5, 8)}/${s.slice(8, 12)}-${s.slice(12, 14)}`
}

function sanitizeIdiomas(input: unknown): IdiomaValido[] {
  if (!Array.isArray(input)) return []
  const set = new Set<IdiomaValido>()
  for (const item of input) {
    const upper = String(item ?? '').trim().toUpperCase()
    if ((IDIOMAS_VALIDOS as readonly string[]).includes(upper)) {
      set.add(upper as IdiomaValido)
    }
  }
  return [...set]
}

function sanitizeSlots(input: unknown): SlotInput[] {
  if (!Array.isArray(input)) return []
  const slots: SlotInput[] = []
  for (const raw of input) {
    if (!raw || typeof raw !== 'object') continue
    const r = raw as Record<string, unknown>
    const dayOfWeek = Number(r.dayOfWeek)
    const startMinutes = Number(r.startMinutes)
    const endMinutes = Number(r.endMinutes)
    if (!Number.isInteger(dayOfWeek) || dayOfWeek < 0 || dayOfWeek > 6) continue
    if (!Number.isInteger(startMinutes) || startMinutes < 0 || startMinutes > 1439) continue
    if (!Number.isInteger(endMinutes) || endMinutes <= startMinutes || endMinutes > 1440) continue
    slots.push({ dayOfWeek, startMinutes, endMinutes })
  }
  return slots
}

export async function POST(request: NextRequest) {
  try {
    let body: Record<string, unknown>
    try {
      body = (await request.json()) as Record<string, unknown>
    } catch {
      return NextResponse.json(
        { ok: false, message: 'Corpo da requisição inválido (JSON malformado).' },
        { status: 400 }
      )
    }

    const nome = typeof body.nome === 'string' ? body.nome.trim() : ''
    const nomePreferido = typeof body.nomePreferido === 'string' ? body.nomePreferido.trim() : ''
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
    const whatsappRaw = typeof body.whatsapp === 'string' ? body.whatsapp : ''
    const cpfRaw = typeof body.cpf === 'string' ? body.cpf : ''
    const cnpjRaw = typeof body.cnpj === 'string' ? body.cnpj : ''
    const valorPorHoraRaw = body.valorPorHora
    const metodoPagamentoRaw = typeof body.metodoPagamento === 'string' ? body.metodoPagamento.trim().toUpperCase() : ''
    const infosPagamento = typeof body.infosPagamento === 'string' ? body.infosPagamento.trim() : ''
    const cienteDataPagamento = body.cienteDataPagamento === true
    const aceiteContrato = body.aceiteContrato === true
    const observacoes = typeof body.observacoes === 'string' ? body.observacoes.trim() : ''

    const idiomasFala = sanitizeIdiomas(body.idiomasFala)
    const idiomasEnsina = sanitizeIdiomas(body.idiomasEnsina)
    const slots = sanitizeSlots(body.availabilitySlots)

    const errors: string[] = []

    if (!nome) errors.push('Nome é obrigatório')
    else if (nome.length < 2) errors.push('Nome muito curto')

    if (!nomePreferido) {
      errors.push('Informe como prefere ser chamado')
    }

    if (!email) {
      errors.push('E-mail é obrigatório')
    } else if (!isValidEmail(email)) {
      errors.push('E-mail inválido')
    }

    const whatsappDigits = normalizePhone(whatsappRaw)
    if (!whatsappDigits) {
      errors.push('WhatsApp é obrigatório')
    } else if (!isValidWhatsApp(whatsappRaw)) {
      errors.push('WhatsApp deve ter 10 ou 11 dígitos (apenas números, com DDD)')
    }

    const cpfDigits = cpfRaw ? cpfRaw.replace(/\D/g, '') : ''
    const cnpjDigits = cnpjRaw ? cnpjRaw.replace(/\D/g, '') : ''
    if (!cpfDigits && !cnpjDigits) {
      errors.push('Informe CPF ou CNPJ')
    }
    if (cpfDigits) {
      if (cpfDigits.length !== 11 || !isValidCPF(cpfDigits)) {
        errors.push('CPF inválido')
      }
    }
    if (cnpjDigits) {
      if (cnpjDigits.length !== 14 || !isValidCNPJ(cnpjDigits)) {
        errors.push('CNPJ inválido')
      }
    }

    if (idiomasFala.length === 0) {
      errors.push('Informe pelo menos um idioma que você fala')
    }
    if (idiomasEnsina.length === 0) {
      errors.push('Informe pelo menos um idioma que você ensina')
    }
    // Idioma ensinado deve ser também idioma falado
    for (const ens of idiomasEnsina) {
      if (!idiomasFala.includes(ens)) {
        errors.push(`Você marcou que ensina ${ens.toLowerCase()} mas não marcou que fala esse idioma`)
        break
      }
    }

    // Valor inicial fixo: todo professor que se cadastra começa com R$ 18,00/h.
    // Ignoramos qualquer valor enviado pelo cliente (o input é read-only no formulário).
    void valorPorHoraRaw
    const VALOR_HORA_INICIAL = 18
    const valorPorHoraNum: number = VALOR_HORA_INICIAL

    let metodoPagamento: MetodoPagamentoValido | null = null
    if (!metodoPagamentoRaw) {
      errors.push('Método de pagamento é obrigatório')
    } else if (!(METODOS_PAGAMENTO_VALIDOS as readonly string[]).includes(metodoPagamentoRaw)) {
      errors.push('Método de pagamento inválido')
    } else {
      metodoPagamento = metodoPagamentoRaw as MetodoPagamentoValido
    }

    if (!infosPagamento) {
      errors.push('Informe os dados para pagamento (chave PIX, conta bancária, etc.)')
    }

    if (!cienteDataPagamento) {
      errors.push(
        'É necessário confirmar que está ciente da data de pagamento (dia 25, ou próximo dia útil em caso de feriado/fim de semana)'
      )
    }

    if (!aceiteContrato) {
      errors.push(
        'É necessário ler e concordar com o Contrato de Prestação de Serviços antes de enviar o cadastro'
      )
    }

    if (errors.length > 0) {
      return NextResponse.json(
        { ok: false, message: 'Dados inválidos: ' + errors.join('; ') },
        { status: 400 }
      )
    }

    // E-mail único: nem em teachers, nem em users
    const [existingTeacher, existingUser] = await Promise.all([
      prisma.teacher.findUnique({ where: { email }, select: { id: true } }),
      prisma.user.findUnique({ where: { email }, select: { id: true, role: true } }),
    ])
    if (existingTeacher) {
      return NextResponse.json(
        {
          ok: false,
          message:
            'Este e-mail já está cadastrado como professor. Se for você, entre em contato com a escola para liberar o acesso.',
        },
        { status: 409 }
      )
    }
    if (existingUser) {
      return NextResponse.json(
        {
          ok: false,
          message:
            'Este e-mail já está em uso por outro usuário. Use um e-mail diferente ou entre em contato com a escola.',
        },
        { status: 409 }
      )
    }

    const teacher = await prisma.$transaction(async (tx) => {
      const created = await tx.teacher.create({
        data: {
          nome,
          nomePreferido: nomePreferido || null,
          email,
          whatsapp: whatsappDigits || null,
          cpf: cpfDigits ? cpfDigits.slice(0, 14) : null,
          cnpj: cnpjDigits ? cnpjDigits.slice(0, 14) : null,
          valorPorHora: valorPorHoraNum,
          metodoPagamento,
          infosPagamento: infosPagamento || null,
          idiomasFala: idiomasFala.length > 0 ? (idiomasFala as unknown as object) : undefined,
          idiomasEnsina: idiomasEnsina.length > 0 ? (idiomasEnsina as unknown as object) : undefined,
          status: 'PENDING',
          paymentDueDay: DEFAULT_TEACHER_PAYMENT_DUE_DAY,
        },
        select: { id: true, nome: true, email: true, criadoEm: true },
      })

      if (slots.length > 0) {
        await tx.teacherAvailabilitySlot.createMany({
          data: slots.map((s) => ({
            teacherId: created.id,
            dayOfWeek: s.dayOfWeek,
            startMinutes: s.startMinutes,
            endMinutes: s.endMinutes,
          })),
        })
      }

      return created
    })

    if (slots.length > 0) {
      try {
        await prisma.teacherAvailabilityLog.create({
          data: {
            teacherId: teacher.id,
            slotsSnapshot: slots as unknown as object,
            changedByUserId: null,
          },
        })
      } catch (logErr) {
        console.warn('[api/cadastro-professor] Falha ao gravar log de disponibilidade:', logErr)
      }
    }

    // Registra audit trail: ciência da data de pagamento + aceite de contrato + observações.
    // Usamos FinanceObservation porque é a tabela mais próxima do contexto e evita
    // adicionar colunas novas só para isso.
    const dataAceite = new Date()
    try {
      const documentoAceito = cpfDigits || cnpjDigits || '—'
      const partes: string[] = []
      partes.push(
        `[Cadastro público] Confirmou ciência da política de pagamento: dia 25 (ou próximo dia útil em caso de feriado/fim de semana). Aceito em ${dataAceite.toISOString()}.`
      )
      partes.push(
        `[Cadastro público] Leu e aceitou o Contrato de Prestação de Serviços Educacionais (versão Seidmann 2026). Documento informado: ${documentoAceito}. Aceito em ${dataAceite.toISOString()}.`
      )
      if (observacoes) {
        partes.push(`Observações: ${observacoes}`)
      }
      await prisma.financeObservation.create({
        data: {
          teacherId: teacher.id,
          message: partes.join('\n').slice(0, 4000),
        },
      })
    } catch {
      // ignorar — observação é informativa
    }

    // E-mail de confirmação com o contrato (texto + PDF em anexo).
    // "Fire-and-forget": o sucesso do cadastro não depende do e-mail ter sido enviado.
    try {
      const documentoLabel = cpfDigits
        ? formatarCpf(cpfDigits)
        : cnpjDigits
          ? formatarCnpj(cnpjDigits)
          : '—'
      const { subject, html, text } = gerarEmailCadastroProfessor(
        { nome, documento: documentoLabel },
        dataAceite
      )

      let pdfBuffer: Buffer | null = null
      try {
        const pdfPath = join(process.cwd(), 'public', CONTRATO_PDF_PATH)
        pdfBuffer = await readFile(pdfPath)
      } catch (pdfErr) {
        console.warn('[api/cadastro-professor] Não foi possível ler o PDF do contrato:', pdfErr)
      }

      void sendEmail({
        to: email,
        subject,
        text,
        html,
        attachments: pdfBuffer
          ? [{ filename: CONTRATO_PDF_FILENAME, content: pdfBuffer }]
          : undefined,
      }).catch((err) => {
        console.warn('[api/cadastro-professor] Falha no envio do e-mail de cadastro:', err)
      })
    } catch (emailErr) {
      console.warn('[api/cadastro-professor] Erro ao montar e-mail de confirmação:', emailErr)
    }

    return NextResponse.json(
      {
        ok: true,
        data: {
          teacher: {
            id: teacher.id,
            nome: teacher.nome,
            email: teacher.email,
            criadoEm: teacher.criadoEm.toISOString(),
          },
        },
        message:
          'Cadastro recebido! Em breve a equipe da escola entrará em contato para validar suas informações.',
      },
      { status: 201 }
    )
  } catch (error) {
    console.error('[api/cadastro-professor]', error)
    const prismaCode =
      error && typeof error === 'object' && 'code' in error
        ? String((error as { code?: string }).code)
        : ''
    if (prismaCode === 'P2002') {
      return NextResponse.json(
        {
          ok: false,
          message:
            'Este e-mail já está cadastrado. Se você já enviou o formulário, aguarde o contato da escola ou use outro e-mail.',
        },
        { status: 409 }
      )
    }
    return NextResponse.json(
      { ok: false, message: 'Erro ao processar cadastro. Tente novamente em instantes.' },
      { status: 500 }
    )
  }
}
