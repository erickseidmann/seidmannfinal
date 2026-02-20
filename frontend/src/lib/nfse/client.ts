/**
 * Cliente para a API Focus NFe (NFSe).
 * Autenticação: Basic Auth (token como username, senha vazia).
 * Documentação: https://focusnfe.com.br/doc/
 */

import { NfsePayload, NfseResponse, NfseStatus } from './types'

const FOCUS_NFE_ENV = process.env.FOCUS_NFE_ENVIRONMENT
const FOCUS_NFE_URLS = {
  sandbox: 'https://homologacao.focusnfe.com.br',
  production: 'https://api.focusnfe.com.br',
}
const FOCUS_NFE_BASE_URL =
  FOCUS_NFE_ENV === 'production' ? FOCUS_NFE_URLS.production : FOCUS_NFE_URLS.sandbox

const FOCUS_NFE_TOKEN = process.env.FOCUS_NFE_TOKEN || ''

// Focus NFe usa Basic Auth: token como username, senha vazia
function getAuthHeader(): string {
  if (!FOCUS_NFE_TOKEN) {
    throw new Error('FOCUS_NFE_TOKEN não configurado')
  }
  const credentials = Buffer.from(`${FOCUS_NFE_TOKEN}:`).toString('base64')
  return `Basic ${credentials}`
}

// Gera referência única para a nota: seidmann-{enrollmentId}-{year}-{month}-{timestamp}
export function generateNfseRef(enrollmentId: string, year: number, month: number): string {
  const ts = Date.now()
  return `seidmann-${enrollmentId}-${year}-${String(month).padStart(2, '0')}-${ts}`
}

// Emitir NFSe
export async function emitirNfse(ref: string, payload: NfsePayload): Promise<NfseResponse> {
  const url = `${FOCUS_NFE_BASE_URL}/v2/nfse?ref=${encodeURIComponent(ref)}`
  
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: getAuthHeader(),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  })

  if (!response.ok) {
    const errorBody = await response.text()
    throw new Error(`Focus NFe erro ${response.status}: ${errorBody}`)
  }

  const data = await response.json()
  return { ref, ...data }
}

// Consultar status da NFSe
export async function consultarNfse(ref: string): Promise<NfseResponse> {
  const url = `${FOCUS_NFE_BASE_URL}/v2/nfse/${encodeURIComponent(ref)}`
  
  const response = await fetch(url, {
    method: 'GET',
    headers: { Authorization: getAuthHeader() },
  })

  if (!response.ok) {
    const errorBody = await response.text()
    throw new Error(`Focus NFe consulta erro ${response.status}: ${errorBody}`)
  }

  const data = await response.json()
  return { ref, ...data }
}

// Cancelar NFSe
export async function cancelarNfse(ref: string, justificativa: string): Promise<NfseResponse> {
  const url = `${FOCUS_NFE_BASE_URL}/v2/nfse/${encodeURIComponent(ref)}`
  
  const response = await fetch(url, {
    method: 'DELETE',
    headers: {
      Authorization: getAuthHeader(),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ justificativa }),
  })

  if (!response.ok) {
    const errorBody = await response.text()
    throw new Error(`Focus NFe cancelamento erro ${response.status}: ${errorBody}`)
  }

  return await response.json()
}

// Baixar XML da NFSe (retorna string XML)
export async function downloadNfseXml(ref: string): Promise<string> {
  const url = `${FOCUS_NFE_BASE_URL}/v2/nfse/${encodeURIComponent(ref)}.xml`
  
  const response = await fetch(url, {
    method: 'GET',
    headers: { Authorization: getAuthHeader() },
  })

  if (!response.ok) {
    throw new Error(`Focus NFe XML download erro ${response.status}`)
  }

  return await response.text()
}

// Baixar PDF da NFSe (retorna Buffer)
export async function downloadNfsePdf(ref: string): Promise<Buffer> {
  const url = `${FOCUS_NFE_BASE_URL}/v2/nfse/${encodeURIComponent(ref)}.pdf`
  
  const response = await fetch(url, {
    method: 'GET',
    headers: { Authorization: getAuthHeader() },
  })

  if (!response.ok) {
    throw new Error(`Focus NFe PDF download erro ${response.status}`)
  }

  const arrayBuffer = await response.arrayBuffer()
  return Buffer.from(arrayBuffer)
}
