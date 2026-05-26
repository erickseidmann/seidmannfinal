# Auditoria: `month` / `year` desalinhados em `teacher_payment_months`

> Relatório gerado em 2026-05-26. Somente leitura — nenhum arquivo de código foi alterado.

---

## Contexto do bug (produção)

- **187 registros** com `month`/`year` ≠ mês de competência das aulas.
- **150 × shift +1:** `periodo_termino` em dia 28/30/31 BRT, `month` gravado = mês seguinte.
- **39 × shift −1:** `periodo_termino` em dia 9/14 BRT, `month` gravado = mês anterior.
- **Cluster temporal:** maioria criada em **2026-02-24 01:33–01:34 UTC** (IDs `cmlzx…`).

---

## Fonte de verdade (regra de negócio)

`periodoInicio` / `periodoTermino` seguem `[início, término)` com término **exclusivo**, armazenados como **00:00 UTC** nos limites do ciclo (`teacher-paid-period.ts`).

Exemplo — competência **maio/2026** (mês civil, due day 1 ou fim exclusivo em `2026-06-01T00:00:00Z`):

| Campo | Valor UTC | Equivalente BRT (−03) |
|-------|-----------|------------------------|
| `periodo_inicio` | `2026-05-01 00:00:00` | `2026-04-30 21:00` |
| `periodo_termino` | `2026-06-01 00:00:00` | `2026-05-31 21:00` (exclusivo) |

**Chave correta `year`/`month`:**

> Mês/ano de competência = mês/ano BRT do **último dia inclusivo** = derivar de `periodoTermino` em `America/Sao_Paulo` (instante exclusivo).

- **SQL:** `MONTH(CONVERT_TZ(periodo_termino, '+00:00', '-03:00'))`
- **TypeScript:** `periodoTermino - 1ms` → extrair mês/ano em BRT (`date-fns-tz` `toZonedTime`). **Não** usar `periodoInicio` como chave primária (gera shift −1 em ciclos `dueDay`).

> Ciclos por `dueDay` (10→10, 25→25, etc.) usam a **mesma regra de chave**; mês civil é caso particular (due day 1 / virada de mês).

---

## Tabela principal — upserts auditados

| # | Arquivo | Linhas | Origem do `year` | Origem do `month` | Conversão TZ? | Classificação |
|---|---------|--------|------------------|-------------------|---------------|---------------|
| 1 | `frontend/src/lib/finance/sync-linked-teacher-paid-from-admin.ts` | 55–64 (chave 46–47) | `existingByEnd?.year ?? competenceYear` | `existingByEnd?.month ?? competenceMonth` | Não — busca `periodoTermino` em intervalo **UTC civil** (38–39) | ⚠️ **VEM DO CLIENT** |
| 2 | `frontend/src/app/api/professor/financeiro/confirm/route.ts` | 51–62 (chave 43) | `resolveTeacherPaymentMonthKeyContaining` → `pick.year` do banco | Idem → `pick.month` | Não | ❓ **INDETERMINADO** (propaga chave existente; body JSON **ignorado**) |
| 3 | `frontend/src/app/api/professor/financeiro/enviar-comprovante/route.ts` | 161–174 (chave 127) | `resolveTeacherProofTargetMonthKey` | Idem | Não | ⚠️ **VEM DO CLIENT** (+ resolução parcial) |
| 4 | `frontend/src/app/api/admin/financeiro/professores/[id]/notify-payment/route.ts` | 147–158 (chave 140–141) | FormData `year`; fallback `keyYear` | FormData `month`; fallback `keyMonth` | Não — lookup UTC (129–130) | ⚠️ **VEM DO CLIENT** |
| 5 | `frontend/src/app/api/admin/financeiro/professores/[id]/reject-proof/route.ts` | 62–75 (chave 59–60) | JSON body `year` | JSON body `month` | Não — lookup UTC (51–52) | ⚠️ **VEM DO CLIENT** |
| 6a | `frontend/src/app/api/admin/financeiro/professores/[id]/route.ts` | 165–180 (chave 157–158) | PATCH body `year` (+ `existingByEnd`) | PATCH body `month` (+ `existingByEnd`) | Não — `periodo*` via `teacherPaymentBoundsFromDueDay(bodyYear, bodyMonth, dueDay)` | 🔴 **BUG ESTRUTURAL** (+ ⚠️ client) |
| 6b | `frontend/src/app/api/admin/financeiro/professores/[id]/route.ts` | 206–228 (cascata) | `nextYm.year` = incremento calendário a partir de `keyYear` | `nextYm.month` | Não | 🔴 **BUG ESTRUTURAL** — **suspeito nº 1 do batch** |

### Legenda de classificações

| Tag | Significado |
|-----|-------------|
| ✅ CORRETO | Deriva `year`/`month` de `periodoTermino` em BRT |
| 🔴 BUG A | `getUTCMonth(periodoTermino)` ou efeito equivalente → shift **+1** |
| 🔴 BUG B | Usa `periodoInicio` / mês de início → shift **−1** |
| 🔴 BUG ESTRUTURAL | Calcula `periodoInicio`/`periodoTermino` corretamente mas **não recalcula** a chave a partir de `periodoTermino` BRT |
| ⚠️ VEM DO CLIENT | Chave vem de body/FormData/`selectedAno`/`selectedMes` |
| ❓ INDETERMINADO | Não cria chave nova de forma independente |

**Nenhum dos 7 upserts** usa `date-fns-tz` / `toZonedTime` na gravação da chave.

---

## Callers ⚠️ VEM DO CLIENT

### `sync-linked-teacher-paid-from-admin.ts`

| Caller | Arquivo | O que envia | Risco |
|--------|---------|-------------|-------|
| PATCH pagamento ADM | `administracao/users/[id]/route.ts` ~232–236 | `year`/`month` da grade administração | ⚠️ |
| Notify pagamento ADM | `administracao/users/[id]/notify-payment/route.ts` ~198–202 | Idem | ⚠️ |

### `notify-payment` / `reject-proof` / PATCH `[id]`

| Caller | Arquivo | Payload |
|--------|---------|---------|
| Notificar pagamento | `admin/financeiro/professores/page.tsx` ~496–497 | `selectedAno`, `selectedMes` |
| Rejeitar NF | `professores/page.tsx` ~931 | `selectedAno`, `selectedMes` |
| Status / valores / período | `updatePagamento` ~529–530 | `selectedAno`, `selectedMes` |
| Salvar due day (1 prof) | `savePeriodo` ~602–603 | `selectedAno`, `selectedMes`, `dueDay` |
| **Bulk due day (N profs)** | `saveBulkDueDay` ~679–680 | `selectedAno`, `selectedMes`, `dueDay` — **correlaciona com batch 2026-02-24** |
| Zerar valores em aberto | ~563–564 | `selectedAno`, `selectedMes` |

### `enviar-comprovante`

| Caller | Arquivo | Payload |
|--------|---------|---------|
| Anexar / reenviar NF | `dashboard-professores/.../financeiro/page.tsx` ~300–301, 356–357 | `selectedAno`, `selectedMes` (seletor do professor) |

### `confirm`

| Caller | Envia body? | Efeito |
|--------|-------------|--------|
| `financeiro/page.tsx` ~319 | Sim (`year`/`month`) | **Ignorado** — só usa `resolveTeacherPaymentMonthKeyContaining` |

---

## 1. Suspeito nº 1 — criador do batch inicial

### O que **não** existe

```bash
grep -rn "teacherPaymentMonth\.createMany" frontend/src backend --include="*.ts"
# → sem resultados

grep -rn "createMany.*TeacherPaymentMonth" frontend/src --include="*.ts"
# → sem resultados
```

Não há seeder, cron nem `createMany` para `TeacherPaymentMonth`. Import/criação de professor (`admin/teachers/import`, `cadastro-professor`) só grava `Teacher.paymentDueDay` (padrão **25**), **sem** linhas TPM.

### O que **cria o batch** (13 upserts/professor típico)

**Arquivo:** `frontend/src/app/api/admin/financeiro/professores/[id]/route.ts`

**Gatilho:** PATCH com `dueDay` (ou `periodoInicio`/`periodoTermino`) → dispara cascata quando o período muda.

```typescript
// Upsert principal — chave = body, período = teacherPaymentBoundsFromDueDay(bodyYear, bodyMonth, dueDay)
const keyYear = existingByEnd?.year ?? year   // year do body
const keyMonth = existingByEnd?.month ?? month

await prisma.teacherPaymentMonth.upsert({ /* linha 165 */ create: { year: keyYear, month: keyMonth, periodoInicio, periodoTermino } })

// Cascata: +12 meses
let nextYm = nextYearMonth(keyYear, keyMonth)
for (let i = 0; i < 12; i++) {
  const p = teacherPaymentBoundsFromDueDay(nextYm.year, nextYm.month, cascadeDue)
  await prisma.teacherPaymentMonth.upsert({
    create: {
      year: nextYm.year,      // ← NUNCA derivado de p.termino em BRT
      month: nextYm.month,
      periodoInicio: p.inicio,
      periodoTermino: p.termino,
    },
  })
  nextYm = nextYearMonth(nextYm.year, nextYm.month)
}
```

**Correlação com produção:** `saveBulkDueDay` em `professores/page.tsx` itera professores selecionados e chama PATCH com `dueDay` para cada um → **1 + 12 upserts/professor**. ~14 professores × 13 ≈ **182 registros**, compatível com **187** no cluster `2026-02-24 01:33 UTC`.

**Mecanismo do desalinhamento:** `teacherPaymentBoundsFromDueDay(refYear, refMonth, dueDay)` trata `(refYear, refMonth)` como **mês de referência do pagamento** (vencimento), enquanto a chave deveria ser o **mês BRT de competência** (= mês BRT de `p.termino - 1ms`). Para due day **1** ou términos na virada UTC, `refMonth` fica **+1** em relação à competência → **Bug A**. Para due day **~10–14** com admin/professor escolhendo mês de **início/competência** na UI, `refMonth` fica **−1** → **Bug B**.

---

## 2. Hipótese de causa raiz — Bug A (+1)

### Causa principal (estrutural, não literal `getUTCMonth` no upsert)

| Local | Linhas | Problema |
|-------|--------|----------|
| `[id]/route.ts` cascata | 203–228 | `year`/`month` = `nextYm` calendário; `periodoTermino` correto mas chave não recalculada |
| `[id]/route.ts` upsert principal | 113–116, 171–172 | `dueDay` → bounds OK; chave = body |
| `teacherPaymentBoundsFromDueDay` due day 1 | 57–61 | Ref abril → competência março; chave gravada abril (+1) |
| `sync-linked`, `notify`, `reject`, PATCH lookup | vários | `existingByEnd` filtra `periodoTermino` no **mês civil UTC** do client |

### Usos literais de UTC (secundários — leitura/alerta, não chave upsert)

| Arquivo | Linhas | Uso |
|---------|--------|-----|
| `[id]/route.ts` | 257–260 | Alerta PAGO: `lastInclusive.getUTCMonth()` → mensagem errada |
| `teacher-paid-period.ts` | 121–122 | `resolveTeacherPaymentMonthBoundsUtc`: correção de bounds legados |
| `professores/route.ts` GET | 116–122 | Filtro listagem (ver seção 4) |

---

## 3. Hipótese de causa raiz — Bug B (−1)

| Cenário | Mecanismo |
|---------|-----------|
| UI envia mês de **competência/início** | `selectedMes` = mês em que o período **começa** na grade; `periodoTermino` cai no mês **seguinte** (due ~9–14) |
| `existingByEnd` falha | Filtro UTC do mês do body não acha `periodoTermino` → fallback `keyMonth = month` do body (−1) |
| `resolveTeacherProofTargetMonthKey` fallback | Sem período ativo no banco → grava em `bodyYear`/`bodyMonth` |
| `inferDueDayUtcFromSavedPeriod` | Prioriza `getUTCDate()` de **`periodoInicio`** (75–81) — OK para due day, **não** para chave |

---

## 4. Defesa em profundidade — GET `professores/route.ts`

### Filtro auditado

```typescript
// frontend/src/app/api/admin/financeiro/professores/route.ts ~116-122
const monthBounds = calendarMonthBoundsUtc(year, month)
const firstDaySel = new Date(monthBounds.startMs)
const nextMonthStart = new Date(monthBounds.endExclusiveMs)
const rowsEnding = await prisma.teacherPaymentMonth.findMany({
  where: {
    teacherId: { in: teachers.map((t) => t.id) },
    periodoTermino: { gte: firstDaySel, lt: nextMonthStart },
  },
})
```

### Definição de `calendarMonthBoundsUtc`

```typescript
// frontend/src/lib/teacher-paid-period.ts ~32-35
export function calendarMonthBoundsUtc(year: number, month: number) {
  const s = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0, 0))
  const e = new Date(Date.UTC(year, month, 1, 0, 0, 0, 0))
  return { startMs: s.getTime(), endExclusiveMs: e.getTime() }
}
```

**Confirmado:** bounds em **UTC midnight** `[1º dia 00:00 UTC, 1º do mês seguinte 00:00 UTC)`.

### Terceiro bug (leitura, independente da gravação)

Registro com competência **maio/2026 BRT** tem `periodo_termino = 2026-06-01T00:00:00Z`.

| Filtro | Resultado |
|--------|-----------|
| Busca **maio** (`year=2026, month=5`) | `termino` **fora** — `2026-06-01` ≮ `2026-06-01` |
| Busca **junho** (`month=6`) | `termino` **dentro** — associa TPM de competência maio à coluna **junho** |

Isso explica NFs de maio aparecendo em junho **mesmo antes** de considerar a chave `month` gravada.

O PATCH/reject/notify usam variante equivalente (`rangeStart`/`rangeEnd` UTC, linhas 146–147) — mesmo desvio na **escrita** quando `existingByEnd` resolve a chave.

---

## 5. Helpers auditados

### `teacher-payment-month-resolve.ts`

- **`resolveTeacherPaymentMonthKeyContaining`:** devolve `pick.year`/`pick.month` **do banco**, não calcula de `periodoTermino`. Containment usa `periodoTermino + 24h` (linha 29) — diverge de `[início, término)`.
- **`resolveTeacherProofTargetMonthKey`:** reenvio → body; senão containing; fallback → body.

### `teacher-paid-period.ts` (integral)

- Documenta convenção UTC e `teacherPaymentBoundsFromDueDay`.
- **Não exporta** função para derivar chave `year`/`month` em BRT — lacuna central do bug.

---

## 6. Pontos onde **não** mexer (sem migração prévia)

| Fluxo | Motivo |
|-------|--------|
| **`confirm/route.ts`** | Só seta `teacherConfirmedAt`; body ignorado. Corrigir chaves no banco + resolução BRT basta. |
| **`enviar-comprovante`** quando `resolveTeacherProofTargetMonthKey` acha período ativo | Redireciona upload para TPM do ciclo correto (comentários 113–120). |
| **`existingByEnd` com registro já corrigido** | Reutiliza chave existente — não piora. |
| **`teacherPaymentBoundsFromDueDay` para datas do intervalo** | Convenção `[início, término)` UTC está correta; bug é só a **chave**. |
| **GET listagem** isolado | Corrigir só leitura sem alinhar gravação mantém inconsistência. |

---

## 7. Resultado dos greps complementares

```text
teacherPaymentMonth.upsert/create → 7 pontos (listados acima), todos em frontend/src
teacherPaymentMonth.createMany      → nenhum (repo inteiro)
for (let i = 0; i < 12              → professores/[id]/route.ts:204 (cascata TPM)
resolveTeacherProofTargetMonthKey   → teacher-payment-month-resolve.ts, enviar-comprovante/route.ts
resolveTeacherPaymentMonthKeyContaining → teacher-payment-month-resolve.ts, confirm/route.ts
teacher-paid-period imports         → professores/route.ts, professores/[id]/route.ts, professor/financeiro/route.ts, geral, relatorios, lesson-records, lesson-pending-record
getUTCMonth + teacher/payment       → [id]/route.ts:259-260 (alerta), teacher-paid-period.ts:121-122 (bounds), professor-fin-period.ts (candidatos mês UI)
```

---

## 8. Próximos passos recomendados (fora desta auditoria)

1. **Helper central:** `teacherPaymentMonthKeyFromPeriodoTermino(termino: Date): { year, month }` em BRT (`periodoTermino - 1ms`).
2. **Gravação:** usar helper no `create` de todos os upserts + cascata.
3. **Leitura:** substituir `calendarMonthBoundsUtc` / `existingByEnd` UTC por filtro BRT equivalente ao SQL `CONVERT_TZ`.
4. **Migração SQL:** corrigir 187 registros + validar cluster `cmlzx` / `2026-02-24`.
5. **Alerta PATCH** (257–260): trocar `getUTCMonth` por helper BRT.

---

## Apêndice — prompt de auditoria (versão refinada)

Este documento foi produzido com o prompt abaixo (ajustes vs. versão original):

- Suspeito nº 1 = **cascata `for (i < 12)` + bulk `saveBulkDueDay`**, não `createMany`/cron.
- Classificação **BUG ESTRUTURAL** para upserts que calculam período mas não recalculam chave.
- Regra TS: **`periodoTermino - 1ms` em BRT**; não usar `periodoInicio` como chave.
- Seção obrigatória GET + `calendarMonthBoundsUtc` (terceiro bug de leitura).
- Grep em `frontend/src` **e** `backend/`; incluir `app/api/admin/financeiro/professores`.
