# Setup do banco MySQL + migrations + admin inicial
# Uso: .\scripts\setup-db.ps1
#
# Pré-requisitos:
# - MySQL rodando (Docker: docker compose up -d mysql OU MySQL local)
# - .env no frontend com DATABASE_URL, ADMIN_EMAIL, ADMIN_PASSWORD

$ErrorActionPreference = "Stop"
$frontend = Join-Path $PSScriptRoot ".." "frontend"

Write-Host "Configurando banco e admin..." -ForegroundColor Cyan

# 1. Garantir .env
$envPath = Join-Path $frontend ".env"
$envExample = Join-Path $frontend ".env.example"
if (-not (Test-Path $envPath)) {
    if (Test-Path $envExample) {
        Copy-Item $envExample $envPath
        Write-Host "Criado .env a partir de .env.example. Ajuste DATABASE_URL se precisar." -ForegroundColor Yellow
    } else {
        Write-Host "Erro: frontend/.env nao existe. Crie com DATABASE_URL, ADMIN_EMAIL, ADMIN_PASSWORD." -ForegroundColor Red
        exit 1
    }
}

Set-Location $frontend

# 2. Prisma generate
Write-Host "Gerando cliente Prisma..." -ForegroundColor Yellow
npx prisma generate
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

# 3. Migrations (cria tabelas a partir de prisma/migrations)
Write-Host "Aplicando migrations..." -ForegroundColor Yellow
npx prisma migrate dev --name setup
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

# 4. Seed (admin inicial)
Write-Host "Criando admin inicial..." -ForegroundColor Yellow
npx prisma db seed
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host ""
Write-Host "Banco configurado. Admin: ADMIN_EMAIL / ADMIN_PASSWORD do .env" -ForegroundColor Green
Write-Host "Troque a senha apos o primeiro login." -ForegroundColor Green
