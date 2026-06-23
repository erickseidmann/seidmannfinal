'use client'

import { useCallback, useRef, useState } from 'react'
import LateCancellationModal, {
  type LateCancelChoice,
  type LateCancellationModalVariant,
} from '@/components/admin/LateCancellationModal'

export function useLateCancellationDialog() {
  const [horasAntecedencia, setHorasAntecedencia] = useState(6)
  const [variant, setVariant] = useState<LateCancellationModalVariant>('cancel')
  const [open, setOpen] = useState(false)
  const resolveRef = useRef<((value: LateCancelChoice) => void) | null>(null)

  const promptLateCancellation = useCallback((horas: number): Promise<LateCancelChoice> => {
    return new Promise((resolve) => {
      setHorasAntecedencia(horas)
      setVariant('cancel')
      resolveRef.current = resolve
      setOpen(true)
    })
  }, [])

  const promptRescheduleException = useCallback((horas: number): Promise<'back' | 'exception'> => {
    return new Promise((resolve) => {
      setHorasAntecedencia(horas)
      setVariant('reschedule')
      resolveRef.current = (result) => {
        resolve(result === 'exception' ? 'exception' : 'back')
      }
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
        variant={variant}
        onClose={() => close('back')}
        onConfirm={() => close('confirm')}
        onException={() => close('exception')}
      />
    )
  }, [open, horasAntecedencia, variant, close])

  return { promptLateCancellation, promptRescheduleException, LateCancellationDialog }
}
