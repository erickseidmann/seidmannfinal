'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

type Role = 'professor' | 'student'

const HEARTBEAT_MS = 30 * 1000

export function useLessonAttendance(
  lessonId: string,
  role: Role,
  options?: { autoLeaveOnUnload?: boolean }
) {
  const attendanceIdRef = useRef<string | null>(null)
  const leaveSentRef = useRef(false)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const base = `/api/${role}/lessons`
  const [isTracking, setIsTracking] = useState(false)
  const autoLeaveOnUnload = options?.autoLeaveOnUnload ?? true

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
    attendanceIdRef.current = null
    setIsTracking(false)
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
        setIsTracking(true)
        startHeartbeat()
      }
    } catch {
      // falha de tracking não deve impedir o usuário de entrar na aula
    }
  }, [base, lessonId, startHeartbeat])

  const registerLeave = useCallback(
    async (options?: { finalizeCall?: boolean }): Promise<{ nextLesson?: { id: string; startAt: string } | null }> => {
      const id = attendanceIdRef.current
      if (!id) return {}
      stopHeartbeat()
      leaveSentRef.current = true
      let nextLesson: { id: string; startAt: string } | null | undefined
      try {
        const res = await fetch(`${base}/attendance/${id}/leave`, {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ finalizeCall: options?.finalizeCall === true }),
        })
        const data = await res.json()
        if (data?.ok && 'nextLesson' in data) {
          nextLesson = data.nextLesson ?? null
        }
      } catch {
        // ignore
      }
      attendanceIdRef.current = null
      leaveSentRef.current = false
      setIsTracking(false)
      return { nextLesson }
    },
    [base, stopHeartbeat]
  )

  /** Retoma heartbeat quando a API já indica sessão ACTIVE (ex.: lista de salas). */
  const syncActiveAttendance = useCallback(
    (attendanceId: string) => {
      if (!attendanceId || attendanceIdRef.current === attendanceId) return
      attendanceIdRef.current = attendanceId
      leaveSentRef.current = false
      setIsTracking(true)
      startHeartbeat()
    },
    [startHeartbeat]
  )

  useEffect(() => {
    if (!autoLeaveOnUnload) {
      return () => {
        stopHeartbeat()
      }
    }
    const handleLeave = () => sendLeave()
    window.addEventListener('pagehide', handleLeave)
    window.addEventListener('beforeunload', handleLeave)
    return () => {
      window.removeEventListener('pagehide', handleLeave)
      window.removeEventListener('beforeunload', handleLeave)
      stopHeartbeat()
      sendLeave()
    }
  }, [autoLeaveOnUnload, sendLeave, stopHeartbeat])

  return { registerJoin, registerLeave, syncActiveAttendance, isTracking }
}
