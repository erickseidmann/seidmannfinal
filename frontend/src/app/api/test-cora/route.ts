/**
 * GET /api/test-cora
 * Endpoint temporário para validar configuração Cora (env + paths dos certificados).
 * Após confirmar clientId, certExists e keyExists, pode remover este arquivo.
 */

import fs from 'fs'
import path from 'path'

export async function GET() {
  const checks: Record<string, unknown> = {
    clientId: !!process.env.CORA_CLIENT_ID,
    clientIdValue: process.env.CORA_CLIENT_ID
      ? `${process.env.CORA_CLIENT_ID.substring(0, 10)}...`
      : null,
    environment: process.env.CORA_ENVIRONMENT,
    certPath: process.env.CORA_CERTIFICATE_PATH,
    keyPath: process.env.CORA_PRIVATE_KEY_PATH,
    cwd: process.cwd(),
    certExists: false,
    keyExists: false,
  }

  try {
    const certFullPath = path.resolve(process.cwd(), process.env.CORA_CERTIFICATE_PATH || '')
    const keyFullPath = path.resolve(process.cwd(), process.env.CORA_PRIVATE_KEY_PATH || '')
    checks.certExists = fs.existsSync(certFullPath)
    checks.keyExists = fs.existsSync(keyFullPath)
  } catch {
    // ignore
  }

  return Response.json(checks)
}
