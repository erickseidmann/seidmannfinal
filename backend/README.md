# Backend - Seidmann Institute

Backend API do sistema Seidmann Institute construído com NestJS, TypeScript, PostgreSQL e Prisma.

## 🚀 Tecnologias

- **NestJS** - Framework Node.js progressivo
- **TypeScript** - Tipagem estática
- **PostgreSQL** - Banco de dados relacional
- **Prisma** - ORM moderno
- **JWT** - Autenticação com tokens
- **Passport** - Estratégias de autenticação

## 📁 Estrutura

```
backend/
├── src/
│   ├── modules/          # Módulos da aplicação
│   │   ├── auth/         # Autenticação
│   │   ├── users/        # Usuários
│   │   ├── students/     # Alunos
│   │   ├── teachers/     # Professores
│   │   ├── schedules/    # Agendamentos
│   │   └── payments/     # Pagamentos
│   ├── app.module.ts     # Módulo principal
│   ├── app.controller.ts # Controller principal
│   └── main.ts           # Entry point
├── prisma/
│   ├── schema.prisma     # Schema do banco
│   └── seed.ts           # Seed do banco
└── package.json
```

## 🛠️ Instalação

```bash
# Instalar dependências
npm install

# Copiar variáveis de ambiente
cp .env.example .env

# Editar .env com suas configurações
# Especialmente DATABASE_URL
```

## 📝 Scripts

```bash
# Desenvolvimento
npm run start:dev    # http://localhost:3001

# Build
npm run build

# Produção
npm run start:prod

# Prisma
npm run prisma:generate  # Gera Prisma Client
npm run prisma:migrate   # Executa migrações
npm run prisma:studio    # Abre Prisma Studio
npm run prisma:seed      # Popula banco com dados iniciais

# Linter
npm run lint
```

## 🔗 Endpoints Disponíveis

- `GET /api/health` - Health check
- `POST /api/auth/login` - Login (stub)
- `POST /api/auth/register` - Registro (stub, apenas admin)
- `GET /api/users/me` - Dados do usuário logado (stub)

## 🌐 Variáveis de Ambiente

Crie um arquivo `.env` baseado no `.env.example`:

```env
DATABASE_URL="postgresql://seidmann:seidmann123@localhost:5432/seidmann_db?schema=public"
JWT_SECRET="your-super-secret-jwt-key"
JWT_EXPIRES_IN="7d"
PORT=3001
NODE_ENV=development
CORS_ORIGIN="http://localhost:3000"
```

## 🗄️ Banco de Dados

### Configuração Inicial

1. Certifique-se de que o PostgreSQL está rodando (via Docker Compose)
2. Execute as migrações:

```bash
npm run prisma:generate
npm run prisma:migrate
npm run prisma:seed
```

### Prisma Studio

Para visualizar e editar dados do banco:

```bash
npm run prisma:studio
```

Acesse: http://localhost:5555

## 📦 Próximos Passos

1. Implementar autenticação JWT completa
2. Criar guards e decorators
3. Implementar validação com class-validator
4. Adicionar DTOs para todos os endpoints
5. Implementar lógica de negócio em cada módulo
6. Adicionar testes unitários e e2e
