# Ajustes manuais no banco

## `inactive_by_user_id` ausente (erro nos relatórios / `findMany` em Enrollment)

O Prisma já inclui o campo `inactiveByUserId` no modelo `Enrollment`. Se o MySQL **não tiver** a coluna `inactive_by_user_id`, qualquer query em `enrollment` falha.

1. Rode o SQL em `fix-enrollment-inactive-by-user-id.sql` no banco (Workbench, CLI, etc.).
2. Se o histórico de migrations Prisma estiver inconsistente, alinhe com o time antes de rodar `migrate deploy` à vontade.

### Drift comum (ex.: tabela já existe)

Se `prisma migrate deploy` falhar com *"Table X already exists"*, a migration pode estar pendente no histórico mas o objeto já foi criado à mão. Nesse caso use [`prisma migrate resolve`](https://www.prisma.io/docs/orm/prisma-migrate/workflows/troubleshooting-development) com cuidado, ou marque a migration como aplicada só depois de conferir o schema.
