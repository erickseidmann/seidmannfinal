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

    const { nome, email, whatsapp, idioma, nivel, objetivo, disponibilidade, updateExisting } = body

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

        enrollment = await prisma.enrollment.create({
          data: {
            nome: nome.trim(),
            email: normalizedEmail,
            whatsapp: normalizedWhatsapp,
            idioma: normalizedLanguage, // Já validado e normalizado acima
            nivel: nivel.trim(),
            objetivo: objetivo?.trim() || null,
            disponibilidade: disponibilidade?.trim() || null,
            status: 'LEAD',
            trackingCode, // Código único para acompanhamento
          },
        })

        console.log('[api/matricula] Enrollment criado com sucesso:', enrollment.id)
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
