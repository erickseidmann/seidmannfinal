/**
 * POST /api/admin/financeiro/administracao/upload-receipt
 * Envia NF ou recibo para a pasta do Google Drive (notas fiscais prestadores).
 * Body: FormData com file (arquivo), nome (nome da pessoa), year, month.
 * O arquivo é renomeado para: "Nome da Pessoa - Mês Ano.ext"
 * Pasta Drive: configurada em GOOGLE_DRIVE_FOLDER_ID (compartilhar com o e-mail da service account).
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { google } from 'googleapis'
import { Readable } from 'stream'

const MESES_LABELS: Record<number, string> = {
  1: 'Janeiro', 2: 'Fevereiro', 3: 'Março', 4: 'Abril', 5: 'Maio', 6: 'Junho',
  7: 'Julho', 8: 'Agosto', 9: 'Setembro', 10: 'Outubro', 11: 'Novembro', 12: 'Dezembro',
}

const DRIVE_FOLDER_ID = process.env.GOOGLE_DRIVE_FOLDER_ID || '1-yzM-Hf1DZ36-KZizqilRGUZE5hNvqJV'

/** Remove caracteres inválidos para nome de arquivo no Drive */
function sanitizeFileName(name: string): string {
  return name
    .replace(/[/\\:*?"<>|]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function getExtension(filename: string): string {
  const i = filename.lastIndexOf('.')
  if (i <= 0) return ''
  return filename.slice(i)
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAdmin(request)
    if (!auth.authorized) {
      return NextResponse.json(
        { ok: false, message: auth.message || 'Não autorizado' },
        { status: auth.message?.includes('Não autenticado') ? 401 : 403 }
      )
    }

    const clientEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL
    const privateKey = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY
    if (!clientEmail || !privateKey) {
      return NextResponse.json(
        { ok: false, message: 'Upload para Drive não configurado (GOOGLE_SERVICE_ACCOUNT_EMAIL e GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY).' },
        { status: 503 }
      )
    }

    const formData = await request.formData()
    const file = formData.get('file') as File | null
    const nome = formData.get('nome') as string | null
    const yearParam = formData.get('year') as string | null
    const monthParam = formData.get('month') as string | null

    if (!file || typeof file === 'string') {
      return NextResponse.json(
        { ok: false, message: 'Arquivo é obrigatório.' },
        { status: 400 }
      )
    }
    if (!nome || !nome.trim()) {
      return NextResponse.json(
        { ok: false, message: 'Nome da pessoa é obrigatório.' },
        { status: 400 }
      )
    }
    const year = yearParam ? parseInt(yearParam, 10) : new Date().getFullYear()
    const month = monthParam ? parseInt(monthParam, 10) : new Date().getMonth() + 1
    if (Number.isNaN(year) || Number.isNaN(month) || month < 1 || month > 12) {
      return NextResponse.json(
        { ok: false, message: 'Ano e mês inválidos.' },
        { status: 400 }
      )
    }

    const mesNome = MESES_LABELS[month] ?? String(month)
    const safeNome = sanitizeFileName(nome.trim())
    const ext = getExtension(file.name) || ''
    const driveFileName = `${safeNome} - ${mesNome} ${year}${ext}`

    const buffer = Buffer.from(await file.arrayBuffer())
    const stream = Readable.from(buffer)

    const authClient = new google.auth.GoogleAuth({
      credentials: {
        client_email: clientEmail,
        private_key: privateKey.replace(/\\n/g, '\n'),
      },
      scopes: ['https://www.googleapis.com/auth/drive'],
    })

    const drive = google.drive({ version: 'v3', auth: authClient })
    const mimeType = file.type || 'application/octet-stream'

    // supportsAllDrives: true é necessário quando a pasta está em um Drive compartilhado (Shared Drive)
    const res = await drive.files.create({
      supportsAllDrives: true,
      requestBody: {
        name: driveFileName,
        parents: [DRIVE_FOLDER_ID],
      },
      media: {
        mimeType,
        body: stream,
      },
    })

    return NextResponse.json({
      ok: true,
      message: 'Arquivo enviado para o Drive com sucesso.',
      data: { fileId: res.data.id, name: driveFileName },
    })
  } catch (err: unknown) {
    // Extrair mensagem da API do Google quando disponível
    const gapiMessage =
      err && typeof err === 'object' && 'response' in err
        ? (err as { response?: { data?: { error?: { message?: string } } } }).response?.data?.error?.message
        : null
    const message =
      gapiMessage ||
      (err instanceof Error ? err.message : 'Erro ao enviar arquivo para o Drive.')
    return NextResponse.json(
      { ok: false, message },
      { status: 500 }
    )
  }
}
