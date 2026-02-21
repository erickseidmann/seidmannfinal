/**
 * Modal para designar aulas a um aluno recém-matriculado (já pagou).
 * Permite escolher data início, dias da semana, horário, professor e quantidade de repetições.
 */

'use client'

import { useState, useCallback, useMemo, useEffect, useRef } from 'react'
import Modal from './Modal'

const DIAS_SEMANA = [
  { value: 1, label: 'Segunda' },
  { value: 2, label: 'Terça' },
  { value: 3, label: 'Quarta' },
  { value: 4, label: 'Quinta' },
  { value: 5, label: 'Sexta' },
  { value: 6, label: 'Sábado' },
] as const

const HORARIOS = [
  { value: 480, label: '8h' },
  { value: 540, label: '9h' },
  { value: 600, label: '10h' },
  { value: 660, label: '11h' },
  { value: 840, label: '14h' },
  { value: 900, label: '15h' },
  { value: 960, label: '16h' },
  { value: 1020, label: '17h' },
  { value: 1080, label: '18h' },
  { value: 1140, label: '19h' },
] as const

interface EnrollmentData {
  id: string
  nome: string
  frequenciaSemanal?: number | null
  tempoAulaMinutos?: number | null
}

export interface CorrectionData {
  existingLessonTimes: string[]
  expected: number
  actual: number
}

interface DesignarAulaModalProps {
  isOpen: boolean
  onClose: () => void
  enrollment: EnrollmentData | null
  correctionData?: CorrectionData | null
  onSuccess: () => void
}

function formatLessonDateTime(isoStr: string): string {
  const d = new Date(isoStr)
  const weekday = d.toLocaleDateString('pt-BR', { weekday: 'short' })
  const date = d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
  const time = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
  return `${weekday} ${date} às ${time}`
}

export default function DesignarAulaModal({
  isOpen,
  onClose,
  enrollment,
  correctionData,
  onSuccess,
}: DesignarAulaModalProps) {
  const hoje = new Date()
  const amanha = new Date(hoje)
  amanha.setDate(amanha.getDate() + 1)

  const [dataInicio, setDataInicio] = useState(amanha.toISOString().slice(0, 10))
  const [diasSelecionados, setDiasSelecionados] = useState<number[]>([1, 5])
  const [horario, setHorario] = useState(540)
  const [quantidadeSemanas, setQuantidadeSemanas] = useState(4)
  const [professores, setProfessores] = useState<{ id: string; nome: string }[]>([])
  const [professorSelecionado, setProfessorSelecionado] = useState<string | null>(null)
  const [loadingProfessores, setLoadingProfessores] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const freq = enrollment?.frequenciaSemanal ?? 2
  const tempo = enrollment?.tempoAulaMinutos ?? 60

  // Dias já agendados (modo correção): extraídos das aulas existentes
  const diasJaAgendados = useMemo(() => {
    if (!correctionData?.existingLessonTimes?.length) return []
    const set = new Set<number>()
    for (const isoStr of correctionData.existingLessonTimes) {
      const d = new Date(isoStr)
      const day = d.getDay() // 0=Dom, 1=Seg, ..., 6=Sab
      if (day >= 1 && day <= 6) set.add(day)
    }
    return [...set].sort((a, b) => a - b)
  }, [correctionData])

  // Dias que vamos adicionar (exclui os já agendados)
  const diasParaAdicionar = useMemo(
    () => diasSelecionados.filter((d) => !diasJaAgendados.includes(d)),
    [diasSelecionados, diasJaAgendados]
  )

  const inicializouDias = useRef(false)
  useEffect(() => {
    if (!isOpen) {
      inicializouDias.current = false
      return
    }
    if (inicializouDias.current) return
    if (correctionData?.existingLessonTimes?.length && diasJaAgendados.length > 0) {
      setDiasSelecionados(diasJaAgendados)
    } else if (!correctionData) {
      setDiasSelecionados([1, 5])
    }
    inicializouDias.current = true
  }, [isOpen, correctionData, diasJaAgendados])

  const toggleDia = (d: number) => {
    if (diasJaAgendados.includes(d)) return // não permite desmarcar dias já agendados
    setDiasSelecionados((prev) => {
      if (prev.includes(d)) {
        const next = prev.filter((x) => x !== d)
        return next.length >= 1 ? next : prev
      }
      const maxNovos = freq - diasJaAgendados.length
      const countNovos = prev.filter((x) => !diasJaAgendados.includes(x)).length
      if (countNovos >= maxNovos) return prev
      return [...prev, d].sort((a, b) => a - b)
    })
  }

  const diaParaBusca = diasParaAdicionar.length > 0 ? diasParaAdicionar[0] : diasSelecionados[0] ?? 1

  const buscarProfessores = useCallback(async () => {
    if (!enrollment) return
    setLoadingProfessores(true)
    setError(null)
    setProfessores([])
    setProfessorSelecionado(null)
    try {
      const dia = diaParaBusca
      const startDate = new Date(dataInicio)
      const startDateAdjusted = new Date(startDate)
      let diasToAdd = (dia - startDateAdjusted.getDay() + 7) % 7
      if (dia === 0 && startDateAdjusted.getDay() === 0) diasToAdd = 0
      else if (startDateAdjusted.getDay() === 0) diasToAdd = dia
      startDateAdjusted.setDate(startDateAdjusted.getDate() + diasToAdd)
      startDateAdjusted.setHours(Math.floor(horario / 60), horario % 60, 0, 0)

      const params = new URLSearchParams({
        enrollmentId: enrollment.id,
        dayOfWeek: String(dia),
        startMinutes: String(horario),
        durationMinutes: String(tempo),
        startDate: startDateAdjusted.toISOString(),
      })
      const res = await fetch(`/api/admin/teachers-available?${params}`, { credentials: 'include' })
      const json = await res.json()
      if (json.ok && Array.isArray(json.data)) {
        setProfessores(json.data)
      }
    } catch (e) {
      setError('Erro ao buscar professores')
    } finally {
      setLoadingProfessores(false)
    }
  }, [enrollment, diaParaBusca, dataInicio, horario, tempo])

  const designarAulas = useCallback(async () => {
    if (!enrollment || !professorSelecionado) return
    const diasACriar = diasParaAdicionar.length > 0 ? [...diasParaAdicionar].sort((a, b) => a - b) : [...diasSelecionados].sort((a, b) => a - b)
    if (diasACriar.length === 0) return
    setSubmitting(true)
    setError(null)
    try {
      const startDate = new Date(dataInicio)
      const sortedDias = diasACriar
      const primeiroDia = sortedDias[0]
      const segundoDia = sortedDias[1]

      let firstDate = new Date(startDate)
      let diff = (primeiroDia - firstDate.getDay() + 7) % 7
      if (firstDate.getDay() === 0) diff = primeiroDia === 0 ? 0 : primeiroDia
      firstDate.setDate(firstDate.getDate() + diff)
      firstDate.setHours(Math.floor(horario / 60), horario % 60, 0, 0)

      const body: Record<string, unknown> = {
        enrollmentId: enrollment.id,
        teacherId: professorSelecionado,
        startAt: firstDate.toISOString(),
        durationMinutes: tempo,
        repeatFrequencyEnabled: true,
        repeatFrequencyWeeks: quantidadeSemanas,
      }

      if (segundoDia != null && segundoDia !== primeiroDia) {
        let secondDate = new Date(startDate)
        let diff2 = (segundoDia - secondDate.getDay() + 7) % 7
        if (secondDate.getDay() === 0) diff2 = segundoDia === 0 ? 0 : segundoDia
        secondDate.setDate(secondDate.getDate() + diff2)
        secondDate.setHours(Math.floor(horario / 60), horario % 60, 0, 0)
        body.repeatSameWeek = true
        body.repeatSameWeekStartAt = secondDate.toISOString()
      }

      if (sortedDias.length > 2) {
        for (let i = 2; i < sortedDias.length; i++) {
          const d = sortedDias[i]
          let extraDate = new Date(startDate)
          let diffExtra = (d - extraDate.getDay() + 7) % 7
          if (extraDate.getDay() === 0) diffExtra = d === 0 ? 0 : d
          extraDate.setDate(extraDate.getDate() + diffExtra)
          extraDate.setHours(Math.floor(horario / 60), horario % 60, 0, 0)
          const resExtra = await fetch('/api/admin/lessons', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({
              enrollmentId: enrollment.id,
              teacherId: professorSelecionado,
              startAt: extraDate.toISOString(),
              durationMinutes: tempo,
              repeatWeeks: quantidadeSemanas,
            }),
          })
          const jsonExtra = await resExtra.json()
          if (!jsonExtra.ok) throw new Error(jsonExtra.message || 'Erro ao criar aulas')
        }
      }

      const res = await fetch('/api/admin/lessons', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(body),
      })
      const json = await res.json()
      if (!json.ok) throw new Error(json.message || 'Erro ao criar aulas')

      await fetch(`/api/admin/enrollments/${enrollment.id}/marcar-aulas-adicionadas`, {
        method: 'PATCH',
        credentials: 'include',
      })

      onSuccess()
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao designar aulas')
    } finally {
      setSubmitting(false)
    }
  }, [
    enrollment,
    professorSelecionado,
    dataInicio,
    diasSelecionados,
    diasParaAdicionar,
    horario,
    tempo,
    quantidadeSemanas,
    onSuccess,
    onClose,
  ])

  const handleClose = () => {
    setProfessores([])
    setProfessorSelecionado(null)
    setError(null)
    onClose()
  }

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title={`Designar aula – ${enrollment?.nome ?? ''}`} size="lg">
      {!enrollment ? (
        <p className="text-gray-500">Nenhum aluno selecionado.</p>
      ) : (
        <div className="space-y-4">
          <p className="text-sm text-gray-600">
            Configure as aulas para <strong>{enrollment.nome}</strong>. Frequência e tempo vêm da matrícula.
          </p>

          {correctionData && correctionData.existingLessonTimes.length > 0 && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-4 space-y-2">
              <p className="text-sm font-medium text-red-800">Já agendado nesta semana:</p>
              <ul className="space-y-1">
                {correctionData.existingLessonTimes.map((isoStr, idx) => (
                  <li key={idx} className="text-sm text-red-700 font-medium">
                    {formatLessonDateTime(isoStr)}
                  </li>
                ))}
              </ul>
              {(correctionData.expected - correctionData.actual) > 0 ? (
                <p className="text-sm text-red-800">
                  Faltam <strong>{correctionData.expected - correctionData.actual}</strong> aula{(correctionData.expected - correctionData.actual) !== 1 ? 's' : ''} para agendar.
                </p>
              ) : (correctionData.expected - correctionData.actual) < 0 ? (
                <p className="text-sm text-red-800">
                  Excesso de <strong>{correctionData.actual - correctionData.expected}</strong> {(correctionData.actual - correctionData.expected) === 1 ? 'aula agendada' : 'aulas agendadas'}.
                </p>
              ) : null}
            </div>
          )}

          {correctionData && correctionData.existingLessonTimes.length === 0 && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-4">
              <p className="text-sm text-red-800">
                Nenhuma aula agendada nesta semana. Faltam <strong>{correctionData.expected}</strong> aula{correctionData.expected !== 1 ? 's' : ''} para agendar.
              </p>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Data de início</label>
              <input
                type="date"
                value={dataInicio}
                onChange={(e) => setDataInicio(e.target.value)}
                min={amanha.toISOString().slice(0, 10)}
                className="input w-full"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Repetir por (semanas)</label>
              <select
                value={quantidadeSemanas}
                onChange={(e) => setQuantidadeSemanas(Number(e.target.value))}
                className="input w-full"
              >
                {[2, 4, 6, 8, 12, 16, 24].map((n) => (
                  <option key={n} value={n}>
                    {n} semanas
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex gap-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Frequência (matrícula)</label>
              <p className="text-gray-600">{freq}x por semana</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Tempo de aula (matrícula)</label>
              <p className="text-gray-600">{tempo} min</p>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Dias da semana</label>
            <div className="flex flex-wrap gap-2">
              {DIAS_SEMANA.map((d) => {
                const jaAgendado = diasJaAgendados.includes(d.value)
                return (
                  <label
                    key={d.value}
                    className={`flex items-center gap-2 rounded px-2 py-1 ${
                      jaAgendado ? 'cursor-default bg-amber-100' : 'cursor-pointer hover:bg-gray-50'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={diasSelecionados.includes(d.value)}
                      onChange={() => toggleDia(d.value)}
                      disabled={jaAgendado}
                      className={`rounded border-gray-300 ${jaAgendado ? 'accent-amber-600' : ''}`}
                    />
                    <span className={`text-sm ${jaAgendado ? 'text-amber-800 font-medium' : 'text-gray-700'}`}>
                      {d.label}
                    </span>
                  </label>
                )
              })}
            </div>
            {diasJaAgendados.length > 0 && (
              <p className="mt-1.5 text-xs text-amber-700">
                Dias em amarelo já estão agendados e não serão alterados. Selecione os dias que faltam.
              </p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Horário</label>
            <select
              value={horario}
              onChange={(e) => setHorario(Number(e.target.value))}
              className="input w-full max-w-[140px]"
            >
              {HORARIOS.map((h) => (
                <option key={h.value} value={h.value}>
                  {h.label}
                </option>
              ))}
            </select>
          </div>

          <div className="pt-2">
            <button
              type="button"
              onClick={buscarProfessores}
              disabled={
                loadingProfessores ||
                diasSelecionados.length === 0 ||
                (diasJaAgendados.length > 0 && diasParaAdicionar.length === 0)
              }
              className="px-4 py-2 bg-sky-600 text-white rounded-lg text-sm font-medium hover:bg-sky-700 disabled:opacity-50"
            >
              {loadingProfessores ? 'Buscando...' : 'Buscar professores disponíveis'}
            </button>
          </div>

          {professores.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Professores disponíveis</label>
              <div className="flex flex-wrap gap-2">
                {professores.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setProfessorSelecionado(professorSelecionado === p.id ? null : p.id)}
                    className={`px-3 py-1.5 rounded-lg text-sm font-medium transition ${
                      professorSelecionado === p.id
                        ? 'bg-brand-orange text-white'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    {p.nome}
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={designarAulas}
                disabled={
                  !professorSelecionado ||
                  submitting ||
                  (diasJaAgendados.length > 0 && diasParaAdicionar.length === 0)
                }
                className="mt-4 px-6 py-2 bg-emerald-600 text-white rounded-lg text-sm font-semibold hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {submitting ? 'Designando...' : 'Designar aulas para o professor'}
              </button>
            </div>
          )}

          {error && (
            <p className="text-sm text-red-600 bg-red-50 p-2 rounded">{error}</p>
          )}
        </div>
      )}
    </Modal>
  )
}
