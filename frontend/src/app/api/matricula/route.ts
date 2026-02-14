/**
 * API Route: POST /api/matricula
 * 
 * Cria uma nova matrícula (Enrollment) no sistema.
 * Endpoint usado pela página /matricula
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { isValidEmail, normalizePhone, requireMinDigits } from '@/lib/validators'
import { normalizeLanguage } from '@/lib/normalizeLanguage'
import { createUniqueTrackingCode } from '@/lib/trackingCode'
import { sendComprovanteMatricula } from '@/lib/email'

export async function POST(request: NextRequest) {
  // Proteção externa: garantir que SEMPRE retornamos JSON
  try {
    // Tentar parsear o body (pode falhar se não for JSON válido)
    let body: any
    try {
      body = await request.json()
    } catch (parseError) {
      console.error('[api/matricula] Erro ao parsear JSON:', parseError)
      return NextResponse.json(
        {
          ok: false,
          message: 'Erro ao processar requisição. Verifique se o corpo da requisição é JSON válido.'
        },
        { status: 400 }
      )
    }

    const {
      nome,
      email,
      whatsapp,
      idioma,
      nivel,
      objetivo,
      disponibilidade,
      updateExisting,
      dataNascimento,
      cpf,
      tipoAula,
      nomeGrupo,
      tempoAulaMinutos,
      frequenciaSemanal,
      valorMensalidade: valorMensalidadeBody,
      diaPagamento,
      codigoCupom,
    } = body

    // Log do payload (sanitizado - sem dados sensíveis demais)
    console.log('[api/matricula] Payload recebido:', {
      nome: nome ? `${nome.substring(0, 10)}...` : undefined,
      email: email ? `${email.substring(0, 10)}...` : undefined,
      whatsapp: whatsapp ? '***' : undefined,
      idioma,
      nivel,
      temObjetivo: !!objetivo,
      temDisponibilidade: !!disponibilidade,
    })

    // Validações
    const errors: string[] = []

    if (!nome || typeof nome !== 'string' || !nome.trim()) {
      errors.push('Nome é obrigatório')
    }

    if (!email || typeof email !== 'string' || !email.trim()) {
      errors.push('Email é obrigatório')
    } else if (!isValidEmail(email)) {
      errors.push('Email inválido')
    }

    if (!whatsapp || typeof whatsapp !== 'string' || !whatsapp.trim()) {
      errors.push('WhatsApp é obrigatório')
    } else {
      if (!requireMinDigits(whatsapp, 10)) {
        errors.push('WhatsApp deve ter no mínimo 10 dígitos')
      }
    }

    // Normalizar idioma antes da validação
    // Se updateExisting = true, idioma/nivel/disponibilidade podem ser preenchidos agora
    let normalizedLanguage: 'ENGLISH' | 'SPANISH' | null = null
    if (!idioma) {
      if (!updateExisting) {
        errors.push('Idioma é obrigatório')
      }
    } else {
      normalizedLanguage = normalizeLanguage(idioma)
      if (!normalizedLanguage) {
        errors.push('Idioma inválido. Use "Inglês" ou "Espanhol"')
      }
    }

    if (!nivel || typeof nivel !== 'string' || !nivel.trim()) {
      if (!updateExisting) {
        errors.push('Nível é obrigatório')
      }
    }

    if (!disponibilidade || typeof disponibilidade !== 'string' || !disponibilidade.trim()) {
      if (!updateExisting) {
        errors.push('Disponibilidade é obrigatória')
      }
    }

    if (errors.length > 0) {
      console.error('[api/matricula] Validação falhou:', errors)
      return NextResponse.json(
        { 
          ok: false,
          message: 'Dados inválidos: ' + errors.join(', ')
        },
        { status: 400 }
      )
    }

    // Normalizar dados
    const normalizedEmail = email.trim().toLowerCase()
    const normalizedWhatsapp = normalizePhone(whatsapp)

    // Proteção específica para operação do Prisma
    let enrollment
    try {
      // Verificar se o Prisma Client está pronto
      if (!prisma) {
        console.error('[api/matricula] Prisma Client não está inicializado')
        return NextResponse.json(
          {
            ok: false,
            message: 'Erro de configuração do banco de dados. Verifique as configurações.'
          },
          { status: 500 }
        )
      }

      // Se updateExisting = true, buscar Enrollment existente por email/whatsapp e atualizar
      if (updateExisting) {
        console.log('[api/matricula] Atualizando enrollment existente para email/whatsapp:', normalizedEmail)
        
        // Buscar Enrollment mais recente com mesmo email ou whatsapp e status REGISTERED
        const existingEnrollment = await prisma.enrollment.findFirst({
          where: {
            OR: [
              { email: normalizedEmail },
              { whatsapp: normalizedWhatsapp },
            ],
            status: 'REGISTERED',
          },
          orderBy: { criadoEm: 'desc' },
        })

        if (!existingEnrollment) {
          return NextResponse.json(
            {
              ok: false,
              message: 'Enrollment não encontrado para atualização. Verifique os dados fornecidos.'
            },
            { status: 404 }
          )
        }

        // Preparar dados para update (só incluir campos que foram fornecidos)
        const updateData: any = {}
        if (normalizedLanguage) {
          updateData.idioma = normalizedLanguage
        }
        if (nivel && nivel.trim()) {
          updateData.nivel = nivel.trim()
        }
        if (objetivo !== undefined) {
          updateData.objetivo = objetivo?.trim() || null
        }
        if (disponibilidade && disponibilidade.trim()) {
          updateData.disponibilidade = disponibilidade.trim()
        }

        enrollment = await prisma.enrollment.update({
          where: { id: existingEnrollment.id },
          data: updateData,
        })

        console.log('[api/matricula] Enrollment atualizado com sucesso:', enrollment.id)
      } else {
        console.log('[api/matricula] Criando novo enrollment com idioma:', normalizedLanguage)

        // Gerar trackingCode único
        const trackingCode = await createUniqueTrackingCode()

        const createData: Record<string, unknown> = {
          nome: nome.trim(),
          email: normalizedEmail,
          whatsapp: normalizedWhatsapp,
          idioma: normalizedLanguage,
          nivel: (nivel && typeof nivel === 'string') ? nivel.trim() : null,
          objetivo: objetivo?.trim() || null,
          disponibilidade: disponibilidade?.trim() || null,
          status: 'ACTIVE',
          pendenteAdicionarAulas: true,
          trackingCode,
        }
        if (dataNascimento && typeof dataNascimento === 'string' && dataNascimento.trim()) {
          const d = new Date(dataNascimento.trim())
          if (!isNaN(d.getTime())) createData.dataNascimento = d
        }
        if (cpf && typeof cpf === 'string' && cpf.trim()) {
          createData.cpf = cpf.trim().replace(/\D/g, '').slice(0, 14)
        }
        if (tipoAula === 'PARTICULAR' || tipoAula === 'GRUPO') {
          createData.tipoAula = tipoAula
          if (tipoAula === 'GRUPO' && nomeGrupo && typeof nomeGrupo === 'string' && nomeGrupo.trim()) {
            createData.nomeGrupo = nomeGrupo.trim().slice(0, 255)
          }
        }
        createData.escolaMatricula = 'SEIDMANN'
        if (tempoAulaMinutos != null && tempoAulaMinutos !== '') {
          const t = typeof tempoAulaMinutos === 'number' ? tempoAulaMinutos : parseInt(String(tempoAulaMinutos), 10)
          if (!Number.isNaN(t) && [30, 40, 60, 120].includes(t)) {
            createData.tempoAulaMinutos = t
          }
        }
        if (frequenciaSemanal != null && frequenciaSemanal !== '') {
          const f = typeof frequenciaSemanal === 'number' ? frequenciaSemanal : parseInt(String(frequenciaSemanal), 10)
          if (!Number.isNaN(f) && f >= 1 && f <= 7) {
            createData.frequenciaSemanal = f
          }
        }
        if (valorMensalidadeBody != null) {
          const v = typeof valorMensalidadeBody === 'number' ? valorMensalidadeBody : parseFloat(String(valorMensalidadeBody).replace(',', '.'))
          if (!Number.isNaN(v) && v >= 0) createData.valorMensalidade = v
        }
        if (diaPagamento != null && diaPagamento !== '') {
          const d = typeof diaPagamento === 'number' ? diaPagamento : parseInt(String(diaPagamento), 10)
          if (!Number.isNaN(d) && d >= 1 && d <= 25) {
            createData.diaPagamento = d
          }
        }
        if (codigoCupom && typeof codigoCupom === 'string' && codigoCupom.trim()) {
          const coupon = await prisma.coupon.findFirst({
            where: {
              codigo: codigoCupom.trim().toUpperCase(),
              ativo: true,
              OR: [
                { validade: null },
                { validade: { gte: new Date() } },
              ],
            },
          })
          if (coupon) {
            createData.couponId = coupon.id
          }
        }
        enrollment = await prisma.enrollment.create({
          data: createData as any,
        })

        console.log('[api/matricula] Enrollment criado com sucesso:', enrollment.id)

        // Enviar e-mail de comprovante de matrícula ao aluno (não bloqueia a resposta)
        const emailEnviado = await sendComprovanteMatricula({
          nome: enrollment.nome,
          email: enrollment.email,
          whatsapp: enrollment.whatsapp,
          idioma: enrollment.idioma ?? undefined,
          tipoAula: enrollment.tipoAula ?? undefined,
          nomeGrupo: enrollment.nomeGrupo ?? undefined,
          valorMensalidade: enrollment.valorMensalidade,
          frequenciaSemanal: enrollment.frequenciaSemanal ?? undefined,
          disponibilidade: enrollment.disponibilidade ?? undefined,
          diaPagamento: enrollment.diaPagamento ?? undefined,
          nomeVendedor: enrollment.nomeVendedor ?? undefined,
        })
        if (emailEnviado) {
          console.log('[api/matricula] E-mail de comprovante enviado para:', enrollment.email)
        } else {
          console.warn('[api/matricula] E-mail de comprovante não enviado (SMTP pode não estar configurado)')
        }
      }
    } catch (prismaError: any) {
      // Erro específico do Prisma - sempre retornar JSON
      console.error('[api/matricula] Erro do Prisma ao criar enrollment:')
      console.error('  Tipo:', typeof prismaError)
      console.error('  Código:', prismaError?.code)
      console.error('  Mensagem:', prismaError?.message)
      if (prismaError?.stack) {
        console.error('  Stack:', prismaError.stack)
      }
      
      // P1001 = Cannot reach database server
      // P1003 = Database does not exist
      if (prismaError?.code === 'P1001' || prismaError?.code === 'P1003') {
        return NextResponse.json(
          {
            ok: false,
            message: 'Banco de dados não está disponível. Verifique a conexão e o arquivo .env.local'
          },
          { status: 500 }
        )
      }
      
      // P2002 = Unique constraint violation (duplicata)
      if (prismaError?.code === 'P2002') {
        return NextResponse.json(
          {
            ok: false,
            message: 'Erro ao processar dados. Verifique se os dados estão corretos.'
          },
          { status: 409 }
        )
      }
      
      // P2003 = Foreign key constraint failed
      if (prismaError?.code === 'P2003') {
        return NextResponse.json(
          {
            ok: false,
            message: 'Erro ao criar matrícula. Dados inválidos.'
          },
          { status: 400 }
        )
      }
      
      // P2021 = Table does not exist (migration não rodou)
      // P2025 = Record to delete/update does not exist (mas também pode ser tabela)
      if (
        prismaError?.code === 'P2021' ||
        prismaError?.code === 'P2025' ||
        prismaError?.message?.includes('does not exist') ||
        prismaError?.message?.includes('Table')
      ) {
        console.error('[api/matricula] Tabela não existe. Migration não rodou.')
        return NextResponse.json(
          {
            ok: false,
            message: 'Banco de dados não está preparado. Rode: npx prisma migrate dev --name init'
          },
          { status: 503 }
        )
      }
      
      // Qualquer outro erro do Prisma
      console.error('[api/matricula] Erro Prisma não tratado:', JSON.stringify(prismaError, null, 2))
      return NextResponse.json(
        {
          ok: false,
          message: 'Erro ao criar matrícula. Verifique os logs do servidor.'
        },
        { status: 500 }
      )
    }

    // Retornar resposta de sucesso (formato padronizado)
    // Usar enrollment.criadoEm (campo do Prisma) e converter para ISO string
    try {
      return NextResponse.json(
        {
          ok: true,
          data: {
            enrollment: {
              id: enrollment.id,
                  nome: enrollment.nome,
                  email: enrollment.email,
                  whatsapp: enrollment.whatsapp,
                  idioma: enrollment.idioma,
                  nivel: enrollment.nivel,
                  objetivo: enrollment.objetivo,
                  disponibilidade: enrollment.disponibilidade,
                  status: enrollment.status,
                  trackingCode: enrollment.trackingCode, // Incluir código de acompanhamento
                  createdAt: enrollment.criadoEm.toISOString(),
            },
          },
        },
        { status: 201 }
      )
    } catch (jsonError) {
      // Se falhar ao construir JSON de resposta, retornar erro genérico
      console.error('Erro ao construir resposta JSON:', jsonError)
      return NextResponse.json(
        {
          ok: false,
          message: 'Erro ao criar matrícula'
        },
        { status: 500 }
      )
    }
  } catch (error) {
    // Catch final: captura QUALQUER erro não previsto acima
    // Sempre retornar JSON, nunca HTML
    console.error('[api/matricula] Erro inesperado:', error)
    if (error instanceof Error) {
      console.error('[api/matricula] Mensagem:', error.message)
      console.error('[api/matricula] Stack:', error.stack)
    }
    
    // Garantir que sempre retornamos JSON, mesmo em caso de erro crítico
    return NextResponse.json(
      { 
        ok: false,
        message: 'Erro ao criar matrícula'
      },
      { status: 500 }
    )
  }
}
