/**
 * Redireciona para a aba Material (mesma funcionalidade).
 */

'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function LivrosPage() {
  const router = useRouter()
  useEffect(() => {
    router.replace('/dashboard-professores/material')
  }, [router])
  return null
}
