/**
 * Toast de notificação (substitui alert nativo)
 */

'use client'

import { useEffect } from 'react'
import { CheckCircle, XCircle } from 'lucide-react'

interface ToastProps {
  message: string
  type: 'success' | 'error'
  onClose: () => void
  duration?: number
}

export default function Toast({ message, type, onClose, duration = 4000 }: ToastProps) {
  useEffect(() => {
    const t = setTimeout(onClose, duration)
    return () => clearTimeout(t)
  }, [onClose, duration])

  return (
    <div className="fixed top-4 right-4 z-[100]">
      <div
        className={`flex items-center gap-3 px-4 py-3 rounded-lg shadow-lg border ${
          type === 'success'
            ? 'bg-green-50 border-green-200 text-green-800'
            : 'bg-red-50 border-red-200 text-red-800'
        }`}
      >
        {type === 'success' ? (
          <CheckCircle className="w-5 h-5 shrink-0" />
        ) : (
          <XCircle className="w-5 h-5 shrink-0" />
        )}
        <span className="font-medium">{message}</span>
      </div>
    </div>
  )
}
