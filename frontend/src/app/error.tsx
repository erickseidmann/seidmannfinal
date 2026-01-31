'use client'

import { useEffect } from 'react'
import Button from '@/components/ui/Button'

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center p-8 text-center">
      <h1 className="text-2xl font-bold text-gray-900 mb-2">Algo deu errado</h1>
      <p className="text-gray-600 mb-6 max-w-md">
        Ocorreu um erro ao carregar esta página. Tente novamente.
      </p>
      <Button variant="primary" onClick={reset}>
        Tentar novamente
      </Button>
    </div>
  )
}
