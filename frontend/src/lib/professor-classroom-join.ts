/**
 * Helpers para entrar na sala do professor (join + Meet).
 */

export type BlockingActiveSession = {
  attendanceId: string
  lessonId: string
  studentLabel: string
  startAt: string
}

export type ProfessorJoinResult =
  | { ok: true; attendanceId: string; reused: boolean }
  | {
      ok: false
      message: string
      code?: string
      blockingSession?: BlockingActiveSession
    }

export async function postProfessorLessonJoin(lessonId: string): Promise<ProfessorJoinResult> {
  try {
    const res = await fetch(`/api/professor/lessons/${lessonId}/join`, {
      method: 'POST',
      credentials: 'include',
    })
    const json = await res.json()
    if (!res.ok || !json.ok) {
      return {
        ok: false,
        message: json.message || 'Não foi possível entrar na aula.',
        code: json.code,
        blockingSession: json.blockingSession,
      }
    }
    return {
      ok: true,
      attendanceId: json.attendanceId as string,
      reused: Boolean(json.reused),
    }
  } catch {
    return { ok: false, message: 'Erro de conexão ao entrar na aula.' }
  }
}

export async function postProfessorAttendanceLeave(
  attendanceId: string,
  options?: { finalizeCall?: boolean }
): Promise<{ ok: boolean; message?: string; nextLesson?: { id: string; startAt: string } | null }> {
  try {
    const res = await fetch(`/api/professor/lessons/attendance/${attendanceId}/leave`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ finalizeCall: options?.finalizeCall === true }),
    })
    const json = await res.json()
    if (!res.ok || !json.ok) {
      return { ok: false, message: json.message || 'Não foi possível encerrar a aula.' }
    }
    return { ok: true, nextLesson: json.nextLesson ?? null }
  } catch {
    return { ok: false, message: 'Erro de conexão ao encerrar a aula.' }
  }
}

export function professorMeetUrl(linkSala: string | null | undefined, roomName: string | null): string | null {
  if (linkSala?.trim()) return linkSala.trim()
  if (!roomName) return null
  return `https://meet.jit.si/${roomName}#config.prejoinPageEnabled=false`
}

export function openProfessorMeet(url: string): void {
  window.open(url, '_blank', 'noopener,noreferrer')
}
