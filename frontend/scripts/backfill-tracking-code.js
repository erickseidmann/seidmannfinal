/**
 * Script para preencher trackingCode em enrollments existentes
 * 
 * Uso: node scripts/backfill-tracking-code.js
 * 
 * Este script:
 * - Busca todos os enrollments sem trackingCode
 * - Gera um código único para cada um
 * - Atualiza no banco de dados
 */

const { PrismaClient } = require('@prisma/client')

const prisma = new PrismaClient()

/**
 * Gera um código de acompanhamento: MAT- + 8 caracteres alfanuméricos
 */
function generateTrackingCode() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
  let result = 'MAT-'
  for (let i = 0; i < 8; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return result
}

/**
 * Cria um código único verificando no banco
 */
async function createUniqueTrackingCode() {
  let attempts = 0
  const maxAttempts = 20

  while (attempts < maxAttempts) {
    const code = generateTrackingCode()
    
    // Verificar se já existe
    const existing = await prisma.enrollment.findUnique({
      where: { trackingCode: code },
    })

    if (!existing) {
      return code
    }

    attempts++
  }

  throw new Error(`Não foi possível gerar código único após ${maxAttempts} tentativas`)
}

async function main() {
  try {
    console.log('🔍 Buscando enrollments sem trackingCode...')
    
    // Buscar enrollments sem trackingCode
    const enrollments = await prisma.enrollment.findMany({
      where: {
        trackingCode: null,
      },
      select: {
        id: true,
        nome: true,
        email: true,
        status: true,
      },
    })

    if (enrollments.length === 0) {
      console.log('✅ Todos os enrollments já possuem trackingCode!')
      return
    }

    console.log(`📋 Encontrados ${enrollments.length} enrollment(s) sem trackingCode.`)
    console.log('🔄 Gerando códigos únicos...\n')

    let successCount = 0
    let errorCount = 0

    for (const enrollment of enrollments) {
      try {
        const trackingCode = await createUniqueTrackingCode()
        
        await prisma.enrollment.update({
          where: { id: enrollment.id },
          data: { trackingCode },
        })

        console.log(`✅ ${enrollment.id}: ${trackingCode} (${enrollment.nome} - ${enrollment.status})`)
        successCount++
      } catch (error) {
        console.error(`❌ Erro ao atualizar ${enrollment.id}:`, error.message)
        errorCount++
      }
    }

    console.log('\n📊 Resumo:')
    console.log(`   ✅ Sucesso: ${successCount}`)
    console.log(`   ❌ Erros: ${errorCount}`)
    console.log('\n✅ Backfill concluído!')
  } catch (error) {
    console.error('❌ Erro fatal:', error)
    process.exit(1)
  } finally {
    await prisma.$disconnect()
  }
}

// Executar
main()
