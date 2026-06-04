/**
 * Autenticação Santander Open Finance — mTLS + OAuth2 client_credentials.
 * Certificados em ./certs/ (Docker: volume ./certs:/app/certs:ro).
 */

import https from 'https'
import fs from 'fs'
import path from 'path'

const TOKEN_URL =
  process.env.SANTANDER_AUTH_URL ||
  'https://trust-open.api.santander.com.br/auth/oauth/v2/token'

const TOKEN_BUFFER_SECONDS = 300

let cachedToken: string | null = null
let tokenExpiresAt = 0

function getCertAndKey(): { cert: Buffer; key: Buffer } {
  const certPath = process.env.SANTANDER_CERT_PATH
  const keyPath = process.env.SANTANDER_KEY_PATH

  if (!certPath || !keyPath) {
    throw new Error(
      'Santander: configure SANTANDER_CERT_PATH e SANTANDER_KEY_PATH (ex: ./certs/santander-cert.pem)'
    )
  }

  const certFull = path.resolve(process.cwd(), certPath)
  const keyFull = path.resolve(process.cwd(), keyPath)
  return {
    cert: fs.readFileSync(certFull),
    key: fs.readFileSync(keyFull),
  }
}

export function createSantanderHttpsAgent(): https.Agent {
  const { cert, key } = getCertAndKey()
  return new https.Agent({ cert, key })
}

export async function getSantanderToken(): Promise<string> {
  const now = Math.floor(Date.now() / 1000)
  if (cachedToken && tokenExpiresAt > now + TOKEN_BUFFER_SECONDS) {
    return cachedToken
  }

  const clientId = process.env.SANTANDER_CLIENT_ID
  const clientSecret = process.env.SANTANDER_CLIENT_SECRET
  if (!clientId || !clientSecret) {
    throw new Error('SANTANDER_CLIENT_ID e SANTANDER_CLIENT_SECRET são obrigatórios')
  }

  const agent = createSantanderHttpsAgent()
  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: clientId,
    client_secret: clientSecret,
  }).toString()

  const url = new URL(TOKEN_URL)
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
    let errMsg = `Token Santander falhou: ${response.statusCode}`
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

export function clearSantanderTokenCache(): void {
  cachedToken = null
  tokenExpiresAt = 0
}
