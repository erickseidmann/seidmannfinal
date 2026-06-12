'use client'

import { useCallback, useEffect, useState } from 'react'
import { Copy } from 'lucide-react'
import Button from '@/components/ui/Button'
import { copyQrCodeImage, getQrCodeDataUrl } from '@/lib/copy-qr-code'
import { cn } from '@/lib/utils'

interface CertificateQrCodeProps {
  validationUrl: string
  size?: number
  className?: string
  onCopied?: () => void
  onCopyError?: () => void
}

export default function CertificateQrCode({
  validationUrl,
  size = 140,
  className,
  onCopied,
  onCopyError,
}: CertificateQrCodeProps) {
  const [dataUrl, setDataUrl] = useState<string | null>(null)
  const [copying, setCopying] = useState(false)

  useEffect(() => {
    let cancelled = false
    getQrCodeDataUrl(validationUrl, 512)
      .then((url) => {
        if (!cancelled) setDataUrl(url)
      })
      .catch(() => {
        if (!cancelled) setDataUrl(null)
      })
    return () => {
      cancelled = true
    }
  }, [validationUrl])

  const handleCopy = useCallback(async () => {
    if (!dataUrl) return
    setCopying(true)
    try {
      const ok = await copyQrCodeImage(dataUrl)
      if (ok) onCopied?.()
      else onCopyError?.()
    } catch {
      onCopyError?.()
    } finally {
      setCopying(false)
    }
  }, [dataUrl, onCopied, onCopyError])

  return (
    <div className={cn('flex flex-col sm:flex-row items-start gap-4', className)}>
      <div className="rounded-lg border border-gray-200 bg-white p-2 shadow-sm shrink-0">
        {dataUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={dataUrl}
            alt="QR Code de validação do certificado"
            width={size}
            height={size}
            className="block"
          />
        ) : (
          <div
            className="bg-gray-100 animate-pulse rounded"
            style={{ width: size, height: size }}
          />
        )}
      </div>
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={!dataUrl || copying}
        onClick={() => void handleCopy()}
        className="inline-flex items-center gap-1"
      >
        <Copy className="w-4 h-4" />
        {copying ? 'Copiando…' : 'Copiar QR Code'}
      </Button>
    </div>
  )
}
