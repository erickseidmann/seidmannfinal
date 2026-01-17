# Frontend - Seidmann Institute

Frontend do sistema Seidmann Institute construído com Next.js 14 (App Router), TypeScript, TailwindCSS, Prisma e MySQL.

## 🚀 Tecnologias

- **Next.js 14** - Framework React com App Router
- **TypeScript** - Tipagem estática
- **TailwindCSS** - Estilização
- **Prisma** - ORM para MySQL
- **MySQL** - Banco de dados
- **bcryptjs** - Hash de senhas

## 📁 Estrutura

```
frontend/
├── src/
│   ├── app/              # Rotas (App Router)
│   │   ├── layout.tsx
│   │   ├── page.tsx      # Landing page
│   │   ├── matricula/
│   │   ├── login/
│   │   ├── aluno/
│   │   └── professor/
│   ├── components/       # Componentes reutilizáveis
│   ├── lib/              # Helpers e utilitários
│   ├── styles/           # Estilos globais
│   └── assets/           # Imagens, logos
├── public/               # Arquivos estáticos
└── package.json
```

## 🛠️ Instalação e Configuração

### 1. Instalar dependências

```bash
npm install
```

### 2. Configurar MySQL

Certifique-se de ter um servidor MySQL rodando. Você pode usar:
- MySQL local
- Docker (veja `docker-compose.yml` na raiz do projeto)
- Serviço cloud (PlanetScale, AWS RDS, etc.)

### 3. Configurar variáveis de ambiente

Copie o arquivo `.env.example` para `.env.local`:

```bash
cp .env.example .env.local
```

Edite `.env.local` com suas configurações:

```env
# Database
DATABASE_URL="mysql://USER:PASS@HOST:3306/DBNAME"

# Site URL (para metadata)
NEXT_PUBLIC_SITE_URL="http://localhost:3000"

# Sessão (chave secreta para JWT - mínimo 32 caracteres)
SESSION_SECRET="change-me-in-production-min-32-chars-secure-random-string"

# Admin (criado automaticamente via seed)
ADMIN_EMAIL="admin@seidmann.com"
ADMIN_PASSWORD="CHANGE_ME"
ADMIN_NAME="Admin"
```

**Exemplo de DATABASE_URL:**
```env
DATABASE_URL="mysql://root:senha123@localhost:3306/seidmann_db"
```

### 4. Configurar Banco de Dados e Prisma

**⚠️ IMPORTANTE: Versão travada em Prisma 6.19.2**

O projeto usa Prisma 6.19.2. Não atualize para versão 7.x.

**⚠️ IMPORTANTE: Banco de dados deve ser `seidmann_app`**

Certifique-se que o MySQL está rodando e que você tem um database chamado `seidmann_app`.

#### Passo a Passo Completo (PowerShell):

```powershell
# 1. Navegar para o frontend
cd frontend

# 2. Instalar dependências
npm install

# 3. Criar arquivo .env.local (se não existir)
# Edite manualmente o arquivo .env.local e adicione:
# DATABASE_URL="mysql://root:SUA_SENHA@localhost:3306/seidmann_app"
# NEXT_PUBLIC_SITE_URL="http://localhost:3000"
#
# IMPORTANTE: Substitua SUA_SENHA pela senha real do seu MySQL

# 4. Limpar Prisma (Windows - resolver erro EPERM, se necessário)
npm run prisma:clean

# 5. Gerar cliente Prisma
npx prisma generate

# 6. Criar banco de dados e aplicar migrations
# Isso criará todas as tabelas necessárias (users, enrollments, payment_info)
npx prisma migrate dev --name init

# 7. (Opcional) Abrir Prisma Studio para visualizar dados
npx prisma studio

# 8. Rodar aplicação
npm run dev
```

#### Se encontrar erro EPERM no Windows:

```powershell
# 1. Parar o servidor de desenvolvimento (Ctrl+C)
# 2. Fechar processos Node.js travados:
taskkill /F /IM node.exe

# 3. Limpar Prisma (usar script npm):
npm run prisma:clean

# OU manualmente (PowerShell):
Remove-Item -Recurse -Force .\node_modules\.prisma -ErrorAction SilentlyContinue

# 4. Regenerar Prisma Client:
npx prisma generate
```

## 📝 Scripts

```bash
# Desenvolvimento
npm run dev          # http://localhost:3000

# Build de produção
npm run build

# Iniciar servidor de produção
npm run start

# Linter
npm run lint
```

## 🔗 Rotas Disponíveis

### Páginas Públicas
- `/` - Landing page pública
- `/matricula` - Formulário de matrícula (cria Enrollment/lead)
- `/cadastro` - Criar conta (cria User e vincula com Enrollment)
- `/login` - Login simples (sem JWT por enquanto)
- `/contrato` - Formulário completo de contrato (futuro)

### Áreas Protegidas (futuro)
- `/aluno` - Área do aluno
- `/professor` - Área do professor

## 📡 API Routes

### POST `/api/enrollments`
Cria um novo Enrollment (lead).

**Payload:**
```json
{
  "fullName": "João Silva",
  "email": "joao@email.com",
  "whatsapp": "19999999999",
  "language": "ENGLISH",
  "level": "Iniciante",
  "goal": "Trabalho",
  "availability": "Seg/Qua 19h"
}
```

**Resposta (201):**
```json
{
  "id": "...",
  "code": "MAT-ABC12345",
  "fullName": "João Silva",
  "email": "joao@email.com",
  "whatsapp": "19999999999",
  "language": "ENGLISH",
  "level": "Iniciante",
  "goal": "Trabalho",
  "availability": "Seg/Qua 19h",
  "createdAt": "2024-01-01T00:00:00.000Z"
}
```

### PUT `/api/enrollments/[id]`
Atualiza um Enrollment existente.

**Payload (todos os campos opcionais):**
```json
{
  "fullName": "João Silva",
  "status": "REGISTERED",
  ...
}
```

### POST `/api/users`
Cria um novo User e vincula com Enrollment se existir.

**Payload:**
```json
{
  "name": "João Silva",
  "email": "joao@email.com",
  "whatsapp": "19999999999",
  "password": "senha123"
}
```

**Resposta (201):**
```json
{
  "id": "...",
  "name": "João Silva",
  "email": "joao@email.com",
  "whatsapp": "19999999999",
  "createdAt": "2024-01-01T00:00:00.000Z"
}
```

**Erros:**
- `409` - Email já cadastrado
- `400` - Dados inválidos

### POST `/api/auth/login`
Login simples (sem JWT).

**Payload:**
```json
{
  "email": "joao@email.com",
  "password": "senha123"
}
```

**Resposta (200):**
```json
{
  "ok": true,
  "user": {
    "id": "...",
    "name": "João Silva",
    "email": "joao@email.com",
    "whatsapp": "19999999999"
  }
}
```

**Erros:**
- `401` - Email ou senha inválidos

## 🗄️ Estrutura do Banco de Dados

### Model: User
- `id` - String (cuid)
- `name` - String
- `email` - String (unique)
- `whatsapp` - String
- `passwordHash` - String
- `createdAt` - DateTime
- `updatedAt` - DateTime

### Model: Enrollment
- `id` - String (cuid)
- `code` - String (unique, formato: MAT-XXXXXXXX)
- `status` - Enum (LEAD, REGISTERED, COMPLETED)
- `fullName` - String
- `email` - String (indexed)
- `whatsapp` - String (indexed)
- `language` - Enum (ENGLISH, SPANISH)
- `level` - String
- `goal` - String? (opcional)
- `availability` - String? (opcional)
- `userId` - String? (relação com User)
- Campos futuros para contrato/endereço/pagamento
- `createdAt` - DateTime
- `updatedAt` - DateTime

## 🔄 Fluxo de Dados

1. **Matrícula (`/matricula`)**
   - Usuário preenche formulário
   - POST `/api/enrollments` → cria Enrollment com status `LEAD`
   - Abre WhatsApp com código de matrícula

2. **Cadastro (`/cadastro`)**
   - Usuário cria conta
   - POST `/api/users` → cria User
   - Sistema busca Enrollment mais recente com mesmo email/whatsapp
   - Se encontrar, vincula (`userId`) e atualiza status para `REGISTERED`

3. **Login (`/login`)**
   - POST `/api/auth/login` → valida credenciais
   - Retorna dados do usuário (sem passwordHash)

## 🛠️ Comandos Úteis

```bash
# Desenvolvimento
npm run dev

# Prisma - Scripts npm disponíveis
npm run prisma:clean     # Limpar .prisma (Windows)
npm run prisma:generate  # Gerar cliente Prisma
npm run prisma:migrate   # Rodar migrations
npm run prisma:studio    # Abrir Prisma Studio

# Ou usar npx diretamente
npx prisma generate
npx prisma migrate dev --name nome_da_migration
npx prisma migrate deploy  # Produção
npx prisma studio

# Resetar banco (CUIDADO: apaga todos os dados)
npx prisma migrate reset
```

## ⚠️ Troubleshooting

### Erro EPERM no Windows (Prisma Generate)

Se você encontrar `EPERM: operation not permitted` ao gerar Prisma:

1. **Parar tudo:**
   ```powershell
   # Parar npm run dev (Ctrl+C)
   taskkill /F /IM node.exe
   ```

2. **Limpar Prisma:**
   ```powershell
   npm run prisma:clean
   # OU
   Remove-Item -Recurse -Force .\node_modules\.prisma
   ```

3. **Regenerar:**
   ```powershell
   npx prisma generate
   ```

### Erro P1012 no Migrate

Se você encontrar `P1012: datasource url is not supported`:

- **Solução:** O projeto usa Prisma 6.19.2. Certifique-se que está instalado:
  ```bash
  npm install prisma@6.19.2 @prisma/client@6.19.2
  ```

### Erro 500/503 em `/api/matricula`

Se a API retorna 500 ou 503:

1. **Verificar se o banco está configurado:**
   - Arquivo `.env.local` existe?
   - `DATABASE_URL` está correto? (ex: `mysql://root:SENHA@localhost:3306/seidmann_app`)
   - Banco `seidmann_app` existe no MySQL?
   - MySQL está rodando?

2. **Se o erro for P2021 (tabela não existe) - Status 503:**
   - A API retornará mensagem clara no JSON: "Banco de dados não está preparado. Rode: npx prisma migrate dev --name init"
   - Rode: `npx prisma migrate dev --name init`
   - Isso criará as tabelas: `users`, `enrollments`, `payment_info`

3. **Verificar se as migrations rodaram:**
   ```powershell
   # Verificar status das migrations
   npx prisma migrate status
   
   # Se não estiver aplicado, rodar:
   npx prisma migrate dev --name init
   ```

4. **Verificar logs do servidor:**
   - A API retorna mensagem específica no JSON
   - Ver console do servidor para detalhes do erro
   - Logs têm prefixo `[api/matricula]` para facilitar debug

## 🔐 Dashboard Admin

Dashboard para administradores aprovarem pagamentos e gerenciar matrículas.

### Configuração

1. **Definir ADMIN_TOKEN no `.env.local`:**
   ```env
   ADMIN_TOKEN="umtokenseguroaqui123456789"
   ```
   **⚠️ IMPORTANTE:** Use um token seguro em produção. Não commite o `.env.local` com o token real.

2. **Acessar o Dashboard:**
   - Acesse `/admin` no navegador
   - Digite o token configurado em `ADMIN_TOKEN`
   - O token é salvo no `localStorage` do navegador

### Funcionalidades

- **Listar Enrollments:** Visualizar todas as matrículas com filtros por status e busca
- **Filtros:** Por status (LEAD, REGISTERED, CONTRACT_ACCEPTED, PAYMENT_PENDING, ACTIVE, BLOCKED)
- **Busca:** Por nome, email ou whatsapp
- **Ações:**
  - Marcar pagamento como confirmado (PAYMENT_PENDING → ACTIVE)
  - Bloquear acesso (ACTIVE → BLOCKED)
  - Desbloquear acesso (BLOCKED → ACTIVE)
  - Voltar para status anterior (REGISTERED, PAYMENT_PENDING, etc.)

### APIs Admin

- **GET `/api/admin/enrollments?status=PAYMENT_PENDING&search=...`**
  - Requer header: `Authorization: Bearer <ADMIN_TOKEN>`
  - Lista enrollments com filtros

- **PATCH `/api/admin/enrollments/[id]/status`**
  - Requer header: `Authorization: Bearer <ADMIN_TOKEN>`
  - Body: `{ status: "ACTIVE" | "BLOCKED" | ... }`
  - Atualiza status do enrollment

### Segurança

- Por enquanto, autenticação simples via `ADMIN_TOKEN` no `.env.local`
- Todas as rotas `/api/admin/*` requerem o header `Authorization: Bearer <token>`
- Em produção, considere usar NextAuth ou outro sistema de autenticação mais robusto

## 📝 Notas Importantes

- **Senhas**: Nunca são retornadas nas respostas da API
- **Validação**: Email e WhatsApp são validados no backend
- **Código de Matrícula**: Gerado automaticamente e único (MAT-XXXXXXXX)
- **Vínculo User-Enrollment**: Automático por email/whatsapp no cadastro
- **Metadata**: `metadataBase` configurado para evitar warnings do Next.js
- **Admin Token**: Mantenha `ADMIN_TOKEN` seguro e não o commite no repositório
