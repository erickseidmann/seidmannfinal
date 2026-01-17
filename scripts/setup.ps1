# Script de setup inicial do projeto (PowerShell)
# Uso: .\scripts\setup.ps1

Write-Host "🚀 Configurando Seidmann Institute..." -ForegroundColor Cyan

# Instalar dependências
Write-Host "📦 Instalando dependências..." -ForegroundColor Yellow
npm install
Set-Location frontend
npm install
Set-Location ..
Set-Location backend
npm install
Set-Location ..

# Copiar arquivos .env
Write-Host "📝 Configurando variáveis de ambiente..." -ForegroundColor Yellow
if (-not (Test-Path "backend\.env")) {
    Copy-Item "backend\.env.example" "backend\.env"
    Write-Host "✅ backend\.env criado" -ForegroundColor Green
} else {
    Write-Host "⚠️  backend\.env já existe" -ForegroundColor Yellow
}

if (-not (Test-Path "frontend\.env.local")) {
    Copy-Item "frontend\.env.example" "frontend\.env.local"
    Write-Host "✅ frontend\.env.local criado" -ForegroundColor Green
} else {
    Write-Host "⚠️  frontend\.env.local já existe" -ForegroundColor Yellow
}

# Iniciar Docker
Write-Host "🐳 Iniciando PostgreSQL..." -ForegroundColor Yellow
docker-compose up -d

# Aguardar PostgreSQL estar pronto
Write-Host "⏳ Aguardando PostgreSQL..." -ForegroundColor Yellow
Start-Sleep -Seconds 10

# Configurar Prisma
Write-Host "🗄️  Configurando banco de dados..." -ForegroundColor Yellow
Set-Location backend
npm run prisma:generate
npm run prisma:migrate
npm run prisma:seed
Set-Location ..

Write-Host "✅ Setup concluído!" -ForegroundColor Green
Write-Host ""
Write-Host "Para iniciar o desenvolvimento:" -ForegroundColor Cyan
Write-Host "  npm run dev" -ForegroundColor White
