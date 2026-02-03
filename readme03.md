# Seidmann Institute – README 03

Documento de referência rápida com visão geral, estrutura, tabelas e caminhos principais do monorepo.

## 1. Visão Geral
- Monorepo com **frontend Next.js + Prisma (MySQL)** e **backend NestJS + Prisma (PostgreSQL)**.
- Repositório pensado para gestão completa de escola de idiomas (alunos, professores, financeiro e comunicação).
- Docker Compose provê MySQL, PostgreSQL e pgAdmin para desenvolvimento local.

## 2. Estrutura de Pastas
```
seidmannfinal/
├── frontend/          # Aplicação Next.js 14 (App Router)
│   ├── src/app/       # Rotas, layouts e páginas (aluno, professor, admin)
│   ├── src/components/ # Componentes reutilizáveis
│   ├── src/lib/       # Autenticação, sessões, utilitários
│   ├── prisma/        # Schema, seeds e 40+ migrações
│   └── scripts/       # Scripts de manutenção (clean, ensure-admin etc.)
├── backend/           # API NestJS modular
│   ├── src/modules/   # auth, users, students, teachers, schedules, payments
│   └── prisma/        # Schema PostgreSQL + seed
├── docs/              # Documentação adicional
├── scripts/           # Setup inicial (PowerShell/Bash)
└── docker-compose.yml # Serviços MySQL, PostgreSQL e pgAdmin
```

## 3. Dependências e Tecnologias
| Área     | Principais tecnologias |
|----------|------------------------|
| Frontend | Next.js 14, TypeScript, Tailwind, shadcn/ui, Prisma 6.19.2 (MySQL), bcryptjs |
| Backend  | NestJS 10, TypeScript, Prisma (PostgreSQL), JWT/Passport |
| DevOps   | Docker Compose, Scripts PowerShell/Bash |

## 4. Scripts Importantes
- Raiz: `npm run dev`, `npm run build`, `npm run lint`.
- Frontend: `npm run dev`, `npm run build`, `npm run start`, `npm run lint`.
- Backend: `npm run start:dev`, `npm run build`, `npm run start:prod`, `npm run prisma:*`.
- Setup Windows: `scripts/setup-db.ps1` (gera schema, migrações e seed do frontend).

## 5. Banco do Frontend (MySQL)
Schema em `frontend/prisma/schema.prisma`. Principais modelos:

| Modelo | Descrição resumida |
|--------|--------------------|
| `User` | Usuários (alunos, professores, admins) com papéis, status e páginas permitidas. |
| `Enrollment` | Leads/matrículas com todos os dados acadêmicos, financeiros e de contato. |
| `PaymentInfo` | Configuração de pagamento (plano, método, valores, lembretes). |
| `EnrollmentPaymentMonth` | Status e NF por matrícula/mês. |
| `Teacher` | Dados completos de professores (pagamentos, idiomas, vínculos). |
| `TeacherAvailabilitySlot` | Horários semanais disponíveis do professor. |
| `TeacherPaymentMonth` | Fechamento mensal por professor (valores, confirmações). |
| `Attendance` | Presença/falta de alunos e professores. |
| `Lesson` | Aulas agendadas (aluno + professor + status). |
| `LessonRecord` | Registro detalhado de cada aula (conteúdo, notas, tarefas). |
| `LessonRecordStudent` | Presença individual em aulas de grupo. |
| `TeacherAlert` / `StudentAlert` | Alertas específicos para professores ou matrículas. |
| `AdminUserPaymentMonth` | Valores aprovados para usuários administrativos. |
| `AdminExpense` | Despesas gerais do administrativo. |
| `AdminNotification` | Notificações internas do painel admin. |
| `Conversation` / `ConversationParticipant` / `ChatMessage` | Chat interno (1:1 e grupos). |
| `BookRelease` | Liberação de livros para alunos. |
| `Announcement` | Comunicados (EMAIL/SMS) com status e público-alvo. |
| `Holiday` | Datas bloqueadas para aulas. |

Enums relevantes: `EnrollmentStatus`, `Language`, `PaymentMethod`, `UserRole`, `UserStatus`, `LessonStatus`, `RecordPresence`, `RecordLessonType`, `RecordHomeworkDone`, além de `AnnouncementChannel`, `AnnouncementStatus`, `AttendanceType` e `AttendanceStatus`.

### Migrações
- Local: `frontend/prisma/migrations/`.
- 42 migrações numeradas (`20260117022451_init` até `20260203144848`), cobrindo evolução completa do schema.

## 6. Banco do Backend (PostgreSQL)
Schema em `backend/prisma/schema.prisma`. Atualmente o modelo principal é `User`, com campos `id`, `email`, `password`, `name`, `role` (enum `UserRole`) e timestamps. O backend funciona como API modular (NestJS) e pode evoluir com novos modelos.

## 7. Módulos e Rotas
### Frontend (Next.js – App Router)
- `src/app/page.tsx` – Landing pública.
- `src/app/matricula` – Formulário de matrícula.
- `src/app/login`, `src/app/cadastro` – Autenticação/registro.
- `src/app/aluno`, `src/app/dashboard-aluno/*` – Área do aluno.
- `src/app/professor`, `src/app/dashboard-professores/*` – Área do professor (financeiro, livros, alterar senha etc.).
- `src/app/admin/*` – Dashboard administrativo (usuários, alertas, alunos, enrollments).
- APIs: `src/app/api/*` (ex.: `/api/users`, `/api/enrollments`, `/api/admin/enrollments` e rotas derivadas).

### Backend (NestJS)
Módulos em `backend/src/modules`:
- `auth` – Autenticação JWT.
- `users`, `students`, `teachers` – gestão básica (controllers + services).
- `schedules` – agendamentos.
- `payments` – camada financeira.
- Cada módulo expõe controllers REST (`/api/...`) e utiliza `PrismaService` configurado em `src/config`.

## 8. Configuração e Variáveis
- **Frontend** (`frontend/.env.example` / `.env.local`): `DATABASE_URL` (MySQL), `NEXT_PUBLIC_SITE_URL`, `SESSION_SECRET`, credenciais do admin e `ADMIN_TOKEN`.
- **Backend** (`backend/.env.example` / `.env`): `DATABASE_URL` (PostgreSQL), `JWT_SECRET`, `JWT_EXPIRES_IN`, `PORT`, `CORS_ORIGIN`.
- **Docker Compose** (`docker-compose.yml`): Serviços `mysql` (db `seidmann_app`), `postgres` (db `seidmann_db`) e `pgadmin`.

## 9. Documentação Existente
- `README.md` (raiz) – Quickstart completo.
- `docs/README.md` – Índice de documentação adicional.
- `frontend/README.md`, `frontend/DESIGN_SYSTEM.md`, `frontend/docs/prisma-windows.md`.
- `backend/README.md`.

## 10. Referências Rápidas
- Prisma Client Frontend: executar dentro de `frontend/` → `npx prisma generate`.
- Seeds Frontend: `npx prisma db seed` usa `prisma/seed.ts`.
- Scripts utilitários (Windows): `frontend/scripts/*.ps1` (limpeza de Prisma/Next, fix cliente).
- Uploads Backend: pasta `backend/uploads/.gitkeep` pronta para storage local.

---

Este README 03 consolida caminhos, tabelas e fluxos principais para auxiliar deploy e onboarding rápido. Ajuste conforme o projeto evoluir.
