/**
 * Componente Modal
 * 
 * Modal simples para confirmações e formulários
 */

'use client'

import { ReactNode } from 'react'
import { Card } from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import { X } from 'lucide-react'

interface ModalProps {
  isOpen: boolean
  onClose: () => void
  title: string
  children: ReactNode
  footer?: ReactNode
  size?: 'sm' | 'md' | 'lg' | 'xl'
}

const sizeClasses = {
  sm: 'max-w-md',
  md: 'max-w-lg',
  lg: 'max-w-2xl',
  xl: 'max-w-4xl',
}

export default function Modal({
  isOpen,
  onClose,
  title,
  children,
  footer,
  size = 'md',
}: ModalProps) {
  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <Card className={`w-full ${sizeClasses[size]} max-h-[90vh] overflow-y-auto`}>
        <div className="p-6">
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl font-bold text-gray-900">{title}</h2>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 transition-colors"
              aria-label="Fechar"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Content */}
          <div className="mb-6">{children}</div>

          {/* Footer */}
          {footer && <div className="flex justify-end gap-3 pt-4 border-t">{footer}</div>}
        </div>
      </Card>
    </div>
  )
}
