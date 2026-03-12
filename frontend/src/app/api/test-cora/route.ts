/**
 * GET /api/test-cora
 * Endpoint temporário para validar configuração Cora (env + paths dos certificados).
 * Após confirmar clientId, certExists e keyExists, pode remover este arquivo.
 */

import fs from 'fs'
import path from 'path'

export async function GET() {
  const certPath = process.env.CORA_CERT_PATH || process.env.CORA_CERTIFICATE_PATH
  const keyPath = process.env.CORA_KEY_PATH || process.env.CORA_PRIVATE_KEY_PATH

  const checks: Record<string, unknown> = {
    clientId: !!process.env.CORA_CLIENT_ID,
    clientIdValue: process.env.CORA_CLIENT_ID
      ? `${process.env.CORA_CLIENT_ID.substring(0, 10)}...`
      : null,
    environment: process.env.CORA_ENVIRONMENT,
    certPath: certPath ?? null,
    keyPath: keyPath ?? null,
    cwd: process.cwd(),
    certExists: false,
    keyExists: false,
  }

  try {
    if (certPath) {
      const certFullPath = path.resolve(process.cwd(), certPath)
      checks.certExists = fs.existsSync(certFullPath)
    }
    if (keyPath) {
      const keyFullPath = path.resolve(process.cwd(), keyPath)
      checks.keyExists = fs.existsSync(keyFullPath)
    }
  } catch {
    // ignore
  }

  return Response.json(checks)
}
