'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { ProfessorJoinResult } from '@/lib/professor-classroom-join'

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

  const sendHeartbeat = useCallback(() => {
    const id = attendanceIdRef.current
    if (!id) return
    fetch(`${base}/attendance/${id}/heartbeat`, {
      method: 'POST',
      credentials: 'include',
      keepalive: true,
    }).catch(() => {})
  }, [base])

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
      sendHeartbeat()
    }, HEARTBEAT_MS)
  }, [sendHeartbeat, stopHeartbeat])

  const clearTracking = useCallback(() => {
    stopHeartbeat()
    attendanceIdRef.current = null
    leaveSentRef.current = false
    setIsTracking(false)
  }, [stopHeartbeat])

  const registerJoin = useCallback(async (): Promise<ProfessorJoinResult> => {
    if (!lessonId) {
      return { ok: false, message: 'Aula inválida.' }
    }
    if (attendanceIdRef.current) {
      return {
        ok: true,
        attendanceId: attendanceIdRef.current,
        reused: true,
      }
    }
    try {
      const res = await fetch(`${base}/${lessonId}/join`, {
        method: 'POST',
        credentials: 'include',
      })
      const data = await res.json()
      if (!res.ok || !data?.ok) {
        return {
          ok: false,
          message: data?.message || 'Não foi possível entrar na aula.',
          code: data?.code,
          blockingSession: data?.blockingSession,
        }
      }
      if (data.attendanceId) {
        attendanceIdRef.current = data.attendanceId
        leaveSentRef.current = false
        setIsTracking(true)
        startHeartbeat()
        sendHeartbeat()
        return {
          ok: true,
          attendanceId: data.attendanceId as string,
          reused: Boolean(data.reused),
        }
      }
      return { ok: false, message: 'Resposta inválida ao entrar na aula.' }
    } catch {
      return { ok: false, message: 'Erro de conexão ao entrar na aula.' }
    }
  }, [base, lessonId, sendHeartbeat, startHeartbeat])

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

  const syncActiveAttendance = useCallback(
    (attendanceId: string | null | undefined) => {
      if (!attendanceId) {
        if (attendanceIdRef.current) {
          clearTracking()
        }
        return
      }
      if (attendanceIdRef.current === attendanceId) return
      attendanceIdRef.current = attendanceId
      leaveSentRef.current = false
      setIsTracking(true)
      startHeartbeat()
      sendHeartbeat()
    },
    [clearTracking, sendHeartbeat, startHeartbeat]
  )

  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === 'visible' && attendanceIdRef.current) {
        sendHeartbeat()
      }
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  }, [sendHeartbeat])

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

  return { registerJoin, registerLeave, syncActiveAttendance, clearTracking, isTracking }
}
