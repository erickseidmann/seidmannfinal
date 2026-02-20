/**
 * Tipos para integração com Focus NFe (NFSe).
 */

// Status possíveis da NFSe na Focus NFe
export type NfseStatus = 
  | 'processando_autorizacao'  // enviada, aguardando prefeitura
  | 'autorizado'               // emitida com sucesso
  | 'erro_autorizacao'         // prefeitura recusou
  | 'cancelado';               // cancelada

export interface NfseServico {
  aliquota: number;                    // 0 para Simples Nacional isento
  discriminacao: string;               // descrição do serviço
  iss_retido: boolean;                 // false
  item_lista_servico: string;          // "0802"
  codigo_cnae: string;                 // "859370000" 
  valor_servicos: number;              // valor da mensalidade
  codigo_municipio: string;            // "3509502" (Campinas)
}

export interface NfsePrestador {
  cnpj: string;                        // "32707269000107"
  inscricao_municipal: string;         // "008226024"
  codigo_municipio: string;            // "3509502"
}

export interface NfseTomador {
  cpf?: string;
  cnpj?: string;
  razao_social: string;
  email?: string;
  telefone?: string;
  endereco?: {
    logradouro?: string;
    numero?: string;
    complemento?: string;
    bairro?: string;
    codigo_municipio?: string;
    uf?: string;
    cep?: string;
  };
}

export interface NfsePayload {
  data_emissao?: string;                // ISO date, default hoje
  natureza_operacao: string;            // "1" (Tributação no município)
  regime_especial_tributacao?: string;  // "6" = ME ou EPP do Simples Nacional (ABRASF)
  optante_simples_nacional: boolean;    // true
  prestador: NfsePrestador;
  tomador: NfseTomador;
  servico: NfseServico;
  incentivador_cultural: boolean;       // false
}

export interface NfseResponse {
  ref: string;
  status: NfseStatus;
  numero?: string;                     // número da nota
  codigo_verificacao?: string;
  data_emissao?: string;
  url?: string;                        // URL do PDF
  caminho_xml_nota_fiscal?: string;    // URL do XML
  mensagem?: string;                   // mensagem de erro se houver
  erros?: Array<{ codigo: string; mensagem: string; correcao?: string }>;
}

// Registro no banco de dados
export interface NfseRecord {
  id: string;
  enrollmentId: string;
  studentName: string;
  cpf: string;
  year: number;
  month: number;
  amount: number;
  focusRef: string;           // referência única enviada à Focus NFe
  status: NfseStatus;
  numero?: string;            // número da nota na prefeitura
  codigoVerificacao?: string;
  pdfUrl?: string;
  xmlUrl?: string;
  errorMessage?: string;
  createdAt: string;
  updatedAt: string;
  cancelledAt?: string;
  cancelReason?: string;
}
