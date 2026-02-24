/**
 * Dashboard Aluno – Sala de Aula (detalhes da aula + Jitsi quando canJoin)
 */

'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'
import {
  ArrowLeft,
  Clock,
  BookOpen,
  User,
  Video,
  VideoOff,
  Calendar,
  ChevronRight,
  Loader2,
} from 'lucide-react'
import Button from '@/components/ui/Button'

// ——— Tipos ———
interface LessonData {
  id: string
  status: string
  startAt: string
  durationMinutes: number
  notes: string | null
  enrollment: {
    id: string
    nome: string
    idioma: string | null
    nivel: string | null
    tipoAula: string | null
    nomeGrupo: string | null
    tempoAulaMinutos?: number | null
  }
  teacher: { id: string; nome: string; linkSala?: string | null }
  record: {
    id: string
    book: string | null
    lastPage: string | null
    assignedHomework: string | null
    notesForStudent: string | null
  } | null
  lastRecord: {
    book: string | null
    lastPage: string | null
    assignedHomework: string | null
  } | null
}

interface ClassroomAccess {
  canJoin: boolean
  roomName: string | null
  roomPin: string | null
  windowStart: string
  windowEnd: string
  reason: string | null
}

// ——— Helpers ———
function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('pt-BR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
  })
}

function idiomaLabel(idioma: string | null): string {
  if (!idioma) return 'Aula'
  const u = idioma.toUpperCase()
  if (u === 'ENGLISH' || u === 'INGLES') return 'Inglês'
  if (u === 'SPANISH' || u === 'ESPANHOL') return 'Espanhol'
  return idioma
}

function idiomaFlag(idioma: string | null): string {
  if (!idioma) return '📚'
  const u = idioma.toUpperCase()
  if (u === 'ENGLISH' || u === 'INGLES') return '🇺🇸'
  if (u === 'SPANISH' || u === 'ESPANHOL') return '🇪🇸'
  return '📚'
}

// ——— Countdown ———
function CountdownTimer({ targetDate }: { targetDate: string }) {
  const [diff, setDiff] = useState(() => new Date(targetDate).getTime() - Date.now())

  useEffect(() => {
    const interval = setInterval(() => {
      setDiff(new Date(targetDate).getTime() - Date.now())
    }, 1000)
    return () => clearInterval(interval)
  }, [targetDate])

  if (diff <= 0) {
    return <span className="font-mono tabular-nums text-gray-600">Abrindo em breve...</span>
  }

  const totalSeconds = Math.floor(diff / 1000)
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60

  const parts: string[] = []
  if (hours > 0) parts.push(`${hours}h`)
  parts.push(`${minutes}m`)
  parts.push(`${seconds}s`)

  return (
    <span className="font-mono tabular-nums text-gray-800">
      {parts.join(' ')}
    </span>
  )
}

const REFRESH_INTERVAL_MS = 30_000

export default function AulaAlunoPage() {
  const router = useRouter()
  const params = useParams()
  const lessonId = typeof params?.id === 'string' ? params.id : ''

  const [lesson, setLesson] = useState<LessonData | null>(null)
  const [classroom, setClassroom] = useState<ClassroomAccess | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [now, setNow] = useState(() => Date.now())

  const fetchLesson = useCallback(async () => {
    if (!lessonId) return
    try {
      const res = await fetch(`/api/student/lessons/${lessonId}`, { credentials: 'include' })
      const json = await res.json()
      if (res.status === 401 || res.status === 403) {
        router.replace('/login')
        return
      }
      if (!res.ok || !json.ok) {
        setError(json.message || 'Erro ao carregar a aula')
        setLesson(null)
        setClassroom(null)
        return
      }
      setError(null)
      setLesson(json.data.lesson)
      setClassroom(json.data.classroom)
    } catch (e) {
      setError('Erro de conexão. Tente novamente.')
      setLesson(null)
      setClassroom(null)
    } finally {
      setLoading(false)
    }
  }, [lessonId, router])

  useEffect(() => {
    fetchLesson()
  }, [fetchLesson])

  useEffect(() => {
    const t = setInterval(fetchLesson, REFRESH_INTERVAL_MS)
    return () => clearInterval(t)
  }, [fetchLesson])

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])

  if (loading && !lesson) {
    return (
      <div className="flex items-center justify-center min-h-[300px]">
        <Loader2 className="w-10 h-10 animate-spin text-brand-orange" />
      </div>
    )
  }

  if (error && !lesson) {
    return (
      <div className="max-w-2xl mx-auto">
        <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
          <VideoOff className="w-16 h-16 mx-auto text-gray-400 mb-4" />
          <h1 className="text-xl font-bold text-gray-900 mb-2">Aula não encontrada</h1>
          <p className="text-gray-600 mb-6">{error}</p>
          <Link href="/dashboard-aluno/calendario">
            <Button variant="outline">Voltar ao calendário</Button>
          </Link>
        </div>
      </div>
    )
  }

  if (!lesson || !classroom) return null

  const windowStartTime = new Date(classroom.windowStart).getTime()
  const lessonStartTime = new Date(lesson.startAt).getTime()
  const lessonEndTime = lessonStartTime + (lesson.durationMinutes || 60) * 60 * 1000
  const minutesUntilStart = (lessonStartTime - now) / (1000 * 60)
  const canEnter = (minutesUntilStart <= 3 || now >= lessonStartTime) && now < lessonEndTime
  const lessonEnded = now >= lessonEndTime
  const showCountdown = !classroom.canJoin && now < windowStartTime

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-2 text-sm text-gray-600">
        <Link href="/dashboard-aluno" className="hover:text-brand-orange transition-colors">
          Início
        </Link>
        <ChevronRight className="w-4 h-4 text-gray-400" />
        <Link href="/dashboard-aluno/calendario" className="hover:text-brand-orange transition-colors">
          Calendário
        </Link>
        <ChevronRight className="w-4 h-4 text-gray-400" />
        <span className="text-gray-900 font-medium">Sala de Aula</span>
      </nav>

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            Aula de {idiomaLabel(lesson.enrollment.idioma)} {idiomaFlag(lesson.enrollment.idioma)}
          </h1>
          <p className="text-gray-600 mt-1">
            {formatDate(lesson.startAt)} · {formatTime(lesson.startAt)}
          </p>
        </div>
        <Link href="/dashboard-aluno/calendario">
          <Button variant="ghost" className="inline-flex items-center gap-2">
            <ArrowLeft className="w-4 h-4" />
            Voltar
          </Button>
        </Link>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Coluna principal */}
          <div className="lg:col-span-2">
            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2 mb-4">
                <Video className="w-5 h-5 text-brand-orange" />
                Sala de Aula Virtual
              </h2>

              {classroom.canJoin ? (
                <>
                  <div className="flex flex-col items-center text-center py-4">
                    <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mb-3">
                      <Video className="w-8 h-8 text-green-600" />
                    </div>
                    <p className="text-lg font-semibold text-gray-900">Sala disponível!</p>
                    <p className="text-gray-600 mt-1">Professor(a): {lesson.teacher.nome}</p>
                    {canEnter ? (
                      <a
                        href={lesson.teacher.linkSala || `https://meet.jit.si/${classroom.roomName}#config.prejoinPageEnabled=false`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-2 px-6 py-3 bg-brand-orange text-white font-semibold rounded-lg hover:bg-brand-orange-dark transition-colors shadow-sm mt-4"
                      >
                        <Video className="w-5 h-5" />
                        Entrar na Aula
                      </a>
                    ) : (
                      <div
                        className="inline-flex items-center gap-2 px-6 py-3 bg-brand-orange text-white font-semibold rounded-lg opacity-50 cursor-not-allowed shadow-sm mt-4"
                        aria-disabled
                      >
                        <Video className="w-5 h-5" />
                        {lessonEnded ? 'Aula encerrada' : `Disponível em ${Math.ceil(minutesUntilStart)} min`}
                      </div>
                    )}
                    <p className="text-xs text-gray-400 mt-3">
                      {lesson.teacher.linkSala ? 'A aula abrirá em uma nova aba do navegador' : 'A aula abrirá via Jitsi Meet em uma nova aba'}
                    </p>
                    <p className="text-sm text-gray-500 mt-2">
                      Certifique-se de permitir câmera e microfone no navegador.
                    </p>
                  </div>
                </>
              ) : (
                <>
                  <div className="flex flex-col items-center text-center py-4">
                    <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center mb-3">
                      <Clock className="w-8 h-8 text-gray-500" />
                    </div>
                    {classroom.reason && (
                      <p className="text-gray-700 font-medium">{classroom.reason}</p>
                    )}
                    {showCountdown && (
                      <p className="mt-3 text-lg">
                        Abertura em: <CountdownTimer targetDate={classroom.windowStart} />
                      </p>
                    )}
                    <p className="text-sm text-gray-500 mt-4">
                      A página será atualizada automaticamente quando a sala estiver disponível.
                    </p>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Sidebar */}
          <div className="space-y-4">
            {/* Professor */}
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <h3 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
                <User className="w-4 h-4" />
                Professor
              </h3>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-brand-orange/20 flex items-center justify-center text-brand-orange font-semibold">
                  {lesson.teacher.nome.charAt(0).toUpperCase()}
                </div>
                <span className="font-medium text-gray-900">{lesson.teacher.nome}</span>
              </div>
            </div>

            {/* Detalhes */}
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <h3 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
                <Calendar className="w-4 h-4" />
                Detalhes
              </h3>
              <ul className="space-y-2 text-sm text-gray-700">
                <li><strong>Idioma:</strong> {idiomaLabel(lesson.enrollment.idioma)}</li>
                <li>
                  <strong>Tipo:</strong>{' '}
                  {lesson.enrollment.tipoAula === 'GRUPO'
                    ? `Grupo${lesson.enrollment.nomeGrupo ? ` · ${lesson.enrollment.nomeGrupo}` : ''}`
                    : 'Particular'}
                </li>
                <li><strong>Duração:</strong> {lesson.durationMinutes} min</li>
              </ul>
            </div>

            {/* Última aula */}
            {lesson.lastRecord && (
              <div className="bg-white rounded-xl border border-orange-200 bg-orange-50 p-4">
                <h3 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
                  <BookOpen className="w-4 h-4" />
                  Última aula
                </h3>
                <ul className="space-y-2 text-sm text-gray-700">
                  <li><strong>Livro:</strong> {lesson.lastRecord.book || '—'}</li>
                  <li><strong>Página:</strong> {lesson.lastRecord.lastPage || '—'}</li>
                  {lesson.lastRecord.assignedHomework && (
                    <li className="pt-2 border-t border-orange-200">
                      <strong>Homework pendente:</strong>
                      <p className="mt-1 text-gray-600 whitespace-pre-wrap">{lesson.lastRecord.assignedHomework}</p>
                    </li>
                  )}
                </ul>
              </div>
            )}
          </div>
        </div>
    </div>
  )
}
