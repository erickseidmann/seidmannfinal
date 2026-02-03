/**
 * Remove as pastas .next e dist (cache/build do Next.js) para corrigir errno -4094 no Windows.
 * Em desenvolvimento o projeto usa dist/; em produção usa .next/.
 * Execute com o servidor parado (Ctrl+C no terminal do npm run dev).
 */

const fs = require('fs')
const path = require('path')

const root = path.join(__dirname, '..')

function removeDir(name) {
  const dir = path.join(root, name)
  if (fs.existsSync(dir)) {
    try {
      fs.rmSync(dir, { recursive: true, maxRetries: 3, retryDelay: 200 })
      console.log(`Pasta ${name} removida com sucesso.`)
      return true
    } catch (err) {
      console.error(`Erro ao remover ${name}:`, err.message)
      console.error('Feche o servidor (Ctrl+C), feche o VS Code/Cursor se estiver indexando a pasta, e tente novamente.')
      return false
    }
  }
  return true
}

const okNext = removeDir('.next')
const okDist = removeDir('dist')
if (okNext && okDist) {
  console.log('Limpeza concluída. Rode "npm run dev" novamente.')
} else {
  process.exit(1)
}
