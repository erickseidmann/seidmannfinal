# Script PowerShell para corrigir Prisma Client no Windows
# Executa os comandos necessários para regenerar o Prisma Client após mudanças no schema

Write-Host "🔄 Corrigindo Prisma Client..." -ForegroundColor Cyan

# 1. Parar processos Node.js
Write-Host "`n1. Parando processos Node.js..." -ForegroundColor Yellow
try {
    taskkill /F /IM node.exe 2>$null
    Write-Host "   ✓ Processos Node.js parados" -ForegroundColor Green
} catch {
    Write-Host "   ⚠ Nenhum processo Node.js encontrado" -ForegroundColor Yellow
}

# 2. Remover node_modules/.prisma
Write-Host "`n2. Removendo node_modules/.prisma..." -ForegroundColor Yellow
$prismaPath = "node_modules\.prisma"
if (Test-Path $prismaPath) {
    Remove-Item -Recurse -Force $prismaPath
    Write-Host "   ✓ Pasta .prisma removida" -ForegroundColor Green
} else {
    Write-Host "   ⚠ Pasta .prisma não encontrada" -ForegroundColor Yellow
}

# 3. Gerar migration (se necessário)
Write-Host "`n3. Gerando migration..." -ForegroundColor Yellow
Write-Host "   Execute manualmente: npx prisma migrate dev --name fix_admin_models" -ForegroundColor Cyan

# 4. Gerar Prisma Client
Write-Host "`n4. Gerando Prisma Client..." -ForegroundColor Yellow
npx prisma generate
if ($LASTEXITCODE -eq 0) {
    Write-Host "   ✓ Prisma Client gerado com sucesso!" -ForegroundColor Green
} else {
    Write-Host "   ✗ Erro ao gerar Prisma Client" -ForegroundColor Red
    exit 1
}

Write-Host "`n✅ Prisma Client corrigido! Agora você pode rodar: npm run dev" -ForegroundColor Green
