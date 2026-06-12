/** Gera data URL do QR Code para um link de validação. */
export async function getQrCodeDataUrl(url: string, width = 512): Promise<string> {
  const QRCode = (await import('qrcode')).default
  return QRCode.toDataURL(url, { width, margin: 2 })
}

/** Copia a imagem do QR Code para a área de transferência. */
export async function copyQrCodeImage(dataUrl: string): Promise<boolean> {
  try {
    const res = await fetch(dataUrl)
    const blob = await res.blob()
    if (typeof ClipboardItem !== 'undefined' && navigator.clipboard?.write) {
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
      return true
    }
    return false
  } catch {
    return false
  }
}

/** Gera e copia o QR Code de um link de validação. */
export async function copyCertificateQrCode(validationUrl: string): Promise<boolean> {
  const dataUrl = await getQrCodeDataUrl(validationUrl)
  return copyQrCodeImage(dataUrl)
}
