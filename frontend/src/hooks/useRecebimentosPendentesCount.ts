'use client'

import { useCallback, useEffect, useState } from 'react'

const POLL_MS = 30_000

export function useRecebimentosPendentesCount() {
  const [pendentes, setPendentes] = useState(0)
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    try {
      const params = new URLSearchParams({
        status: 'PENDENTE',
        page: '1',
        pageSize: '1',
      })
      const res = await fetch(`/api/admin/financeiro/recebimentos?${params}`, {
        credentials: 'include',
      })
      const json = await res.json()
      if (json.ok) {
        setPendentes(json.data?.total ?? 0)
      }
    } catch {
      // silencioso — badge opcional
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    refresh()
    const id = setInterval(refresh, POLL_MS)
    return () => clearInterval(id)
  }, [refresh])

  return { pendentes, loading, refresh }
}
