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
    const msg =
      '[email] SMTP não configurado (SMTP_HOST, SMTP_USER, SMTP_PASS). E-mail não enviado.'
    if (process.env.NODE_ENV === 'production') {
      console.error(msg)
      throw new Error(
        'Configuração SMTP ausente em produção. Defina SMTP_HOST, SMTP_USER e SMTP_PASS.'
      )
    }
    console.warn(msg)
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

const MESES_NOME: Record<number, string> = {
  1: 'Janeiro', 2: 'Fevereiro', 3: 'Março', 4: 'Abril', 5: 'Maio', 6: 'Junho',
  7: 'Julho', 8: 'Agosto', 9: 'Setembro', 10: 'Outubro', 11: 'Novembro', 12: 'Dezembro',
}

/** Mensagem: professor envia nota fiscal/recibo para financeiro */
export function mensagemNotaFiscalRecibo(opcoes: {
  nomeProfessor: string
  year: number
  month: number
  mensagemOpcional?: string | null
}): { subject: string; text: string } {
  const { nomeProfessor, year, month, mensagemOpcional } = opcoes
  const mesLabel = MESES_NOME[month] ?? String(month)
  const subject = `Nota fiscal / Recibo – ${nomeProfessor} – ${mesLabel}/${year}`
  const linhas: string[] = [
    `O professor(a) ${nomeProfessor} enviou o comprovante (nota fiscal ou recibo) referente ao período: ${mesLabel} de ${year}.`,
    '',
    'Segue em anexo o documento.',
  ]
  if (mensagemOpcional?.trim()) {
    linhas.push('')
    linhas.push('Mensagem do professor:')
    linhas.push(mensagemOpcional.trim())
  }
  linhas.push('')
  linhas.push('📌 Esta é uma mensagem automática do Portal do Professor.')
  const text = linhas.join('\n')
  return { subject, text }
}

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

/** Mensagem: aula cancelada com reposição agendada */
export function mensagemCancelamentoComReposicao(opcoes: {
  nomeAluno: string
  nomeProfessor: string
  nomeProfessorReposicao: string
  dataCancelada: Date
  dataReposicao: Date
  destinatario: 'aluno' | 'professor'
}): { subject: string; text: string } {
  const { nomeAluno, nomeProfessor, nomeProfessorReposicao, dataCancelada, dataReposicao, destinatario } = opcoes
  
  const { data: dataCanceladaStr, horario: horarioCancelado } = formatarDataHora(new Date(dataCancelada))
  const horarioCanceladoCurto = horarioCancelado.replace(/:00$/, 'h')
  
  const { data: dataReposicaoStr, horario: horarioReposicao } = formatarDataHora(new Date(dataReposicao))
  const horarioReposicaoCurto = horarioReposicao.replace(/:00$/, 'h')
  
  const subject = 'Aula cancelada e reposição agendada – Seidmann Institute'
  
  const text = `Olá${destinatario === 'aluno' ? `, ${nomeAluno}` : ''}!

Informamos que a aula originalmente agendada para:

📅 ${dataCanceladaStr}
⏰ ${horarioCanceladoCurto}

foi cancelada com sucesso.

✅ Já realizamos o reagendamento e a reposição ficou confirmada conforme abaixo:

📅 Nova data: ${dataReposicaoStr}
⏰ Novo horário: ${horarioReposicaoCurto}
👨‍🏫 Professor: ${nomeProfessorReposicao}

Pedimos, por gentileza, que ambos verifiquem suas agendas.

Caso exista qualquer divergência ou dúvida, entre em contato com a Gestão de Aulas ou acesse o Portal do ${destinatario === 'aluno' ? 'Aluno' : 'Professor'} para mais detalhes.

📌 Esta é uma mensagem automática. Por favor, não responda este e-mail.

Caso você tenha qualquer dúvida, identifique alguma informação incorreta ou precise de ajuda adicional, entre em contato com a gestão de aulas pelo WhatsApp:
📞 +55 19 97809-4000

Estamos à disposição para ajudar.

Atenciosamente,
Equipe Seidmann Institute`
  
  return { subject, text }
}

/** Dados necessários para montar o comprovante de matrícula (envio ao aluno) */
export interface ComprovanteMatriculaData {
  nome: string
  email: string
  whatsapp: string
  idioma?: string | null
  tipoAula?: string | null
  nomeGrupo?: string | null
  valorMensalidade?: unknown
  frequenciaSemanal?: number | null
  disponibilidade?: string | null
  diaPagamento?: number | null
  nomeVendedor?: string | null
}

function formatCurrency(value: unknown): string {
  if (value == null) return '—'
  const n = typeof value === 'object' && value !== null && 'toString' in value
    ? parseFloat((value as { toString(): string }).toString())
    : Number(value)
  if (Number.isNaN(n)) return '—'
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(n)
}

function formatFrequencia(freq: number | null | undefined): string {
  if (freq == null || freq < 1) return '—'
  return `${freq}x por semana`
}

function formatCurso(idioma: string | null | undefined): string {
  if (!idioma) return '—'
  if (idioma === 'ENGLISH') return 'Inglês'
  if (idioma === 'SPANISH') return 'Espanhol'
  return idioma
}

function formatTipoAula(tipoAula: string | null | undefined, nomeGrupo: string | null | undefined): string {
  if (tipoAula === 'PARTICULAR') return 'Particular'
  if (tipoAula === 'GRUPO') return nomeGrupo?.trim() ? `Grupo / Turma (${nomeGrupo.trim()})` : 'Grupo / Turma'
  return tipoAula?.trim() || '—'
}

/** Monta assunto, texto e HTML do e-mail de comprovante de matrícula */
export function comprovanteMatriculaContent(data: ComprovanteMatriculaData): { subject: string; text: string; html: string } {
  const nome = data.nome?.trim() || 'Aluno(a)'
  const telefone = data.whatsapp?.trim() || '—'
  const vendedor = data.nomeVendedor?.trim() || 'A definir'
  const curso = formatCurso(data.idioma ?? null)
  const tipoAula = formatTipoAula(data.tipoAula ?? null, data.nomeGrupo ?? null)
  const valorCurso = formatCurrency(data.valorMensalidade)
  const frequencia = formatFrequencia(data.frequenciaSemanal ?? null)
  const melhoresHorarios = data.disponibilidade?.trim() || '—'
  const diaPagamento = data.diaPagamento != null && data.diaPagamento >= 1 && data.diaPagamento <= 31
    ? `Dia ${data.diaPagamento}`
    : '—'

  const subject = 'Comprovante de Matrícula – Seidmann Institute'

  const blocosTermos = `
📖 Termos e Condições
💳 Pagamento

O pagamento deve ser realizado até o dia acordado entre o(a) aluno(a) e o(a) vendedor(a).

Caso a data de pagamento caia em final de semana ou feriado, poderá ser realizado no próximo dia útil.

Valores promocionais, combos ou pacotes devem estar especificados separadamente.

Em caso de atraso sem aviso prévio, o(a) aluno(a) poderá perder descontos concedidos, sendo cobrado o valor integral da mensalidade.

Descontos não são mantidos em caso de pausa no curso.

Valores de combos, pacotes promocionais e mensalidades estão sujeitos a reajuste anual.

🔄 Troca de Horário e Reposição

Alterações de horário devem ser solicitadas à equipe de gestão de aulas.

A reposição deve ser realizada dentro do prazo máximo de 1 (um) mês. Após esse período, a aula será considerada perdida.

Aulas não são acumulativas para o mês seguinte.

Exceções podem ser analisadas em casos de afastamentos de longa duração, com aviso prévio mínimo de 30 dias.

❌ Cancelamento do Curso

O cancelamento deve ser solicitado com no mínimo 1 semana de antecedência da data de pagamento.

Caso contrário, será aplicada taxa equivalente a 1 semana de aula.

⏰ Cancelamento de Aulas

Cancelamentos devem ser feitos com no mínimo 6 horas de antecedência.

Caso contrário, a aula será considerada realizada.

Cada aluno tem direito a 1 cancelamento emergencial por mês, com até 30 minutos de antecedência.

Cancelamentos e agendamentos devem ser feitos em dias úteis, de segunda a sexta, das 8h às 19h.

🌴 Férias e Funcionamento

A escola não altera valores em meses com 5 semanas.

Concedemos banco de horas correspondente às seguintes pausas:

• Última semana de julho
• Última semana de dezembro
• Primeira semana de janeiro
(Total aproximado de 3 semanas e 2 dias por ano)

Não funcionamos em feriados nacionais.

Apenas aulas semanais podem ser remanejadas.`

  const text = `Olá, ${nome},

Este e-mail serve como comprovante oficial da sua matrícula no Seidmann Institute.

Agradecemos a sua confiança e ficamos muito felizes em recebê-lo(a) em nossa escola!

📌 Dados da Matrícula

Nome Completo: ${nome}
Telefone: ${telefone}
Vendedor(a): ${vendedor}
Curso: ${curso}
Tipo de Aula: ${tipoAula}
Valor do Curso: ${valorCurso}
Frequência das Aulas: ${frequencia}
Melhores Horários: ${melhoresHorarios}
Dia de Pagamento: ${diaPagamento}
${blocosTermos}

Caso tenha dúvidas ou precise de suporte, entre em contato conosco pelo e-mail:
📩 atendimento@seidmanninstitute.com

Estamos muito felizes em tê-lo(a) conosco e desejamos muito sucesso na sua jornada de aprendizado!

Atenciosamente,
Equipe Seidmann Institute`

  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>Comprovante de Matrícula</title></head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <p>Olá, ${escapeHtml(nome)},</p>
  <p>Este e-mail serve como comprovante oficial da sua matrícula no <strong>Seidmann Institute</strong>.</p>
  <p>Agradecemos a sua confiança e ficamos muito felizes em recebê-lo(a) em nossa escola!</p>
  <p><strong>📌 Dados da Matrícula</strong></p>
  <table style="border-collapse: collapse; margin: 16px 0;">
    <tr><td style="padding: 4px 8px; border-bottom: 1px solid #eee;"><strong>Nome Completo:</strong></td><td style="padding: 4px 8px; border-bottom: 1px solid #eee;">${escapeHtml(nome)}</td></tr>
    <tr><td style="padding: 4px 8px; border-bottom: 1px solid #eee;"><strong>Telefone:</strong></td><td style="padding: 4px 8px; border-bottom: 1px solid #eee;">${escapeHtml(telefone)}</td></tr>
    <tr><td style="padding: 4px 8px; border-bottom: 1px solid #eee;"><strong>Vendedor(a):</strong></td><td style="padding: 4px 8px; border-bottom: 1px solid #eee;">${escapeHtml(vendedor)}</td></tr>
    <tr><td style="padding: 4px 8px; border-bottom: 1px solid #eee;"><strong>Curso:</strong></td><td style="padding: 4px 8px; border-bottom: 1px solid #eee;">${escapeHtml(curso)}</td></tr>
    <tr><td style="padding: 4px 8px; border-bottom: 1px solid #eee;"><strong>Tipo de Aula:</strong></td><td style="padding: 4px 8px; border-bottom: 1px solid #eee;">${escapeHtml(tipoAula)}</td></tr>
    <tr><td style="padding: 4px 8px; border-bottom: 1px solid #eee;"><strong>Valor do Curso:</strong></td><td style="padding: 4px 8px; border-bottom: 1px solid #eee;">${escapeHtml(valorCurso)}</td></tr>
    <tr><td style="padding: 4px 8px; border-bottom: 1px solid #eee;"><strong>Frequência das Aulas:</strong></td><td style="padding: 4px 8px; border-bottom: 1px solid #eee;">${escapeHtml(frequencia)}</td></tr>
    <tr><td style="padding: 4px 8px; border-bottom: 1px solid #eee;"><strong>Melhores Horários:</strong></td><td style="padding: 4px 8px; border-bottom: 1px solid #eee;">${escapeHtml(melhoresHorarios)}</td></tr>
    <tr><td style="padding: 4px 8px; border-bottom: 1px solid #eee;"><strong>Dia de Pagamento:</strong></td><td style="padding: 4px 8px; border-bottom: 1px solid #eee;">${escapeHtml(diaPagamento)}</td></tr>
  </table>
  <p><strong>📖 Termos e Condições</strong></p>
  <p><strong>💳 Pagamento</strong><br>
  O pagamento deve ser realizado até o dia acordado entre o(a) aluno(a) e o(a) vendedor(a). Caso a data de pagamento caia em final de semana ou feriado, poderá ser realizado no próximo dia útil. Valores promocionais, combos ou pacotes devem estar especificados separadamente. Em caso de atraso sem aviso prévio, o(a) aluno(a) poderá perder descontos concedidos, sendo cobrado o valor integral da mensalidade. Descontos não são mantidos em caso de pausa no curso. Valores de combos, pacotes promocionais e mensalidades estão sujeitos a reajuste anual.</p>
  <p><strong>🔄 Troca de Horário e Reposição</strong><br>
  Alterações de horário devem ser solicitadas à equipe de gestão de aulas. A reposição deve ser realizada dentro do prazo máximo de 1 (um) mês. Após esse período, a aula será considerada perdida. Aulas não são acumulativas para o mês seguinte. Exceções podem ser analisadas em casos de afastamentos de longa duração, com aviso prévio mínimo de 30 dias.</p>
  <p><strong>❌ Cancelamento do Curso</strong><br>
  O cancelamento deve ser solicitado com no mínimo 1 semana de antecedência da data de pagamento. Caso contrário, será aplicada taxa equivalente a 1 semana de aula.</p>
  <p><strong>⏰ Cancelamento de Aulas</strong><br>
  Cancelamentos devem ser feitos com no mínimo 6 horas de antecedência. Caso contrário, a aula será considerada realizada. Cada aluno tem direito a 1 cancelamento emergencial por mês, com até 30 minutos de antecedência. Cancelamentos e agendamentos devem ser feitos em dias úteis, de segunda a sexta, das 8h às 19h.</p>
  <p><strong>🌴 Férias e Funcionamento</strong><br>
  A escola não altera valores em meses com 5 semanas. Concedemos banco de horas correspondente às seguintes pausas: última semana de julho, última semana de dezembro, primeira semana de janeiro (total aproximado de 3 semanas e 2 dias por ano). Não funcionamos em feriados nacionais. Apenas aulas semanais podem ser remanejadas.</p>
  <p>Caso tenha dúvidas ou precise de suporte, entre em contato conosco pelo e-mail:<br>
  📩 <a href="mailto:atendimento@seidmanninstitute.com">atendimento@seidmanninstitute.com</a></p>
  <p>Estamos muito felizes em tê-lo(a) conosco e desejamos muito sucesso na sua jornada de aprendizado!</p>
  <p>Atenciosamente,<br><strong>Equipe Seidmann Institute</strong></p>
</body>
</html>`

  return { subject, text, html }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/** Envia e-mail de comprovante de matrícula para o aluno */
export async function sendComprovanteMatricula(data: ComprovanteMatriculaData): Promise<boolean> {
  const { subject, text, html } = comprovanteMatriculaContent(data)
  return sendEmail({
    to: data.email,
    subject,
    text,
    html,
  })
}
