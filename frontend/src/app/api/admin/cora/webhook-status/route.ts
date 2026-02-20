/**
 * GET /api/admin/cora/webhook-status
 * Lista webhooks cadastrados na Cora.
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'

async function coraGet(
  baseUrl: string,
  token: string,
  agent: import('https').Agent,
  path: string
): Promise<unknown> {
  const https = await import('https')
  const url = new URL(path.startsWith('/') ? baseUrl + path : path)
  return new Promise<unknown>((resolve, reject) => {
    const req = https.request(
      {
        hostname: url.hostname,
        path: url.pathname + url.search,
        method: 'GET',
        port: 443,
        agent,
        headers: { Authorization: `Bearer ${token}` },
      },
      (res) => {
        const chunks: Buffer[] = []
        res.on('data', (c) => chunks.push(c))
        res.on('end', () => {
          const raw = Buffer.concat(chunks).toString('utf8')
          try {
            resolve(raw ? JSON.parse(raw) : null)
          } catch {
            resolve(raw)
          }
        })
      }
    )
    req.on('error', reject)
    req.end()
  })
}

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAdmin(request)
    if (!auth.authorized) {
      return NextResponse.json(
        { ok: false, message: auth.message || 'Não autorizado' },
        { status: auth.message?.includes('Não autenticado') ? 401 : 403 }
      )
    }

    const { createCoraHttpsAgent, getCoraToken } = await import('@/lib/cora/auth')
    const baseUrl =
      process.env.CORA_API_URL ||
      (process.env.CORA_ENVIRONMENT === 'production'
        ? 'https://matls-clients.api.cora.com.br'
        : 'https://matls-clients.api.stage.cora.com.br')

    const token = await getCoraToken()
    const agent = createCoraHttpsAgent()
    const res = await coraGet(baseUrl, token, agent, '/endpoints/')

    const data = Array.isArray(res) ? res : (res as { data?: unknown[] })?.data ?? []
    return NextResponse.json({ ok: true, endpoints: data })
  } catch (error) {
    console.error('[api/admin/cora/webhook-status]', error)
    return NextResponse.json(
      { ok: false, message: 'Erro ao consultar webhooks', error: String(error) },
      { status: 500 }
    )
  }
}
