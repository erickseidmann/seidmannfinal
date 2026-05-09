/**
 * Contrato de Prestação de Serviços Educacionais — Professor Online (Seidmann Institute 2026).
 *
 * Mantemos o texto integral aqui em uma única fonte da verdade para:
 *  - exibir no formulário público de cadastro de professores;
 *  - incluir no e-mail de confirmação de cadastro (corpo + anexo PDF);
 *  - eventualmente usar em telas administrativas (visualizar contrato aceito).
 *
 * O PDF original está em `public/contratos/contrato-prestacao-servicos-seidmann-2026.pdf`.
 */

export const CONTRATO_PDF_PATH = 'contratos/contrato-prestacao-servicos-seidmann-2026.pdf'
export const CONTRATO_PDF_FILENAME = 'Contrato-Prestacao-Servicos-Seidmann-2026.pdf'

export interface ClausulaContrato {
  titulo: string
  itens: string[]
}

/** Texto estruturado do contrato (cláusulas). */
export const CONTRATO_PROFESSOR_CLAUSULAS: ClausulaContrato[] = [
  {
    titulo: 'CLÁUSULA 1 – DO OBJETO',
    itens: [
      '1.1. O presente contrato tem por objeto a prestação de serviços educacionais online, consistentes na realização de aulas, correção de atividades e acompanhamento pedagógico de alunos indicados pela CONTRATANTE.',
      '1.2. A CONTRATANTE atua como plataforma organizacional e intermediadora administrativa entre alunos e professores.',
    ],
  },
  {
    titulo: 'CLÁUSULA 2 – DA NATUREZA JURÍDICA',
    itens: [
      '2.1. O(A) PRESTADOR(A) declara atuar como profissional autônomo(a), assumindo integral responsabilidade por sua atividade.',
      '2.2. O presente contrato não estabelece vínculo empregatício, societário, previdenciário, associativo ou de exclusividade.',
      '2.3. Não há controle de jornada, exigência de carga horária mínima, obrigação de continuidade ou subordinação jurídica.',
      '2.4. A eventual regularidade na prestação dos serviços não caracteriza vínculo empregatício.',
      '2.5. O(A) PRESTADOR(A) poderá prestar serviços a terceiros, inclusive concorrentes da CONTRATANTE.',
      '2.6. O(A) PRESTADOR(A) possui liberdade para aceitar ou recusar alunos e horários indicados, sem aplicação de penalidades.',
    ],
  },
  {
    titulo: 'CLÁUSULA 3 – DA DISPONIBILIDADE',
    itens: [
      '3.1. O(A) PRESTADOR(A) informará sua disponibilidade de horários para fins de organização da agenda.',
      '3.2. A disponibilidade poderá ser alterada a qualquer tempo, mediante comunicação prévia razoável.',
      '3.3. Alterações de disponibilidade poderão impactar a quantidade de aulas, não gerando direito a indenização ou compensação financeira.',
    ],
  },
  {
    titulo: 'CLÁUSULA 4 – DO PAGAMENTO',
    itens: [
      '4.1. O pagamento será realizado exclusivamente por hora/aula efetivamente prestada e registrada no sistema oficial da CONTRATANTE.',
      '4.2. O sistema constitui ferramenta administrativa de validação contratual das aulas ministradas.',
      '4.3. Não há garantia de remuneração mínima mensal.',
      '4.4. O pagamento será efetuado mensalmente até o dia 25 de cada mês.',
      '4.5. Caso o dia 25 recaia em sábado, domingo ou feriado bancário, o pagamento será realizado no primeiro dia útil subsequente, sem acréscimos.',
    ],
  },
  {
    titulo: 'CLÁUSULA 5 – DA CONDIÇÃO PARA LIBERAÇÃO DO PAGAMENTO',
    itens: [
      '5.1. O pagamento está condicionado:',
      'I – Ao registro das aulas no sistema até o fechamento do período de apuração;',
      'II – Ao envio da respectiva nota fiscal ou recibo dentro do prazo definido pela gestão financeira.',
      '5.2. A ausência dessas informações até a data de fechamento inviabiliza a validação do serviço no período correspondente, ficando o pagamento automaticamente postergado para o próximo ciclo.',
      '5.3. Tal procedimento possui natureza administrativa, não constituindo penalidade ou sanção.',
    ],
  },
  {
    titulo: 'CLÁUSULA 6 – DOS CANCELAMENTOS',
    itens: [
      '6.1. O serviço somente será remunerado quando efetivamente prestado.',
      '6.2. Caso o(a) PRESTADOR(A) cancele aula e não haja reposição, não haverá pagamento por tratar-se de serviço não executado.',
      '6.3. Recomenda-se que cancelamentos sejam comunicados com antecedência razoável para fins organizacionais.',
    ],
  },
  {
    titulo: 'CLÁUSULA 7 – PROCEDIMENTOS OPERACIONAIS',
    itens: [
      '7.1. A CONTRATANTE poderá sugerir orientações administrativas com finalidade organizacional.',
      '7.2. Tais orientações não caracterizam poder disciplinar ou subordinação jurídica.',
      '7.3. A comunicação administrativa com alunos poderá ser centralizada pela CONTRATANTE para fins de organização.',
    ],
  },
  {
    titulo: 'CLÁUSULA 8 – RESPONSABILIDADES DO(A) PRESTADOR(A)',
    itens: [
      '8.1. Ministrar as aulas contratadas.',
      '8.2. Registrar corretamente as aulas no sistema.',
      '8.3. Acompanhar o desenvolvimento pedagógico dos alunos.',
      '8.4. Manter postura profissional.',
    ],
  },
  {
    titulo: 'CLÁUSULA 9 – DA EMISSÃO DE DOCUMENTOS FISCAIS',
    itens: [
      '9.1. O(A) PRESTADOR(A) é integralmente responsável pelos tributos decorrentes de sua atividade.',
      '9.2. A documentação fiscal deverá ser enviada previamente à data de pagamento.',
    ],
  },
  {
    titulo: 'CLÁUSULA 10 – DA TROCA DE PROFESSOR',
    itens: [
      '10.1. Os alunos poderão solicitar troca de professor a qualquer momento.',
      '10.2. A CONTRATANTE poderá remanejar alunos conforme necessidade organizacional.',
      '10.3. Isso não caracteriza punição ou vínculo empregatício.',
    ],
  },
  {
    titulo: 'CLÁUSULA 11 – DA RESCISÃO',
    itens: [
      '11.1. O contrato poderá ser rescindido por qualquer das partes mediante comunicação simples.',
      '11.2. A rescisão não gera aviso prévio, multa ou indenização, salvo serviços já prestados.',
    ],
  },
  {
    titulo: 'CLÁUSULA 12 – DO VALOR DA HORA/AULA',
    itens: [
      '12.1. O valor da hora/aula será de R$ 18,00 podendo ser ajustado mediante comum acordo entre as partes.',
    ],
  },
  {
    titulo: 'CLÁUSULA 13 – DO FORO',
    itens: ['Fica eleito o foro da Comarca de Campinas – SP.'],
  },
]

export const CONTRATO_TITULO = 'CONTRATO DE PRESTAÇÃO DE SERVIÇOS EDUCACIONAIS – PROFESSOR ONLINE'
export const CONTRATO_CONTRATANTE_TEXTO =
  'SEIDMANN INSTITUTE, pessoa jurídica de direito privado, inscrita no CNPJ nº 32.707.269/0001-07.'

export interface DadosPrestador {
  nome: string
  /** CPF ou CNPJ (apenas dígitos ou formatado). */
  documento: string
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function formatDataExtenso(d: Date): string {
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

/**
 * Versão em texto plano (usada em e-mail e como fallback).
 */
export function gerarContratoTexto(prestador: DadosPrestador, dataAceite: Date = new Date()): string {
  const linhas: string[] = []
  linhas.push(CONTRATO_TITULO)
  linhas.push('')
  linhas.push('CONTRATANTE:')
  linhas.push(CONTRATO_CONTRATANTE_TEXTO)
  linhas.push('')
  linhas.push('PRESTADOR(A) DE SERVIÇOS:')
  linhas.push(`${prestador.nome}, CPF/CNPJ nº ${prestador.documento}.`)
  linhas.push('')
  linhas.push('As partes celebram o presente contrato, que será regido pelas cláusulas e condições abaixo:')
  linhas.push('')
  for (const c of CONTRATO_PROFESSOR_CLAUSULAS) {
    linhas.push(c.titulo)
    for (const i of c.itens) linhas.push(i)
    linhas.push('')
  }
  linhas.push(`Local e Data: Campinas – SP, ${formatDataExtenso(dataAceite)}`)
  linhas.push('')
  linhas.push('CONTRATANTE:')
  linhas.push('Seidmann Institute')
  linhas.push('')
  linhas.push('PRESTADOR(A):')
  linhas.push(`${prestador.nome} — Documento: ${prestador.documento}`)
  linhas.push(`Aceito eletronicamente em ${dataAceite.toISOString()}.`)
  return linhas.join('\n')
}

/**
 * Versão HTML estilizada do contrato — usada no e-mail de confirmação.
 */
export function gerarContratoHtml(prestador: DadosPrestador, dataAceite: Date = new Date()): string {
  const clausulasHtml = CONTRATO_PROFESSOR_CLAUSULAS.map(
    (c) => `
      <h3 style="margin:18px 0 6px 0;font-size:14px;color:#0f172a;">${escapeHtml(c.titulo)}</h3>
      ${c.itens.map((i) => `<p style="margin:4px 0;font-size:13px;line-height:1.5;color:#334155;">${escapeHtml(i)}</p>`).join('')}
    `
  ).join('')

  return `
    <div style="font-family:Inter,Arial,sans-serif;color:#0f172a;max-width:720px;margin:0 auto;">
      <h2 style="text-align:center;font-size:18px;margin:0 0 12px 0;">${escapeHtml(CONTRATO_TITULO)}</h2>

      <p style="font-size:13px;margin:8px 0;"><strong>CONTRATANTE:</strong><br>${escapeHtml(CONTRATO_CONTRATANTE_TEXTO)}</p>
      <p style="font-size:13px;margin:8px 0;"><strong>PRESTADOR(A) DE SERVIÇOS:</strong><br>${escapeHtml(prestador.nome)}, CPF/CNPJ nº ${escapeHtml(prestador.documento)}.</p>

      <p style="font-size:13px;margin:8px 0;">As partes celebram o presente contrato, que será regido pelas cláusulas e condições abaixo:</p>

      ${clausulasHtml}

      <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0;">
      <p style="font-size:13px;margin:6px 0;"><strong>Local e Data:</strong> Campinas – SP, ${escapeHtml(formatDataExtenso(dataAceite))}</p>
      <p style="font-size:13px;margin:6px 0;"><strong>CONTRATANTE:</strong> Seidmann Institute</p>
      <p style="font-size:13px;margin:6px 0;"><strong>PRESTADOR(A):</strong> ${escapeHtml(prestador.nome)} — Documento: ${escapeHtml(prestador.documento)}</p>
      <p style="font-size:12px;color:#64748b;margin:12px 0 0 0;">Aceito eletronicamente pelo PRESTADOR em ${escapeHtml(dataAceite.toISOString())} via formulário público de cadastro de professor.</p>
    </div>
  `
}

/**
 * E-mail de confirmação de cadastro de professor (HTML + texto).
 */
export function gerarEmailCadastroProfessor(prestador: DadosPrestador, dataAceite: Date = new Date()): {
  subject: string
  html: string
  text: string
} {
  const subject = 'Recebemos seu cadastro - Seidmann Institute (cópia do contrato)'

  const intro = `Olá, ${prestador.nome}!\n\nRecebemos seu cadastro como professor(a) na Seidmann Institute. Em breve nossa equipe pedagógica entrará em contato pelo WhatsApp ou e-mail para validar suas informações e liberar seu acesso à plataforma.\n\nConforme o aceite eletrônico realizado no momento do cadastro, segue abaixo (e em anexo, em PDF) uma cópia integral do CONTRATO DE PRESTAÇÃO DE SERVIÇOS EDUCACIONAIS firmado entre você e a Seidmann Institute.\n\nIMPORTANTE: além desta cópia eletrônica, você receberá posteriormente uma versão deste mesmo contrato para ASSINATURA FORMAL — pode ser por uma plataforma de assinatura digital ou em via física. Fique atento(a) ao e-mail e ao WhatsApp informados para receber as instruções.\n\nGuarde este e-mail para sua referência.`

  const text =
    `${intro}\n\n` +
    `==============================\n` +
    `${gerarContratoTexto(prestador, dataAceite)}\n` +
    `==============================\n\n` +
    `Atenciosamente,\nEquipe Seidmann Institute\n` +
    `\nEsta é uma mensagem automática. Por favor, não responda este e-mail.`

  const html = `
    <div style="font-family:Inter,Arial,sans-serif;color:#0f172a;max-width:720px;margin:0 auto;padding:24px;background:#f8fafc;">
      <div style="background:#fff;border-radius:12px;padding:24px;border:1px solid #e2e8f0;">
        <h1 style="margin:0 0 12px 0;font-size:20px;color:#0f172a;">Recebemos seu cadastro!</h1>
        <p style="font-size:14px;line-height:1.6;color:#334155;">Olá, <strong>${escapeHtml(prestador.nome)}</strong>!</p>
        <p style="font-size:14px;line-height:1.6;color:#334155;">Recebemos seu cadastro como professor(a) na Seidmann Institute. Em breve nossa equipe pedagógica entrará em contato pelo WhatsApp ou e-mail para validar suas informações e liberar seu acesso à plataforma.</p>
        <p style="font-size:14px;line-height:1.6;color:#334155;">Conforme o aceite eletrônico realizado no momento do cadastro, segue abaixo (e em anexo, em PDF) uma cópia integral do <strong>Contrato de Prestação de Serviços Educacionais</strong> firmado entre você e a Seidmann Institute.</p>

        <div style="margin:16px 0;padding:14px 16px;border-left:4px solid #f97316;background:#fff7ed;border-radius:8px;">
          <p style="margin:0;font-size:14px;line-height:1.6;color:#9a3412;">
            <strong>Importante:</strong> além desta cópia eletrônica, você receberá <strong>posteriormente</strong> uma via deste mesmo contrato para <strong>assinatura formal</strong> — pode ser por meio de uma plataforma de assinatura digital ou em via física. Fique atento(a) ao seu e-mail e WhatsApp para receber as instruções.
          </p>
        </div>

        <p style="font-size:13px;color:#64748b;">Guarde este e-mail para sua referência.</p>

        <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0;">

        ${gerarContratoHtml(prestador, dataAceite)}

        <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0;">
        <p style="font-size:13px;color:#475569;">Atenciosamente,<br><strong>Equipe Seidmann Institute</strong></p>
        <p style="font-size:11px;color:#94a3b8;margin-top:16px;">Esta é uma mensagem automática. Por favor, não responda este e-mail.</p>
      </div>
    </div>
  `

  return { subject, html, text }
}
