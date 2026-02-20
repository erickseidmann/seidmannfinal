/**
 * Autenticação Cora - mTLS + OAuth2 client_credentials.
 * Certificados via arquivos em ./certs/ (Docker: volume ./certs:/app/certs:ro).
 */

import https from 'https'
import fs from 'fs'
import path from 'path'

const TOKEN_BUFFER_SECONDS = 300 // Renovar 5 min antes de expirar
let cachedToken: string | null = null
let tokenExpiresAt = 0

function getCertAndKey(): { cert: Buffer; key: Buffer } {
  const certPath =
    process.env.CORA_CERT_PATH ||
    process.env.CORA_CERTIFICATE_PATH
  const keyPath =
    process.env.CORA_KEY_PATH ||
    process.env.CORA_PRIVATE_KEY_PATH

  if (!certPath || !keyPath) {
    throw new Error(
      'Cora: Configure CORA_CERT_PATH e CORA_KEY_PATH (ex: ./certs/certificate.pem e ./certs/private-key.pem)'
    )
  }

  const certFull = path.resolve(process.cwd(), certPath)
  const keyFull = path.resolve(process.cwd(), keyPath)
  return {
    cert: fs.readFileSync(certFull),
    key: fs.readFileSync(keyFull),
  }
}

export function createCoraHttpsAgent(): https.Agent {
  const { cert, key } = getCertAndKey()
  return new https.Agent({ cert, key })
}

export async function getCoraToken(): Promise<string> {
  const now = Math.floor(Date.now() / 1000)
  if (
    cachedToken &&
    tokenExpiresAt > now + TOKEN_BUFFER_SECONDS
  ) {
    return cachedToken
  }

  const clientId = process.env.CORA_CLIENT_ID
  if (!clientId) {
    throw new Error('CORA_CLIENT_ID é obrigatório')
  }

  const authUrl =
    process.env.CORA_AUTH_URL ||
    (process.env.CORA_API_URL
      ? `${process.env.CORA_API_URL}/token`
      : process.env.CORA_ENVIRONMENT === 'production'
        ? 'https://matls-clients.api.cora.com.br/token'
        : 'https://matls-clients.api.stage.cora.com.br/token')

  const agent = createCoraHttpsAgent()
  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: clientId,
  }).toString()

  const url = new URL(authUrl)
  const options: https.RequestOptions = {
    hostname: url.hostname,
    path: url.pathname + url.search,
    method: 'POST',
    port: 443,
    agent,
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Content-Length': Buffer.byteLength(body),
    },
  }

  const response = await new Promise<{ statusCode: number; body: string }>(
    (resolve, reject) => {
      const req = https.request(options, (res) => {
        const chunks: Buffer[] = []
        res.on('data', (c) => chunks.push(c))
        res.on('end', () =>
          resolve({
            statusCode: res.statusCode ?? 0,
            body: Buffer.concat(chunks).toString('utf8'),
          })
        )
      })
      req.on('error', reject)
      req.write(body)
      req.end()
    }
  )

  if (response.statusCode !== 200) {
    let errMsg = `Token Cora falhou: ${response.statusCode}`
    try {
      const parsed = JSON.parse(response.body) as {
        error?: string
        error_description?: string
      }
      errMsg = parsed.error_description ?? parsed.error ?? errMsg
    } catch {
      // ignore
    }
    throw new Error(errMsg)
  }

  const payload = JSON.parse(response.body) as {
    access_token: string
    expires_in?: number
  }
  cachedToken = payload.access_token
  tokenExpiresAt = now + (payload.expires_in ?? 3600)
  return cachedToken!
}

export function clearCoraTokenCache(): void {
  cachedToken = null
  tokenExpiresAt = 0
}
