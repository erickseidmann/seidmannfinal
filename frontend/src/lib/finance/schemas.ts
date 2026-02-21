import { z } from 'zod'

/**
 * PATCH /api/admin/financeiro/alunos/[id]
 */
export const updateStudentPaymentSchema = z.object({
  quemPaga: z.string().max(500).nullish(),
  paymentStatus: z.enum(['PAGO', 'ATRASADO', 'PENDING', 'EM_ABERTO']).nullish(),
  metodoPagamento: z.string().max(200).nullish(),
  banco: z.string().max(200).nullish(),
  periodoPagamento: z.enum(['MENSAL', 'ANUAL', 'SEMESTRAL', 'TRIMESTRAL']).nullish(),
  valorMensal: z.preprocess(
    (v) => (v === undefined || v === null || v === '' ? undefined : Number(v)),
    z.number().positive().max(50000).optional()
  ),
  valorHora: z.preprocess(
    (v) => (v === undefined || v === null || v === '' ? undefined : Number(v)),
    z.number().min(0).max(50000).optional()
  ),
  dataUltimoPagamento: z.string().nullish(),
  dataProximoPagamento: z.string().nullish(),
  dueDay: z.number().int().min(1).max(31).optional(),
  // Dados de faturamento para NFSe em nome de empresa
  faturamentoTipo: z.enum(['ALUNO', 'EMPRESA']).nullish(),
  faturamentoRazaoSocial: z.string().max(255).nullish(),
  faturamentoCnpj: z.string().max(18).nullish(),
  faturamentoEmail: z.string().max(255).nullish(),
  faturamentoEndereco: z.string().max(2000).nullish(),
  faturamentoDescricaoNfse: z.string().max(2000).nullish(),
  // notaFiscalEmitida removido: agora é calculado automaticamente da tabela nfse_invoices (read-only)
  year: z.preprocess((v) => (v === undefined || v === null ? undefined : Number(v)), z.number().int().min(2000).max(2100).optional()),
  month: z.preprocess((v) => (v === undefined || v === null ? undefined : Number(v)), z.number().int().min(1).max(12).optional()),
})

export type UpdateStudentPaymentInput = z.infer<typeof updateStudentPaymentSchema>

/**
 * PATCH /api/admin/financeiro/professores/[id]
 * year e month são obrigatórios no endpoint (validados separadamente).
 */
export const updateTeacherPaymentSchema = z.object({
  year: z.preprocess((v) => (v === undefined || v === null ? undefined : Number(v)), z.number().int().min(2000).max(2100)),
  month: z.preprocess((v) => (v === undefined || v === null ? undefined : Number(v)), z.number().int().min(1).max(12)),
  paymentStatus: z.enum(['PAGO', 'ATRASADO', 'PENDING', 'EM_ABERTO']).optional(),
  valorPorPeriodo: z.preprocess(
    (v) => (v === undefined || v === null || v === '' ? undefined : Number(v)),
    z.number().min(0).max(50000).optional()
  ),
  valorExtra: z.preprocess(
    (v) => (v === undefined || v === null || v === '' ? undefined : Number(v)),
    z.number().min(0).max(50000).optional()
  ),
  periodoInicio: z.string().optional(),
  periodoTermino: z.string().optional(),
  metodoPagamento: z.string().max(500).optional(),
  infosPagamento: z.string().max(2000).optional(),
})

export type UpdateTeacherPaymentInput = z.infer<typeof updateTeacherPaymentSchema>

/**
 * POST /api/admin/financeiro/administracao/expenses
 */
export const createExpenseSchema = z.object({
  name: z.string().min(1, 'Nome é obrigatório').max(200),
  description: z.string().max(500).optional(),
  valor: z.preprocess((v) => (v === undefined || v === null ? undefined : Number(v)), z.number().positive('Valor deve ser positivo').max(500000)),
  repeatMonthly: z.boolean().optional(),
  repeatMonths: z.preprocess((v) => (v === undefined || v === null ? undefined : Number(v)), z.number().int().min(1).max(120).optional()),
  startYear: z.preprocess((v) => (v === undefined || v === null ? undefined : Number(v)), z.number().int().min(2020).max(2030).optional()),
  startMonth: z.preprocess((v) => (v === undefined || v === null ? undefined : Number(v)), z.number().int().min(1).max(12).optional()),
})

export type CreateExpenseInput = z.infer<typeof createExpenseSchema>

/**
 * PATCH /api/admin/financeiro/administracao/expenses/[id]
 * Pelo menos um campo deve estar presente.
 */
export const updateExpenseSchema = z.object({
  valor: z.preprocess((v) => (v === undefined || v === null ? undefined : Number(v)), z.number().min(0).max(500000).optional()),
  paymentStatus: z.enum(['PAGO', 'EM_ABERTO']).optional(),
}).refine(
  (data) => data.valor !== undefined || data.paymentStatus !== undefined,
  { message: 'Envie ao menos um campo: valor ou paymentStatus' }
)

export type UpdateExpenseInput = z.infer<typeof updateExpenseSchema>
