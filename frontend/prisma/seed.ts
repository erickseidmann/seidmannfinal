/**
 * Prisma Seed – Admin inicial
 *
 * Cria o usuário ADMIN apenas se ainda não existir (não sobrescreve).
 * Usa bcrypt (10 rounds), igual ao login.
 *
 * Variáveis de ambiente:
 * - ADMIN_EMAIL (obrigatório)
 * - ADMIN_PASSWORD (obrigatório)
 * - ADMIN_NAME (opcional, default: "Admin")
 *
 * Uso: npx prisma db seed | npm run db:seed
 */

import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

async function main() {
  const adminEmail = process.env.ADMIN_EMAIL
  const adminPassword = process.env.ADMIN_PASSWORD
  const adminName = process.env.ADMIN_NAME || 'Admin'

  if (!adminEmail?.trim() || !adminPassword) {
    console.error('❌ ADMIN_EMAIL e ADMIN_PASSWORD são obrigatórios no .env')
    console.error('   Ex.: ADMIN_EMAIL=admin@seidmann.com  ADMIN_PASSWORD=123456')
    process.exit(1)
  }

  const normalizedEmail = adminEmail.trim().toLowerCase()

  const existing = await prisma.user.findUnique({
    where: { email: normalizedEmail },
  })

  if (existing) {
    if (existing.role === 'ADMIN' && existing.status === 'ACTIVE') {
      console.log('✅ Admin já existe:', normalizedEmail)
      return
    }
    console.error('❌ Já existe usuário com esse email e não é ADMIN ativo:', normalizedEmail)
    process.exit(1)
  }

  const senhaHash = await bcrypt.hash(adminPassword, 10)

  await prisma.user.create({
    data: {
      nome: adminName.trim(),
      email: normalizedEmail,
      whatsapp: '00000000000',
      senha: senhaHash,
      role: 'ADMIN',
      status: 'ACTIVE',
    },
  })

  console.log('✅ Admin criado:', normalizedEmail)
  console.log('   Nome:', adminName.trim(), '| Role: ADMIN | Status: ACTIVE')
  console.log('   ⚠️ Troque a senha em produção.')
}

main()
  .catch((e) => {
    console.error('❌ Seed falhou:', e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
