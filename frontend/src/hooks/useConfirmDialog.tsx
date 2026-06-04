'use client'

import { useCallback, useRef, useState, type ReactNode } from 'react'
import ConfirmModal from '@/components/admin/ConfirmModal'

export type ConfirmDialogOptions = {
  title: string
  message: ReactNode
  confirmLabel?: string
  cancelLabel?: string
  variant?: 'danger' | 'default'
}

/**
 * Substitui window.confirm com ConfirmModal no estilo da aplicação.
 * Renderize <ConfirmDialog /> uma vez no JSX do componente.
 */
export function useConfirmDialog() {
  const [options, setOptions] = useState<ConfirmDialogOptions | null>(null)
  const resolveRef = useRef<((value: boolean) => void) | null>(null)

  const confirm = useCallback((opts: ConfirmDialogOptions): Promise<boolean> => {
    return new Promise((resolve) => {
      resolveRef.current = resolve
      setOptions(opts)
    })
  }, [])

  const close = useCallback((result: boolean) => {
    resolveRef.current?.(result)
    resolveRef.current = null
    setOptions(null)
  }, [])

  const ConfirmDialog = useCallback(() => {
    if (!options) return null
    return (
      <ConfirmModal
        isOpen
        title={options.title}
        message={options.message}
        confirmLabel={options.confirmLabel}
        cancelLabel={options.cancelLabel}
        variant={options.variant}
        onClose={() => close(false)}
        onConfirm={() => close(true)}
      />
    )
  }, [options, close])

  return { confirm, ConfirmDialog }
}
