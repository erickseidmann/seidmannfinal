/**
 * Cliente HTTP Santander (extrato) — mTLS + Bearer + X-Application-Key.
 */

import https from 'https'
import { createSantanderHttpsAgent, getSantanderToken, clearSantanderTokenCache } from './auth'

const API_BASE =
  process.env.SANTANDER_API_URL?.replace(/\/$/, '') ||
  'https://trust-open.api.santander.com.br'

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

function httpsGet(
  url: URL,
  headers: Record<string, string>,
  agent: https.Agent
): Promise<{ statusCode: number; body: string }> {
  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: url.hostname,
        path: url.pathname + url.search,
        method: 'GET',
        port: 443,
        agent,
        headers: {
          Accept: 'application/json',
          ...headers,
        },
      },
      (res) => {
        const chunks: Buffer[] = []
        res.on('data', (c) => chunks.push(c))
        res.on('end', () =>
          resolve({
            statusCode: res.statusCode ?? 0,
            body: Buffer.concat(chunks).toString('utf8'),
          })
        )
      }
    )
    req.on('error', reject)
    req.end()
  })
}

async function getAccessToken(forceRenew = false): Promise<string> {
  if (forceRenew) clearSantanderTokenCache()
  return getSantanderToken()
}

export async function santanderAuthenticatedGet<T>(
  pathWithQuery: string,
  maxRetries = 2
): Promise<T> {
  const clientId = process.env.SANTANDER_CLIENT_ID
  if (!clientId) throw new Error('SANTANDER_CLIENT_ID é obrigatório')

  const fullUrl = pathWithQuery.startsWith('http')
    ? new URL(pathWithQuery)
    : new URL(pathWithQuery.startsWith('/') ? pathWithQuery : `/${pathWithQuery}`, API_BASE)

  let lastError: Error | null = null

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const token = await getAccessToken(attempt > 0)
    const agent = createSantanderHttpsAgent()
    const headers = {
      Authorization: `Bearer ${token}`,
      'X-Application-Key': clientId,
    }

    let response = await httpsGet(fullUrl, headers, agent)

    if (response.statusCode === 401 && attempt === 0) {
      await getAccessToken(true)
      response = await httpsGet(
        fullUrl,
        {
          Authorization: `Bearer ${await getSantanderToken()}`,
          'X-Application-Key': clientId,
        },
        createSantanderHttpsAgent()
      )
    }

    if (response.statusCode >= 200 && response.statusCode < 300) {
      try {
        return JSON.parse(response.body) as T
      } catch {
        throw new Error('Resposta Santander inválida (JSON)')
      }
    }

    const retryable =
      response.statusCode === 502 ||
      response.statusCode === 503 ||
      response.statusCode === 504

    lastError = new Error(
      `Santander API ${response.statusCode}: ${response.body.slice(0, 500)}`
    )

    if (!retryable || attempt === maxRetries - 1) throw lastError
    await sleep(1000 * (attempt + 1))
  }

  throw lastError ?? new Error('Santander GET failed')
}
