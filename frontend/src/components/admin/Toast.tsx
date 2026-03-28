/**
 * Toast de notificação (substitui alert nativo)
 */

'use client'

import { useEffect } from 'react'
import { CheckCircle, XCircle, Info } from 'lucide-react'

interface ToastProps {
  message: string
  type: 'success' | 'error' | 'info'
  onClose: () => void
  duration?: number
}

export default function Toast({ message, type, onClose, duration = 4000 }: ToastProps) {
  useEffect(() => {
    const t = setTimeout(onClose, duration)
    return () => clearTimeout(t)
  }, [onClose, duration])

  const style =
    type === 'success'
      ? 'bg-green-50 border-green-200 text-green-800'
      : type === 'info'
        ? 'bg-sky-50 border-sky-200 text-sky-900'
        : 'bg-red-50 border-red-200 text-red-800'

  return (
    <div className="fixed top-4 right-4 z-[100]">
      <div className={`flex items-center gap-3 px-4 py-3 rounded-lg shadow-lg border ${style}`}>
        {type === 'success' ? (
          <CheckCircle className="w-5 h-5 shrink-0" />
        ) : type === 'info' ? (
          <Info className="w-5 h-5 shrink-0 text-sky-600" />
        ) : (
          <XCircle className="w-5 h-5 shrink-0" />
        )}
        <span className="font-medium">{message}</span>
      </div>
    </div>
  )
}
