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

export interface EmailAttachment {
  filename: string
  content: Buffer
}

export async function sendEmail(options: {
  to: string
  subject: string
  text: string
  html?: string
  attachments?: EmailAttachment[]
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
      ...(options.attachments?.length
        ? {
            attachments: options.attachments.map((a) => ({
              filename: a.filename,
              content: a.content,
            })),
          }
        : {}),
    })
    return true
  } catch (err) {
    console.error('[email] Erro ao enviar:', err)
    return false
  }
}

const RODAPE_CONFIRMACAO = `

📌 Esta é uma mensagem automática. Por favor, não responda este e-mail.

Em caso de dúvidas, por favor entre em contato com a gestão de aulas ou acesse o Portal do Aluno para mais informações.

Estamos à disposição para ajudar.

Atenciosamente,
Equipe Seidmann Institute`

const MENSAGEM_CONFIRMACAO_PROFESSOR = `Olá,

Atenção!
Uma nova aula foi adicionada à sua agenda.
Pedimos que verifique imediatamente sua agenda para confirmar os detalhes da aula.

📌 Esta é uma mensagem automática. Por favor, não responda este e-mail.
Em caso de dúvidas, consulte a gestão de aulas pelos canais oficiais.

Hello,

Attention!
A new class has been added to your schedule.
Please check your agenda immediately to review and confirm the class details.

📌 This is an automated message. Please do not reply to this email.
If you have any questions, please contact the class management team through the official channels.

Hola,

¡Atención!
Se ha agregado una nueva clase a su agenda.
Por favor, revise su agenda de inmediato para verificar y confirmar los detalles de la clase.

📌 Este es un mensaje automático. Por favor, no responda este correo.
En caso de dudas, comuníquese con la gestión de clases a través de los canales oficiales.

Atenciosamente / Kind regards / Saludos cordiales,
Equipe Seidmann Institute`

/** Mensagem: aula(s) confirmada(s) – texto genérico, sem listar dias e horários */
export function mensagemAulaConfirmada(opcoes: {
  nomeAluno: string
  nomeProfessor: string
  aulas: { startAt: Date }[]
  destinatario: 'aluno' | 'professor'
}): { subject: string; text: string } {
  const { nomeAluno, nomeProfessor, destinatario } = opcoes
  const subject = 'Aula(s) confirmada(s) – Seidmann Institute'
  const text =
    destinatario === 'aluno'
      ? `Olá, ${nomeAluno}!

Parabéns! 🎉
Suas aulas estão confirmadas para os dias e horários previamente combinados com a gestão.${RODAPE_CONFIRMACAO}`
      : MENSAGEM_CONFIRMACAO_PROFESSOR
  return { subject, text }
}

const RODAPE_CANCELAMENTO = `

📌 Esta é uma mensagem automática. Por favor, não responda este e-mail.

Caso você tenha qualquer dúvida, identifique alguma informação incorreta ou precise de ajuda adicional, entre em contato com a gestão de aulas pelo WhatsApp:
📞 +55 19 97809-4000

Estamos à disposição para ajudar.

Atenciosamente,
Equipe Seidmann Institute`

const RODAPE_REPOSICAO = `

📌 Esta é uma mensagem automática. Por favor, não responda este e-mail.

Caso você tenha qualquer dúvida, identifique alguma informação incorreta ou precise de apoio adicional, entre em contato com a gestão de aulas pelo WhatsApp:
📞 +55 19 97809-4000

Estamos à disposição para ajudar.

Atenciosamente,
Equipe Seidmann Institute`

const RODAPE_REGISTRO_AULA = `

📌 Esta é uma mensagem automática. Por favor, não responda este e-mail.

Em caso de dúvidas, entre em contato com a gestão de aulas ou acesse o Portal do Aluno.

Atenciosamente,
Equipe Seidmann Institute`

const STATUS_LABEL: Record<string, string> = {
  CONFIRMED: 'Confirmada',
  CANCELLED: 'Cancelada',
  REPOSICAO: 'Reposição',
}
const PRESENCE_LABEL: Record<string, string> = {
  PRESENTE: 'Presente',
  NAO_COMPARECEU: 'Não compareceu',
  ATRASADO: 'Atrasado',
}
const LESSON_TYPE_LABEL: Record<string, string> = {
  NORMAL: 'Normal',
  CONVERSAÇÃO: 'Só conversação',
  REVISAO: 'Revisão',
  AVALIACAO: 'Avaliação',
}
const HOMEWORK_DONE_LABEL: Record<string, string> = {
  SIM: 'Sim',
  NAO: 'Não',
  PARCIAL: 'Parcial',
  NAO_APLICA: 'Não aplica',
}
const CURSO_LABEL: Record<string, string> = {
  INGLES: 'Inglês',
  ESPANHOL: 'Espanhol',
  INGLES_E_ESPANHOL: 'Inglês e Espanhol',
}

/** Mensagem: registro de aula criado – envia para o aluno com as infos da aula registrada */
export function mensagemAulaRegistrada(opcoes: {
  nomeAluno: string
  dataAula: Date
  nomeProfessor: string
  status: string
  presence: string
  lessonType: string
  curso?: string | null
  tempoAulaMinutos?: number | null
  book: string | null
  lastPage: string | null
  assignedHomework: string | null
  homeworkDone: string | null
  notesForStudent: string | null
}): { subject: string; text: string } {
  const { nomeAluno, dataAula, nomeProfessor, status, presence, lessonType, curso, tempoAulaMinutos, book, lastPage, assignedHomework, homeworkDone, notesForStudent } = opcoes
  const { diaSemana, data: dataStr, horario } = formatarDataHora(new Date(dataAula))
  const horarioCurto = horario.replace(/:00$/, 'h')
  const subject = 'Registro de aula – Seidmann Institute'
  const linhas: string[] = [
    `Olá, ${nomeAluno}!`,
    '',
    'O registro da sua aula foi realizado com as seguintes informações:',
    '',
    `📅 Data e horário: ${diaSemana}, ${dataStr}, às ${horarioCurto}`,
    `👤 Professor(a): ${nomeProfessor}`,
    `📋 Status da aula: ${STATUS_LABEL[status] ?? status}`,
    `✓ Sua presença: ${PRESENCE_LABEL[presence] ?? presence}`,
    `📖 Tipo de aula: ${LESSON_TYPE_LABEL[lessonType] ?? lessonType}`,
  ]
  if (curso) linhas.push(`🌐 Curso: ${CURSO_LABEL[curso] ?? curso}`)
  if (tempoAulaMinutos != null) linhas.push(`⏱️ Tempo de aula: ${tempoAulaMinutos} min`)
  if (book?.trim()) linhas.push(`📚 Livro: ${book.trim()}`)
  if (lastPage?.trim()) linhas.push(`📄 Última página trabalhada: ${lastPage.trim()}`)
  if (assignedHomework?.trim()) linhas.push(`📝 Tarefa designada: ${assignedHomework.trim()}`)
  if (homeworkDone) linhas.push(`✓ Última tarefa feita: ${HOMEWORK_DONE_LABEL[homeworkDone] ?? homeworkDone}`)
  if (notesForStudent?.trim()) {
    linhas.push('')
    linhas.push('Observações para você:')
    linhas.push(notesForStudent.trim())
  }
  linhas.push(RODAPE_REGISTRO_AULA)
  const text = linhas.join('\n')
  return { subject, text }
}

const MENSAGEM_CANCELAMENTO_PROFESSOR = `Olá,

Atenção!
Informamos que a aula agendada com o aluno(a) {{NOME_DO_ALUNO}} foi cancelada.

Pedimos que verifique sua agenda para confirmar a atualização.

📌 Esta é uma mensagem automática. Por favor, não responda este e-mail.
Em caso de dúvidas, consulte a gestão de aulas pelos canais oficiais.

Hello,

Attention!
Please note that the scheduled class with the student {{STUDENT_NAME}} has been cancelled.

We recommend that you check your schedule to confirm the update.

📌 This is an automated message. Please do not reply to this email.
If you have any questions, please contact the class management team through the official channels.

Hola,

¡Atención!
Le informamos que la clase programada con el/la estudiante {{NOMBRE_DEL_ESTUDIANTE}} ha sido cancelada.

Le recomendamos revisar su agenda para confirmar la actualización.

📌 Este es un mensaje automático. Por favor, no responda este correo.
En caso de dudas, comuníquese con la gestión de clases a través de los canales oficiales.

Atenciosamente / Kind regards / Saludos cordiales,
Equipe Seidmann Institute`

/** Mensagem: aula cancelada */
export function mensagemAulaCancelada(opcoes: {
  nomeAluno: string
  nomeProfessor: string
  data: Date
  destinatario: 'aluno' | 'professor'
}): { subject: string; text: string } {
  const { nomeAluno, data, destinatario } = opcoes
  const subject = 'Aula cancelada – Seidmann Institute'
  if (destinatario === 'professor') {
    const text = MENSAGEM_CANCELAMENTO_PROFESSOR.replace(/\{\{NOME_DO_ALUNO\}\}/g, nomeAluno)
      .replace(/\{\{STUDENT_NAME\}\}/g, nomeAluno)
      .replace(/\{\{NOMBRE_DEL_ESTUDIANTE\}\}/g, nomeAluno)
    return { subject, text }
  }
  const { data: dataStr, horario } = formatarDataHora(new Date(data))
  const horarioCurto = horario.replace(/:00$/, 'h') // 20:00 → 20h
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

const MENSAGEM_REPOSICAO_PROFESSOR = `Olá,

Atenção!
Uma reposição de aula foi adicionada à sua agenda para o(s) dia(s) {{DATA_REPOSICAO}}, no(s) horário(s) {{HORARIO_REPOSICAO}}, com o(a) aluno(a) {{NOME_DO_ALUNO}}.

Pedimos que verifique sua agenda imediatamente para confirmar os detalhes.

📌 Esta é uma mensagem automática. Por favor, não responda este e-mail.
Em caso de dúvidas, consulte a gestão de aulas pelos canais oficiais.

Hello,

Attention!
A make-up class has been added to your schedule for {{MAKEUP_DATE}}, at {{MAKEUP_TIME}}, with the student {{STUDENT_NAME}}.

Please check your schedule immediately to confirm the details.

📌 This is an automated message. Please do not reply to this email.
If you have any questions, please contact the class management team through the official channels.

Hola,

¡Atención!
Se ha agregado una clase de reposición a su agenda para el/los día(s) {{FECHA_REPOSICION}}, en el/los horario(s) {{HORARIO_REPOSICION}}, con el/la estudiante {{NOMBRE_DEL_ESTUDIANTE}}.

Por favor, revise su agenda de inmediato para confirmar los detalles.

📌 Este es un mensaje automático. Por favor, no responda este correo.
En caso de dudas, comuníquese con la gestión de clases a través de los canales oficiales.

Atenciosamente / Kind regards / Saludos cordiales,
Equipe Seidmann Institute`

/** Mensagem: reposição agendada */
export function mensagemReposicaoAgendada(opcoes: {
  nomeAluno: string
  nomeProfessor: string
  data: Date
  destinatario: 'aluno' | 'professor'
}): { subject: string; text: string } {
  const { nomeAluno, data, destinatario } = opcoes
  const { data: dataStr, horario } = formatarDataHora(new Date(data))
  const horarioCurto = horario.replace(/:00$/, 'h')
  const subject = 'Reposição de aula agendada – Seidmann Institute'
  if (destinatario === 'professor') {
    const text = MENSAGEM_REPOSICAO_PROFESSOR.replace(/\{\{DATA_REPOSICAO\}\}/g, dataStr)
      .replace(/\{\{HORARIO_REPOSICAO\}\}/g, horarioCurto)
      .replace(/\{\{NOME_DO_ALUNO\}\}/g, nomeAluno)
      .replace(/\{\{MAKEUP_DATE\}\}/g, dataStr)
      .replace(/\{\{MAKEUP_TIME\}\}/g, horarioCurto)
      .replace(/\{\{STUDENT_NAME\}\}/g, nomeAluno)
      .replace(/\{\{FECHA_REPOSICION\}\}/g, dataStr)
      .replace(/\{\{HORARIO_REPOSICION\}\}/g, horarioCurto)
      .replace(/\{\{NOMBRE_DEL_ESTUDIANTE\}\}/g, nomeAluno)
    return { subject, text }
  }
  const text = `Olá,

Informamos que a reposição da aula agendada para o dia ${dataStr}, às ${horarioCurto}, foi confirmada com sucesso ✅.${RODAPE_REPOSICAO}`
  return { subject, text }
}
