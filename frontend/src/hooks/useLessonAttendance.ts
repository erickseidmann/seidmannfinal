'use client'

import { useCallback, useEffect, useRef } from 'react'

type Role = 'professor' | 'student'

const HEARTBEAT_MS = 30 * 1000

export function useLessonAttendance(lessonId: string, role: Role) {
  const attendanceIdRef = useRef<string | null>(null)
  const leaveSentRef = useRef(false)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const base = `/api/${role}/lessons`

  const stopHeartbeat = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current)
      intervalRef.current = null
    }
  }, [])

  const sendLeave = useCallback(() => {
    const id = attendanceIdRef.current
    if (!id || leaveSentRef.current) return
    leaveSentRef.current = true

    const url = new URL(`${base}/attendance/${id}/leave`, window.location.origin).toString()
    if (navigator.sendBeacon) {
      navigator.sendBeacon(url)
    } else {
      fetch(url, { method: 'POST', credentials: 'include', keepalive: true }).catch(() => {})
    }
  }, [base])

  const startHeartbeat = useCallback(() => {
    stopHeartbeat()
    intervalRef.current = setInterval(() => {
      const id = attendanceIdRef.current
      if (!id) return
      fetch(`${base}/attendance/${id}/heartbeat`, {
        method: 'POST',
        credentials: 'include',
        keepalive: true,
      }).catch(() => {})
    }, HEARTBEAT_MS)
  }, [base, stopHeartbeat])

  const registerJoin = useCallback(async () => {
    if (!lessonId || attendanceIdRef.current) return
    try {
      const res = await fetch(`${base}/${lessonId}/join`, {
        method: 'POST',
        credentials: 'include',
      })
      const data = await res.json()
      if (data?.ok && data.attendanceId) {
        attendanceIdRef.current = data.attendanceId
        leaveSentRef.current = false
        startHeartbeat()
      }
    } catch {
      // falha de tracking não deve impedir o usuário de entrar na aula
    }
  }, [base, lessonId, startHeartbeat])

  useEffect(() => {
    const handleLeave = () => sendLeave()
    window.addEventListener('pagehide', handleLeave)
    window.addEventListener('beforeunload', handleLeave)
    return () => {
      window.removeEventListener('pagehide', handleLeave)
      window.removeEventListener('beforeunload', handleLeave)
      stopHeartbeat()
      sendLeave()
    }
  }, [sendLeave, stopHeartbeat])

  return { registerJoin }
}
