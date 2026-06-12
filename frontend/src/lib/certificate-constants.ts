/** Dados institucionais fixos em todos os certificados online. */

export const CERTIFICATE_INSTITUTE = {
  name: 'Seidmann Institute',
  cnpj: '32707269000107',
  city: 'Campinas/SP',
  addressLine1: 'Sede Campinas -SP',
  addressLine2: 'Pedro vieira da silva,415',
  addressLine3: 'B. St Genebra Cep: 13080570',
  directorName: 'Erick Seidmann da Silva',
  directorTitle: 'Diretor Geral – Seidmann Institute',
} as const

export type OnlineCertificateTypeValue = 'DECLARACAO' | 'CONCLUSAO'

export const CERTIFICATE_TYPE_LABELS: Record<OnlineCertificateTypeValue, string> = {
  DECLARACAO: 'Declaração de vínculo e período de estudos',
  CONCLUSAO: 'Certificado de conclusão',
}

export function getCertificateValidationUrl(certificateNo: string): string {
  const base =
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.SITE_URL ||
    'https://seidmanninstitute.com'
  return `${base.replace(/\/$/, '')}/validar/${encodeURIComponent(certificateNo)}`
}
