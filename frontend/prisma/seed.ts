/**
 * Prisma Seed
 * 
 * Cria o usuário admin inicial usando variáveis de ambiente.
 * 
 * Variáveis necessárias:
 * - ADMIN_EMAIL
 * - ADMIN_PASSWORD
 * - ADMIN_NAME (opcional, default: "Admin")
 * 
 * Executar: npm run db:seed
 */

import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

async function main() {
  const adminEmail = process.env.ADMIN_EMAIL
  const adminPassword = process.env.ADMIN_PASSWORD
  const adminName = process.env.ADMIN_NAME || 'Admin'

  if (!adminEmail || !adminPassword) {
    console.error('❌ Erro: ADMIN_EMAIL e ADMIN_PASSWORD devem estar configurados no .env.local')
    console.error('Exemplo:')
    console.error('  ADMIN_EMAIL=admin@seidmann.com')
    console.error('  ADMIN_PASSWORD=senhaSegura123')
    process.exit(1)
  }

  const normalizedEmail = adminEmail.trim().toLowerCase()

  // Hash da senha (10 salt rounds)
  const senhaHash = await bcrypt.hash(adminPassword, 10)

  // Usar upsert para criar ou atualizar admin (idempotente)
  const admin = await prisma.user.upsert({
    where: { email: normalizedEmail },
    update: {
      // Atualizar role, status e senha para garantir idempotência
      role: 'ADMIN',
      status: 'ACTIVE',
      senha: senhaHash, // Atualiza senha se mudou no .env
      nome: adminName.trim(), // Atualiza nome se mudou
    },
    create: {
      nome: adminName.trim(),
      email: normalizedEmail,
      whatsapp: '00000000000', // Placeholder - admin pode não ter whatsapp
      senha: senhaHash,
      role: 'ADMIN',
      status: 'ACTIVE',
    },
  })

  console.log('✅ Usuário admin garantido (criado ou atualizado)!')
  console.log('   Email:', normalizedEmail)
  console.log('   Nome:', admin.nome)
  console.log('   Role:', admin.role)
  console.log('   Status:', admin.status)
  console.log('')
  console.log('⚠️  IMPORTANTE: Guarde suas credenciais com segurança!')
}

main()
  .catch((error) => {
    console.error('❌ Erro ao executar seed:', error)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
