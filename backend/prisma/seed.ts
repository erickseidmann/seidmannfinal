import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  // Criar usuário admin padrão
  const hashedPassword = await bcrypt.hash('admin123', 10);

  const admin = await prisma.user.upsert({
    where: { email: 'admin@seidmann.com' },
    update: {},
    create: {
      email: 'admin@seidmann.com',
      password: hashedPassword,
      name: 'Administrador',
      role: 'ADMIN',
    },
  });

  console.log('Admin criado:', admin);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
