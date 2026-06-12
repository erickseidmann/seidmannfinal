'use client'

import { useCallback, useRef, useState } from 'react'
import LateCancellationModal, {
  type LateCancelChoice,
} from '@/components/admin/LateCancellationModal'

export function useLateCancellationDialog() {
  const [horasAntecedencia, setHorasAntecedencia] = useState(6)
  const [open, setOpen] = useState(false)
  const resolveRef = useRef<((value: LateCancelChoice) => void) | null>(null)

  const promptLateCancellation = useCallback((horas: number): Promise<LateCancelChoice> => {
    return new Promise((resolve) => {
      setHorasAntecedencia(horas)
      resolveRef.current = resolve
      setOpen(true)
    })
  }, [])

  const close = useCallback((result: LateCancelChoice) => {
    resolveRef.current?.(result)
    resolveRef.current = null
    setOpen(false)
  }, [])

  const LateCancellationDialog = useCallback(() => {
    if (!open) return null
    return (
      <LateCancellationModal
        isOpen
        horasAntecedencia={horasAntecedencia}
        onClose={() => close('back')}
        onConfirm={() => close('confirm')}
        onException={() => close('exception')}
      />
    )
  }, [open, horasAntecedencia, close])

  return { promptLateCancellation, LateCancellationDialog }
}
