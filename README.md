# Seidmann Institute - Sistema de Escola de Idiomas

Monorepo completo para gestão de escola de idiomas com funcionalidades para alunos, professores e administradores.

## 🏗️ Estrutura do Projeto

```
seidmann-institute/
├── frontend/          # Next.js App Router + TypeScript
├── backend/           # NestJS + TypeScript + Prisma
├── docs/              # Documentação do projeto
├── scripts/           # Scripts utilitários
└── docker-compose.yml # PostgreSQL + pgAdmin
```

## 🚀 Início Rápido

### Pré-requisitos

- Node.js 18+ e npm/yarn/pnpm
- Docker e Docker Compose (para PostgreSQL)
- Git

### Instalação

1. **Clone o repositório**
   ```bash
   git clone <repository-url>
   cd seidmann-institute
   ```

2. **Instale as dependências**
   ```bash
   npm install
   ```

3. **Configure as variáveis de ambiente**
   ```bash
   # Backend
   cp backend/.env.example backend/.env
   # Edite backend/.env com suas configurações
   
   # Frontend
   cp frontend/.env.example frontend/.env.local
   # Edite frontend/.env.local se necessário
   ```

4. **Inicie o PostgreSQL com Docker**
   ```bash
   docker-compose up -d
   ```

5. **Configure o banco de dados**
   ```bash
   cd backend
   npm run prisma:generate
   npm run prisma:migrate
   ```

6. **Inicie o desenvolvimento**
   ```bash
   # Na raiz do projeto
   npm run dev
   ```

Isso iniciará:
- Frontend: http://localhost:3000
- Backend: http://localhost:3001
- PostgreSQL: localhost:5432
- pgAdmin: http://localhost:5050

## 📝 Scripts Disponíveis

### Na raiz do projeto

- `npm install` - Instala dependências de frontend e backend
- `npm run dev` - Inicia frontend e backend em modo desenvolvimento
- `npm run build` - Build de produção de ambos os projetos
- `npm run lint` - Executa linter em ambos os projetos

### Frontend

```bash
cd frontend
npm run dev          # Desenvolvimento
npm run build        # Build de produção
npm run start        # Inicia servidor de produção
npm run lint         # Linter
```

### Backend

```bash
cd backend
npm run start:dev    # Desenvolvimento com hot reload
npm run build        # Build de produção
npm run start:prod   # Inicia servidor de produção
npm run prisma:generate  # Gera Prisma Client
npm run prisma:migrate    # Executa migrações
npm run prisma:studio     # Abre Prisma Studio
```

## 🛠️ Tecnologias

### Frontend
- **Next.js 14** (App Router)
- **TypeScript**
- **TailwindCSS**
- **shadcn/ui** (componentes acessíveis)

### Backend
- **NestJS**
- **TypeScript**
- **PostgreSQL**
- **Prisma ORM**
- **JWT** (autenticação)

## 📚 Documentação

Consulte a pasta `/docs` para documentação detalhada:
- Arquitetura do sistema
- Guias de desenvolvimento
- API documentation

## 🐳 Docker

O projeto inclui Docker Compose para facilitar o desenvolvimento:

```bash
# Iniciar serviços
docker-compose up -d

# Parar serviços
docker-compose down

# Ver logs
docker-compose logs -f
```

## 📄 Licença

Este projeto é privado e propriedade do Seidmann Institute.
