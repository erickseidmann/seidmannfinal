/**
 * Script para limpar Prisma no Windows
 * 
 * Resolve o erro EPERM ao gerar Prisma Client no Windows.
 * Remove o diretório node_modules/.prisma antes de regenerar.
 */

const fs = require('fs')
const path = require('path')

const prismaDir = path.join(__dirname, '..', 'node_modules', '.prisma')

try {
  if (fs.existsSync(prismaDir)) {
    console.log('Limpando diretório .prisma...')
    fs.rmSync(prismaDir, { recursive: true, force: true })
    console.log('✓ Diretório .prisma removido com sucesso')
  } else {
    console.log('✓ Diretório .prisma não existe (nada para limpar)')
  }
} catch (error) {
  console.error('Erro ao limpar diretório .prisma:', error.message)
  console.error('\nSe o erro persistir, tente:')
  console.error('1. Fechar todos os processos Node.js (taskkill /F /IM node.exe)')
  console.error('2. Fechar o VS Code/IDE')
  console.error('3. Executar: Remove-Item -Recurse -Force .\\node_modules\\.prisma')
  process.exit(1)
}

console.log('\nAgora você pode rodar: npx prisma generate')
