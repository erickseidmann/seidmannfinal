/**
 * Garante que o admin inicial exista antes de subir o dev server.
 * Roda o seed (idempotente). Em caso de falha (ex.: DB indisponível),
 * apenas registra o aviso e segue – não bloqueia npm run dev.
 *
 * Uso: node scripts/ensure-admin.js
 */

const { execSync } = require('child_process')
const path = require('path')

const root = path.resolve(__dirname, '..')

try {
  execSync('npx prisma db seed', { cwd: root, stdio: 'inherit' })
} catch (e) {
  console.warn('[ensure-admin] Seed falhou (não bloqueia dev):', e.message || e)
}

process.exit(0)
