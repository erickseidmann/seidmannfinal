'use client'

import { ReactNode } from 'react'
import { Card } from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import { X } from 'lucide-react'

interface ConfirmModalProps {
  isOpen: boolean
  onClose: () => void
  onConfirm: () => void
  title: string
  message: ReactNode
  confirmLabel?: string
  cancelLabel?: string
  variant?: 'danger' | 'default'
}

export default function ConfirmModal({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel = 'Confirmar',
  cancelLabel = 'Cancelar',
  variant = 'default',
}: ConfirmModalProps) {
  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-2 sm:p-4">
      <Card className="w-full max-w-md max-h-[90vh] overflow-y-auto">
        <div className="p-4 sm:p-6">
          <div className="flex items-center justify-between mb-4 sm:mb-6">
            <h2 className="text-lg sm:text-xl md:text-2xl font-bold text-gray-900 pr-2">
              {title}
            </h2>
            <button
              type="button"
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 transition-colors flex-shrink-0"
              aria-label="Fechar"
            >
              <X className="w-5 h-5 sm:w-6 sm:h-6" />
            </button>
          </div>

          <div className="mb-4 sm:mb-6 text-gray-700 whitespace-pre-line">{message}</div>

          <div className="flex flex-col sm:flex-row justify-end gap-2 sm:gap-3 pt-4 border-t">
            <Button variant="outline" onClick={onClose}>
              {cancelLabel}
            </Button>
            <Button
              variant="primary"
              onClick={onConfirm}
              className={
                variant === 'danger'
                  ? '!bg-red-600 hover:!bg-red-700 !from-red-600 !to-red-600'
                  : ''
              }
            >
              {confirmLabel}
            </Button>
          </div>
        </div>
      </Card>
    </div>
  )
}
