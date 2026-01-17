#!/bin/bash

# Script de setup inicial do projeto
# Uso: ./scripts/setup.sh

echo "🚀 Configurando Seidmann Institute..."

# Instalar dependências
echo "📦 Instalando dependências..."
npm install
cd frontend && npm install && cd ..
cd backend && npm install && cd ..

# Copiar arquivos .env
echo "📝 Configurando variáveis de ambiente..."
if [ ! -f backend/.env ]; then
  cp backend/.env.example backend/.env
  echo "✅ backend/.env criado"
else
  echo "⚠️  backend/.env já existe"
fi

if [ ! -f frontend/.env.local ]; then
  cp frontend/.env.example frontend/.env.local
  echo "✅ frontend/.env.local criado"
else
  echo "⚠️  frontend/.env.local já existe"
fi

# Iniciar Docker
echo "🐳 Iniciando PostgreSQL..."
docker-compose up -d

# Aguardar PostgreSQL estar pronto
echo "⏳ Aguardando PostgreSQL..."
sleep 5

# Configurar Prisma
echo "🗄️  Configurando banco de dados..."
cd backend
npm run prisma:generate
npm run prisma:migrate
npm run prisma:seed
cd ..

echo "✅ Setup concluído!"
echo ""
echo "Para iniciar o desenvolvimento:"
echo "  npm run dev"
