/**
 * Modal de confirmação estilizado (substitui confirm nativo)
 */

'use client'

import Modal from './Modal'
import Button from '@/components/ui/Button'

interface ConfirmModalProps {
  isOpen: boolean
  onClose: () => void
  onConfirm: () => void
  title: string
  message: string
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
  const handleConfirm = () => {
    onConfirm()
    onClose()
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      size="sm"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            {cancelLabel}
          </Button>
          <Button
            variant="primary"
            onClick={handleConfirm}
            className={variant === 'danger' ? '!bg-red-600 hover:!bg-red-700 !from-red-600 !to-red-600' : ''}
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      <p className="text-gray-700">{message}</p>
    </Modal>
  )
}
