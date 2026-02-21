/**
 * Cliente para a API Cora (cobranças PIX/boleto).
 * Autenticação: OAuth2 client_credentials com mTLS.
 * Valores sempre em centavos (inteiros).
 */

import https from 'https'
import { randomUUID } from 'crypto'
import { createCoraHttpsAgent, getCoraToken, clearCoraTokenCache } from './auth'

function getBaseUrl(): string {
  const url = process.env.CORA_API_URL
  if (url) return url.replace(/\/$/, '')
  const env = process.env.CORA_ENVIRONMENT
  return env === 'production'
    ? 'https://matls-clients.api.cora.com.br'
    : 'https://matls-clients.api.stage.cora.com.br'
}

function getHttpsAgent(): https.Agent {
  return createCoraHttpsAgent()
}

const BASE_URL = getBaseUrl()

function parseUrl(path: string): { hostname: string; path: string; port: number } {
  const u = new URL(path.startsWith('http') ? path : BASE_URL + path)
  return {
    hostname: u.hostname,
    path: u.pathname + u.search,
    port: 443,
  }
}

function coraFetch(path: string, options: {
  method: string
  body?: string
  headers?: Record<string, string>
}): Promise<{ status: number; data: unknown }> {
  const { hostname, path: pathWithQuery } = parseUrl(path)
  const agent = getHttpsAgent()
  const isToken = path === '/token' || path.endsWith('/token')
  const headers: Record<string, string> = {
    'Content-Type':
      options.body && isToken
        ? 'application/x-www-form-urlencoded'
        : 'application/json',
    ...options.headers,
  }

  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname,
        path: pathWithQuery,
        method: options.method,
        port: 443,
        agent,
        headers,
      },
      (res) => {
        const chunks: Buffer[] = []
        res.on('data', (chunk) => chunks.push(chunk))
        res.on('end', () => {
          const raw = Buffer.concat(chunks).toString('utf8').trim()
          let data: unknown
          try {
            data = raw ? JSON.parse(raw) : null
          } catch {
            data = raw || null
          }
          resolve({ status: res.statusCode ?? 0, data })
        })
      }
    )
    req.on('error', reject)
    if (options.body) req.write(options.body)
    req.end()
  })
}

async function getAccessToken(forceRenew = false): Promise<string> {
  if (forceRenew) clearCoraTokenCache()
  return getCoraToken()
}

async function coraRequest<T>(
  method: string,
  path: string,
  body?: unknown,
  idempotencyKey?: string
): Promise<T> {
  const token = await getAccessToken()
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
  }
  if (idempotencyKey) headers['Idempotency-Key'] = idempotencyKey

  if (body !== undefined) {
    console.log('[Cora] Request body:', JSON.stringify(body, null, 2))
  }

  const fullPath = path.startsWith('http') ? path : `${BASE_URL}${path.startsWith('/') ? path : '/' + path}`
  const { status, data } = await coraFetch(fullPath, {
    method,
    body: body !== undefined ? JSON.stringify(body) : undefined,
    headers,
  })

  if (status === 401) {
    const newToken = await getAccessToken(true)
    const retryHeaders: Record<string, string> = {
      Authorization: `Bearer ${newToken}`,
    }
    if (idempotencyKey) retryHeaders['Idempotency-Key'] = idempotencyKey
    const retry = await coraFetch(fullPath, {
      method,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      headers: retryHeaders,
    })
    if (retry.status >= 200 && retry.status < 300) {
      return retry.data as T
    }
    const retryErr = retry.data as { message?: string; errors?: unknown }
    console.error('[Cora] API error response (retry):', JSON.stringify({ status: retry.status, path, body: retry.data }, null, 2))
    throw new Error(
      retryErr?.message ?? `Cora API error: ${retry.status}`
    )
  }

  if (status >= 200 && status < 300) {
    return (data ?? null) as T
  }

  const err = data as { message?: string; errors?: unknown }
  console.error('[Cora] API error response:', JSON.stringify({ status, path, body: data }, null, 2))
  throw new Error(err?.message ?? `Cora API error: ${status}`)
}

// --- Tipos públicos ---

export interface CoraInvoice {
  id: string
  code: string
  status: 'OPEN' | 'LATE' | 'PAID' | 'CANCELLED'
  created_at: string
  total_amount: number
  total_paid: number
  occurrence_date?: string
  customer: {
    name: string
    document: { identity: string }
  }
  payment_options: {
    bank_slip?: {
      barcode: string
      digitable_line: string
      url: string
    }
    pix?: {
      qr_code: string
      qr_code_url: string
      emv: string
    }
  }
  payments: Array<{
    id: string
    amount: number
    payment_method: string
    created_at: string
  }>
}

// --- Funções exportadas ---

export interface CreateInvoiceParams {
  code: string
  customerName: string
  customerDocument: string
  customerEmail: string
  serviceName: string
  amountCents: number
  dueDate: string
  finePercent?: number
  interestPercent?: number
  address?: {
    street: string
    number: string
    district?: string
    city: string
    state: string
    zipCode: string
    complement?: string
  }
  notifications?: {
    beforeDays?: number[]
    afterDays?: number[]
  }
}

export async function createInvoice(params: CreateInvoiceParams): Promise<CoraInvoice> {
  const notifications: Array<
    { send_on: 'before_due_date'; days_before: number } | { send_on: 'after_due_date'; days_after: number }
  > = []
  if (params.notifications?.beforeDays?.length) {
    for (const d of params.notifications.beforeDays) {
      notifications.push({ send_on: 'before_due_date', days_before: d })
    }
  }
  if (params.notifications?.afterDays?.length) {
    for (const d of params.notifications.afterDays) {
      notifications.push({ send_on: 'after_due_date', days_after: d })
    }
  }

  const customer: Record<string, unknown> = {
    name: params.customerName,
    document: { identity: params.customerDocument.replace(/\D/g, ''), type: 'CPF' },
    email: params.customerEmail,
  }
  if (params.address) {
    customer.address = {
      street: params.address.street,
      number: String(params.address.number || 'S/N'),
      district: params.address.district ?? '',
      city: params.address.city,
      state: params.address.state.replace(/\s/g, '').slice(0, 2).toUpperCase(),
      zip_code: params.address.zipCode.replace(/\D/g, ''),
      ...(params.address.complement && { complement: params.address.complement }),
    }
  }
  const payload: Record<string, unknown> = {
    code: params.code,
    customer,
    payment_forms: ['BANK_SLIP', 'PIX'],
    services: [
      { name: params.serviceName, amount: params.amountCents },
    ],
    payment_terms: {
      due_date: params.dueDate,
      ...(params.finePercent != null && { fine: { percent: params.finePercent } }),
      ...(params.interestPercent != null && { interest: { percent: params.interestPercent } }),
    },
  }
  if (notifications.length > 0) {
    payload.notifications = notifications
  }

  return coraRequest<CoraInvoice>(
    'POST',
    '/v2/invoices/',
    payload,
    randomUUID()
  )
}

export async function getInvoice(invoiceId: string): Promise<CoraInvoice> {
  return coraRequest<CoraInvoice>('GET', `/v2/invoices/${encodeURIComponent(invoiceId)}`)
}

export async function createPixForInvoice(invoiceId: string): Promise<any> {
  return coraRequest('POST', `/v2/invoices/${invoiceId}/`)
}

export interface ListInvoicesParams {
  startDate: string
  endDate: string
  status?: 'OPEN' | 'LATE' | 'PAID' | 'CANCELLED'
}

export async function listInvoices(params: ListInvoicesParams): Promise<CoraInvoice[]> {
  const q = new URLSearchParams({
    start: params.startDate,
    end: params.endDate,
    ...(params.status && { status: params.status }),
  })
  const res = await coraRequest<{ data?: CoraInvoice[]; invoices?: CoraInvoice[] }>(
    'GET',
    `/v2/invoices?${q.toString()}`
  )
  const list = res?.data ?? res?.invoices ?? []
  return Array.isArray(list) ? list : []
}

export async function cancelInvoice(invoiceId: string): Promise<void> {
  await coraRequest<void>(
    'DELETE',
    `/v2/invoices/${encodeURIComponent(invoiceId)}`
  )
}

const WEBHOOK_SECRET = process.env.CORA_WEBHOOK_SECRET ?? ''

export function validateWebhookSecret(receivedSecret: string): boolean {
  if (!WEBHOOK_SECRET) return false
  return receivedSecret === WEBHOOK_SECRET
}
