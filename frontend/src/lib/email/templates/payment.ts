/**
 * Templates HTML responsivos para emails de notificação de pagamento.
 * Cores Seidmann: laranja (#ea580c) / amarelo (#f59e0b).
 */

function escapeHtml(s: string): string {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function formatCurrency(value: number | null | undefined): string {
  if (value == null) return '—'
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value)
}

function formatDate(date: Date | string | null | undefined): string {
  if (!date) return '—'
  const d = typeof date === 'string' ? new Date(date) : date
  return d.toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}

const RODAPE = `
  <p style="margin:24px 0 0;font-size:12px;color:#6b7280;">
    Seidmann Institute · WhatsApp: +55 19 97809-4000<br>
    atendimento@seidmanninstitute.com
  </p>
  <p style="margin:12px 0 0;font-size:11px;color:#9ca3af;">
    Esta é uma mensagem automática. Não responda a este e-mail.
  </p>`

const HEADER = `
  <div style="background:linear-gradient(135deg,#ea580c,#f59e0b);padding:24px;text-align:center;border-radius:8px 8px 0 0;">
    <h1 style="margin:0;color:#fff;font-size:24px;font-weight:700;letter-spacing:-0.5px;">Seidmann Institute</h1>
    <p style="margin:8px 0 0;color:rgba(255,255,255,0.9);font-size:14px;">Cobrança e Pagamento</p>
  </div>`

function baseLayout(content: string): string {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Seidmann Institute</title>
</head>
<body style="margin:0;padding:0;font-family:Arial,sans-serif;line-height:1.6;color:#374151;background:#f9fafb;">
  <div style="max-width:560px;margin:0 auto;padding:20px;">
    <div style="background:#fff;border-radius:8px;box-shadow:0 1px 3px rgba(0,0,0,0.1);overflow:hidden;">
      ${HEADER}
      <div style="padding:32px 24px;">
        ${content}
      </div>
      ${RODAPE}
    </div>
  </div>
</body>
</html>`
}

export interface PaymentEmailEnrollment {
  nome: string
  valorMensal: number | null
  dataVencimento: Date | string | null
  instrucoesPagamento?: string | null
}

/** Lembrete ANTES do vencimento */
export function buildPaymentReminderEmail(
  enrollment: PaymentEmailEnrollment,
  daysUntilDue: number
): { subject: string; text: string; html: string } {
  const subject = `Seidmann Institute - Lembrete de pagamento (vence em ${daysUntilDue} dias)`
  const valorStr = formatCurrency(enrollment.valorMensal)
  const vencimentoStr = formatDate(enrollment.dataVencimento)
  const nome = escapeHtml(enrollment.nome)
  const instrucoes = enrollment.instrucoesPagamento?.trim()
    ? `<p style="margin:16px 0 0;"><strong>Instruções de pagamento:</strong><br>${escapeHtml(enrollment.instrucoesPagamento)}</p>`
    : ''

  const text = `Olá, ${enrollment.nome},

Este é um lembrete amigável: seu pagamento vence em ${daysUntilDue} dias.

Valor: ${valorStr}
Data de vencimento: ${vencimentoStr}
${instrucoes ? '\nInstruções de pagamento: ' + enrollment.instrucoesPagamento : ''}

Em caso de dúvidas, entre em contato conosco.

Atenciosamente,
Equipe Seidmann Institute`

  const content = `
    <p style="margin:0 0 16px;">Olá, <strong>${nome}</strong>,</p>
    <p style="margin:0;">Este é um lembrete amigável: seu pagamento vence em <strong style="color:#ea580c;">${daysUntilDue} dias</strong>.</p>
    <div style="margin:24px 0;padding:20px;background:#fef3c7;border-radius:8px;border-left:4px solid #f59e0b;">
      <p style="margin:0 0 8px;"><strong>Valor:</strong> <span style="font-size:18px;color:#92400e;">${escapeHtml(valorStr)}</span></p>
      <p style="margin:0;"><strong>Data de vencimento:</strong> ${escapeHtml(vencimentoStr)}</p>
    </div>
    ${instrucoes}
    <p style="margin:20px 0 0;">Em caso de dúvidas, entre em contato conosco.</p>`

  return { subject, text, html: baseLayout(content) }
}

/** Lembrete DEPOIS do vencimento (em atraso) */
export function buildPaymentOverdueReminderEmail(
  enrollment: PaymentEmailEnrollment,
  daysOverdue: number
): { subject: string; text: string; html: string } {
  const subject = `Seidmann Institute - Pagamento em atraso (${daysOverdue} ${daysOverdue === 1 ? 'dia' : 'dias'})`
  const valorStr = formatCurrency(enrollment.valorMensal)
  const vencimentoStr = formatDate(enrollment.dataVencimento)
  const nome = escapeHtml(enrollment.nome)

  const text = `Olá, ${enrollment.nome},

Identificamos que seu pagamento está em atraso há ${daysOverdue} ${daysOverdue === 1 ? 'dia' : 'dias'}.

Valor: ${valorStr}
Data de vencimento: ${vencimentoStr}

⚠️ Importante: Após 30 dias (1 mês) de atraso, a matrícula será suspensa automaticamente.

Por favor, regularize sua situação o quanto antes. Em caso de dúvidas ou dificuldades, entre em contato conosco.

Atenciosamente,
Equipe Seidmann Institute`

  const content = `
    <p style="margin:0 0 16px;">Olá, <strong>${nome}</strong>,</p>
    <p style="margin:0;">Identificamos que seu pagamento está em atraso há <strong style="color:#dc2626;">${daysOverdue} ${daysOverdue === 1 ? 'dia' : 'dias'}</strong>.</p>
    <div style="margin:24px 0;padding:20px;background:#fef2f2;border-radius:8px;border-left:4px solid #dc2626;">
      <p style="margin:0 0 8px;"><strong>Valor:</strong> <span style="font-size:18px;color:#dc2626;">${escapeHtml(valorStr)}</span></p>
      <p style="margin:0;"><strong>Data de vencimento:</strong> <span style="color:#dc2626;">${escapeHtml(vencimentoStr)}</span></p>
    </div>
    <p style="margin:16px 0;padding:12px;background:#fef2f2;border-radius:6px;font-size:14px;color:#991b1b;">
      ⚠️ Após 30 dias (1 mês) de atraso, a matrícula será suspensa automaticamente.
    </p>
    <p style="margin:0;">Por favor, regularize sua situação o quanto antes. Em caso de dúvidas ou dificuldades, entre em contato conosco.</p>`

  return { subject, text, html: baseLayout(content) }
}

/** Dados opcionais da NF para incluir na confirmação de pagamento */
export interface NfInfoConfirmation {
  /** Número da nota (ex.: "12345") */
  numero?: string
  /** URL do PDF da NF (se disponível) */
  pdfUrl?: string
  /** true = NF foi gerada e está disponível no painel / em anexo */
  disponivel?: boolean
}

/** Confirmação de pagamento com mensagem bonita e informação da NF */
export function buildPaymentConfirmationEmail(
  enrollment: { nome: string },
  amount: number,
  paymentDate: Date | string,
  nfseSerahEnviada?: boolean,
  nfInfo?: NfInfoConfirmation
): { subject: string; text: string; html: string } {
  const subject = 'Seidmann Institute - Pagamento confirmado ✓'
  const valorStr = formatCurrency(amount)
  const dataStr = formatDate(paymentDate)
  const nome = escapeHtml(enrollment.nome)

  let nfseTexto = ''
  let nfseHtml = ''
  if (nfInfo?.disponivel && nfInfo?.numero) {
    nfseTexto = `\n\nSua Nota Fiscal nº ${nfInfo.numero} foi gerada e está disponível no seu painel do aluno (área Financeiro). Você também pode acessá-la pelo link que enviamos anteriormente.`
    nfseHtml = `
    <div style="margin:20px 0;padding:20px;background:#eff6ff;border-radius:8px;border-left:4px solid #2563eb;">
      <p style="margin:0 0 8px;font-size:15px;color:#1e40af;"><strong>📄 Nota Fiscal</strong></p>
      <p style="margin:0;">Sua Nota Fiscal nº <strong>${escapeHtml(nfInfo.numero)}</strong> foi gerada com sucesso e está disponível no seu <strong>painel do aluno</strong> (área Financeiro). Guarde-a para seus registros.</p>
      ${nfInfo.pdfUrl ? `<p style="margin:12px 0 0;"><a href="${escapeHtml(nfInfo.pdfUrl)}" style="color:#2563eb;text-decoration:underline;">Abrir PDF da Nota Fiscal</a></p>` : ''}
    </div>`
  } else if (nfseSerahEnviada) {
    nfseTexto = '\n\nSua Nota Fiscal está sendo gerada e em breve estará disponível no seu painel do aluno (área Financeiro). Você receberá um aviso quando estiver pronta.'
    nfseHtml = `
    <p style="margin:16px 0;padding:16px;background:#fefce8;border-radius:8px;border-left:4px solid #eab308;">
      <strong>📄 Nota Fiscal:</strong> Sua nota está sendo gerada e em breve estará disponível no seu <strong>painel do aluno</strong> (área Financeiro). Você receberá um aviso quando estiver pronta.
    </p>`
  }

  const text = `Olá, ${enrollment.nome},

Recebemos e confirmamos seu pagamento com sucesso! 🎉

Valor: ${valorStr}
Data do pagamento: ${dataStr}
${nfseTexto}

Agradecemos sua confiança e por manter sua matrícula em dia. Qualquer dúvida, estamos à disposição.

Com carinho,
Equipe Seidmann Institute`

  const content = `
    <p style="margin:0 0 16px;">Olá, <strong>${nome}</strong>,</p>
    <p style="margin:0 0 20px;font-size:18px;color:#059669;"><strong>✓ Pagamento confirmado com sucesso!</strong></p>
    <p style="margin:0 0 16px;">Recebemos e confirmamos seu pagamento. Obrigado por manter tudo em dia!</p>
    <div style="margin:24px 0;padding:20px;background:linear-gradient(135deg,#ecfdf5,#d1fae5);border-radius:8px;border-left:4px solid #059669;">
      <p style="margin:0 0 8px;"><strong>Valor:</strong> <span style="font-size:18px;color:#047857;">${escapeHtml(valorStr)}</span></p>
      <p style="margin:0;"><strong>Data do pagamento:</strong> ${escapeHtml(dataStr)}</p>
    </div>
    ${nfseHtml}
    <p style="margin:24px 0 0;">Agradecemos sua confiança. Qualquer dúvida, estamos à disposição.</p>
    <p style="margin:12px 0 0;color:#6b7280;">Com carinho,<br><strong>Equipe Seidmann Institute</strong></p>`

  return { subject, text, html: baseLayout(content) }
}

/** Matrícula suspensa por inadimplência */
export function buildEnrollmentDeactivatedEmail(enrollment: { nome: string }): {
  subject: string
  text: string
  html: string
} {
  const subject = 'Seidmann Institute - Matrícula suspensa por inadimplência'
  const nome = escapeHtml(enrollment.nome)

  const text = `Olá, ${enrollment.nome},

Infelizmente, sua matrícula foi suspensa automaticamente devido ao não pagamento dentro do prazo estipulado (após 30 dias / 1 mês de atraso).

Para regularizar sua situação e reativar sua matrícula, entre em contato conosco o quanto antes:

📞 WhatsApp: +55 19 97809-4000
📩 E-mail: atendimento@seidmanninstitute.com

Estamos à disposição para ajudá-lo(a) a regularizar sua situação.

Atenciosamente,
Equipe Seidmann Institute`

  const content = `
    <p style="margin:0 0 16px;">Olá, <strong>${nome}</strong>,</p>
    <p style="margin:0;">Infelizmente, sua matrícula foi suspensa automaticamente devido ao não pagamento dentro do prazo estipulado (após 30 dias / 1 mês de atraso).</p>
    <div style="margin:24px 0;padding:20px;background:#fef3c7;border-radius:8px;border-left:4px solid #f59e0b;">
      <p style="margin:0;"><strong>Para regularizar sua situação e reativar sua matrícula</strong>, entre em contato conosco o quanto antes:</p>
      <p style="margin:12px 0 0;">📞 WhatsApp: +55 19 97809-4000<br>📩 E-mail: atendimento@seidmanninstitute.com</p>
    </div>
    <p style="margin:0;">Estamos à disposição para ajudá-lo(a) a regularizar sua situação.</p>`

  return { subject, text, html: baseLayout(content) }
}
