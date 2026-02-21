/**
 * Modal para designar aulas a um aluno recém-matriculado (já pagou).
 * Permite escolher data início, dias da semana, horário, professor e quantidade de repetições.
 */

'use client'

import { useState, useCallback } from 'react'
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

interface DesignarAulaModalProps {
  isOpen: boolean
  onClose: () => void
  enrollment: EnrollmentData | null
  onSuccess: () => void
}

export default function DesignarAulaModal({
  isOpen,
  onClose,
  enrollment,
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

  const toggleDia = (d: number) => {
    setDiasSelecionados((prev) => {
      if (prev.includes(d)) {
        const next = prev.filter((x) => x !== d)
        return next.length >= 1 ? next : prev
      }
      if (prev.length >= freq) return prev
      return [...prev, d].sort((a, b) => a - b)
    })
  }

  const buscarProfessores = useCallback(async () => {
    if (!enrollment) return
    setLoadingProfessores(true)
    setError(null)
    setProfessores([])
    setProfessorSelecionado(null)
    try {
      const dia = diasSelecionados[0] ?? 1
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
  }, [enrollment, diasSelecionados, dataInicio, horario, tempo])

  const designarAulas = useCallback(async () => {
    if (!enrollment || !professorSelecionado) return
    setSubmitting(true)
    setError(null)
    try {
      const startDate = new Date(dataInicio)
      const sortedDias = [...diasSelecionados].sort((a, b) => a - b)
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
              {DIAS_SEMANA.map((d) => (
                <label key={d.value} className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={diasSelecionados.includes(d.value)}
                    onChange={() => toggleDia(d.value)}
                    className="rounded border-gray-300"
                  />
                  <span className="text-sm">{d.label}</span>
                </label>
              ))}
            </div>
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
              disabled={loadingProfessores || diasSelecionados.length === 0}
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
                disabled={!professorSelecionado || submitting}
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
