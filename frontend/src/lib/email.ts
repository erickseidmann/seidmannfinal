/**
 * Envio de e-mails via SMTP (nodemailer).
 * Variáveis de ambiente: SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS
 */

import nodemailer from 'nodemailer'

const DIAS_SEMANA = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado']

function formatarDataHora(d: Date): { diaSemana: string; data: string; horario: string } {
  const diaSemana = DIAS_SEMANA[d.getDay()]
  const data = d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
  const horario = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', hour12: false })
  return { diaSemana, data, horario }
}

function getTransporter() {
  const host = process.env.SMTP_HOST
  const user = process.env.SMTP_USER
  const pass = process.env.SMTP_PASS
  if (!host || !user || !pass) return null
  const port = Number(process.env.SMTP_PORT) || 587
  const allowSelfSigned = process.env.SMTP_INSECURE === 'true' || process.env.NODE_ENV === 'development'
  return nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
    ...(allowSelfSigned && {
      tls: { rejectUnauthorized: false },
    }),
  })
}

export async function sendEmail(options: {
  to: string
  subject: string
  text: string
  html?: string
}): Promise<boolean> {
  const transporter = getTransporter()
  if (!transporter) {
    console.warn('[email] SMTP não configurado (SMTP_HOST, SMTP_USER, SMTP_PASS). E-mail não enviado.')
    return false
  }
  try {
    const from = process.env.SMTP_FROM || process.env.SMTP_USER || 'atendimento@seidmanninstitute.com'
    await transporter.sendMail({
      from: `Seidmann Institute <${from}>`,
      to: options.to,
      subject: options.subject,
      text: options.text,
      html: options.html || options.text.replace(/\n/g, '<br>'),
    })
    return true
  } catch (err) {
    console.error('[email] Erro ao enviar:', err)
    return false
  }
}

/** Mensagem: aula(s) confirmada(s) para o aluno e para o professor */
export function mensagemAulaConfirmada(opcoes: {
  nomeAluno: string
  nomeProfessor: string
  aulas: { startAt: Date }[]
  destinatario: 'aluno' | 'professor'
}): { subject: string; text: string } {
  const { nomeAluno, nomeProfessor, aulas, destinatario } = opcoes
  const linhas = aulas.map((a) => {
    const d = new Date(a.startAt)
    const { diaSemana, data, horario } = formatarDataHora(d)
    return `• ${diaSemana}, ${data}, às ${horario}`
  })
  const lista = linhas.join('\n')
  const subject = 'Aula(s) confirmada(s) – Seidmann Institute'
  const text =
    destinatario === 'aluno'
      ? `Olá, ${nomeAluno}!\n\nSuas aulas foram confirmadas com o(a) professor(a) ${nomeProfessor} nos seguintes dias e horários:\n\n${lista}\n\nQualquer dúvida, entre em contato conosco.\n\nSeidmann Institute`
      : `Olá, ${nomeProfessor}!\n\nAs aulas com o(a) aluno(a) ${nomeAluno} foram confirmadas nos seguintes dias e horários:\n\n${lista}\n\nSeidmann Institute`
  return { subject, text }
}

const RODAPE_CANCELAMENTO = `

📌 Esta é uma mensagem automática. Por favor, não responda este e-mail.

Caso você tenha qualquer dúvida, identifique alguma informação incorreta ou precise de ajuda adicional, entre em contato com a gestão de aulas pelo WhatsApp:
📞 +55 19 97809-4000

Estamos à disposição para ajudar.

Atenciosamente,
Equipe Seidmann Institute`

/** Mensagem: aula cancelada */
export function mensagemAulaCancelada(opcoes: {
  nomeAluno: string
  nomeProfessor: string
  data: Date
  destinatario: 'aluno' | 'professor'
}): { subject: string; text: string } {
  const { data } = opcoes
  const { data: dataStr, horario } = formatarDataHora(new Date(data))
  const horarioCurto = horario.replace(/:00$/, 'h') // 20:00 → 20h
  const subject = 'Aula cancelada – Seidmann Institute'
  const text = `Olá,

Informamos que a aula agendada para o dia ${dataStr}, às ${horarioCurto}, foi CANCELADA.${RODAPE_CANCELAMENTO}`
  return { subject, text }
}

/** Mensagem: várias aulas canceladas (ex.: exclusão em lote) */
export function mensagemAulasCanceladas(opcoes: {
  nomeAluno: string
  nomeProfessor: string
  aulas: { startAt: Date }[]
  destinatario: 'aluno' | 'professor'
}): { subject: string; text: string } {
  const { aulas } = opcoes
  const linhas = aulas.map((a) => {
    const { data, horario } = formatarDataHora(new Date(a.startAt))
    const horarioCurto = horario.replace(/:00$/, 'h')
    return `• ${data}, às ${horarioCurto}`
  })
  const lista = linhas.join('\n')
  const subject = 'Aulas canceladas – Seidmann Institute'
  const text = `Olá,

Informamos que as seguintes aulas foram CANCELADAS:

${lista}${RODAPE_CANCELAMENTO}`
  return { subject, text }
}

/** Mensagem: reposição agendada */
export function mensagemReposicaoAgendada(opcoes: {
  nomeAluno: string
  nomeProfessor: string
  data: Date
  destinatario: 'aluno' | 'professor'
}): { subject: string; text: string } {
  const { nomeAluno, nomeProfessor, data, destinatario } = opcoes
  const { diaSemana, data: dataStr, horario } = formatarDataHora(new Date(data))
  const subject = 'Reposição de aula agendada – Seidmann Institute'
  const text =
    destinatario === 'aluno'
      ? `Olá, ${nomeAluno}!\n\nFoi agendada uma reposição de aula com o(a) professor(a) ${nomeProfessor}:\n\n• ${diaSemana}, ${dataStr}, às ${horario}\n\nQualquer dúvida, entre em contato conosco.\n\nSeidmann Institute`
      : `Olá, ${nomeProfessor}!\n\nFoi agendada uma reposição de aula com o(a) aluno(a) ${nomeAluno}:\n\n• ${diaSemana}, ${dataStr}, às ${horario}\n\nSeidmann Institute`
  return { subject, text }
}
