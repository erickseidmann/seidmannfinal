# Prisma no Windows - Solução de Problemas

## Erro EPERM ao gerar Prisma Client

**Erro:**
```
EPERM: operation not permitted, rename 
... query_engine-windows.dll.node.tmp -> query_engine-windows.dll.node
```

**Causa:**
Processos Node.js ou o IDE podem estar mantendo o arquivo `.dll.node` aberto, impedindo a renomeação.

**Solução Passo a Passo:**

### Método 1: Script npm (Recomendado)

```powershell
# 1. Parar o servidor de desenvolvimento
# Pressione Ctrl+C no terminal onde está rodando `npm run dev`

# 2. Limpar Prisma usando o script
npm run prisma:clean

# 3. Gerar Prisma Client
npx prisma generate
```

### Método 2: Manual (PowerShell)

```powershell
# 1. Parar processos Node.js
taskkill /F /IM node.exe

# 2. Fechar IDE/VS Code (opcional, mas recomendado)

# 3. Remover diretório .prisma
cd frontend
Remove-Item -Recurse -Force .\node_modules\.prisma -ErrorAction SilentlyContinue

# 4. Gerar Prisma Client
npx prisma generate
```

### Método 3: Reinício completo

Se os métodos acima não funcionarem:

```powershell
# 1. Parar tudo
taskkill /F /IM node.exe
taskkill /F /IM code.exe  # Se usar VS Code

# 2. Remover node_modules/.prisma
Remove-Item -Recurse -Force .\node_modules\.prisma -ErrorAction SilentlyContinue

# 3. Reinstalar dependências (opcional)
npm install

# 4. Gerar Prisma
npx prisma generate
```

## Prevenção

- Sempre pare `npm run dev` antes de rodar `npx prisma generate`
- Use `npm run prisma:clean` antes de regenerar
- Se possível, feche o IDE antes de regenerar

## Versão do Prisma

O projeto usa **Prisma 6.19.2** travado.

NÃO atualize para Prisma 7.x (incompatível com o schema atual).

Para verificar versão:
```bash
npx prisma --version
```

Esperado: `prisma 6.19.2`
