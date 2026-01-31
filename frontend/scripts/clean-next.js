/**
 * Remove a pasta .next (cache do Next.js) para corrigir erros UNKNOWN/EPERM no Windows.
 * Execute com o servidor parado (Ctrl+C no terminal do npm run dev).
 */

const fs = require('fs')
const path = require('path')

const dir = path.join(__dirname, '..', '.next')
if (fs.existsSync(dir)) {
  try {
    fs.rmSync(dir, { recursive: true })
    console.log('Pasta .next removida com sucesso.')
  } catch (err) {
    console.error('Erro ao remover .next:', err.message)
    console.error('Feche o servidor (Ctrl+C) e tente novamente.')
    process.exit(1)
  }
} else {
  console.log('Pasta .next não existe.')
}
