/**
 * Controle de aulas de alunos bolsistas por período (nova guia a partir da lista de alunos).
 */

'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import AdminLayout from '@/components/admin/AdminLayout'
import Button from '@/components/ui/Button'
import Toast from '@/components/admin/Toast'
import { CalendarRange, Loader2, Award, Clock, CircleDollarSign } from 'lucide-react'
import { LESSON_STATUS_LABELS, type LessonStatusUi } from '@/lib/lesson-status'

function toInputDate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function defaultPeriod(): { from: string; to: string } {
  const now = new Date()
  const from = new Date(now.getFullYear(), now.getMonth(), 1)
  const to = new Date(now.getFullYear(), now.getMonth() + 1, 0)
  return { from: toInputDate(from), to: toInputDate(to) }
}

function dayStartLocal(ymd: string): Date {
  const [y, m, d] = ymd.split('-').map(Number)
  return new Date(y, m - 1, d, 0, 0, 0, 0)
}

function dayEndLocal(ymd: string): Date {
  const [y, m, d] = ymd.split('-').map(Number)
  return new Date(y, m - 1, d, 23, 59, 59, 999)
}

/** Mesma regra da lista de alunos (escola de matrícula). */
function escolaLabel(e: {
  escolaMatricula: string | null | undefined
  escolaMatriculaOutro: string | null | undefined
}): string {
  const m = e.escolaMatricula
  if (!m) return 'Sem escola'
  if (m === 'SEIDMANN') return 'Seidmann'
  if (m === 'YOUBECOME') return 'Youbecome'
  if (m === 'HIGHWAY') return 'Highway'
  if (m === 'OUTRO') return e.escolaMatriculaOutro?.trim() || 'Outro'
  return m
}

function formatMinutesAsHours(mins: number): string {
  if (mins <= 0) return '0 min'
  const h = Math.floor(mins / 60)
  const m = mins % 60
  if (h === 0) return `${m} min`
  if (m === 0) return `${h}h`
  return `${h}h ${String(m).padStart(2, '0')}min`
}

function formatMoney(n: number): string {
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

const ESCOLA_FILTRO_OPTIONS: { value: string; label: string }[] = [
  { value: 'TODAS', label: 'Todas as escolas' },
  { value: 'SEIDMANN', label: 'Seidmann' },
  { value: 'YOUBECOME', label: 'Youbecome' },
  { value: 'HIGHWAY', label: 'Highway' },
  { value: 'OUTRO', label: 'Outro (cadastro)' },
  { value: 'SEM_ESCOLA', label: 'Sem escola definida' },
]

interface LessonRow {
  id: string
  startAt: string
  durationMinutes: number
  status: string
  enrollment: {
    id: string
    nome: string
    bolsista: boolean
    escolaMatricula: string | null
    escolaMatriculaOutro: string | null
    tipoAula: string | null
    nomeGrupo: string | null
    paymentInfo: { valorHora: unknown } | null
  }
  teacher: { id: string; nome: string } | null
}

export default function ControleBolsistasPage() {
  const router = useRouter()
  const defaults = useMemo(() => defaultPeriod(), [])
  const [dateFrom, setDateFrom] = useState(defaults.from)
  const [dateTo, setDateTo] = useState(defaults.to)
  const [escolaFiltro, setEscolaFiltro] = useState<string>('TODAS')
  const [lessons, setLessons] = useState<LessonRow[]>([])
  const [loading, setLoading] = useState(true)
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null)
  const didInitialFetch = useRef(false)

  const fetchLessons = useCallback(async () => {
    const start = dayStartLocal(dateFrom)
    const end = dayEndLocal(dateTo)
    if (start.getTime() > end.getTime()) {
      setToast({ message: 'A data inicial não pode ser depois da data final.', type: 'error' })
      return
    }
    setLoading(true)
    setToast(null)
    try {
      const params = new URLSearchParams({
        start: start.toISOString(),
        end: end.toISOString(),
        bolsistaOnly: 'true',
        escola: escolaFiltro || 'TODAS',
      })
      const res = await fetch(`/api/admin/lessons?${params}`, { credentials: 'include' })
      const json = await res.json()
      if (res.status === 401 || res.status === 403) {
        router.push('/login?tab=admin')
        return
      }
      if (!res.ok || !json.ok) {
        setLessons([])
        setToast({ message: json.message || 'Erro ao carregar aulas', type: 'error' })
        return
      }
      setLessons(json.data?.lessons ?? [])
    } catch {
      setLessons([])
      setToast({ message: 'Erro ao carregar aulas', type: 'error' })
    } finally {
      setLoading(false)
    }
  }, [dateFrom, dateTo, escolaFiltro, router])

  useEffect(() => {
    if (didInitialFetch.current) return
    didInitialFetch.current = true
    void fetchLessons()
  }, [fetchLessons])

  const { totalMinutes, totalValorPeriodo, porEscola } = useMemo(() => {
    let totalMin = 0
    let totalValor = 0
    const map = new Map<string, { minutos: number; aulas: number; valor: number }>()
    for (const l of lessons) {
      const dm = l.durationMinutes ?? 0
      totalMin += dm
      const vhRaw = l.enrollment.paymentInfo?.valorHora
      const vh = vhRaw != null && vhRaw !== '' ? Number(vhRaw) : null
      const horas = dm / 60
      const linhaValor = vh != null && !Number.isNaN(vh) ? horas * vh : 0
      totalValor += linhaValor

      const label = escolaLabel(l.enrollment)
      const cur = map.get(label) ?? { minutos: 0, aulas: 0, valor: 0 }
      cur.minutos += dm
      cur.aulas += 1
      cur.valor += linhaValor
      map.set(label, cur)
    }
    const rows = [...map.entries()]
      .map(([escola, v]) => ({ escola, minutos: v.minutos, aulas: v.aulas, valor: Math.round(v.valor * 100) / 100 }))
      .sort((a, b) => {
        if (a.escola === 'Sem escola') return 1
        if (b.escola === 'Sem escola') return -1
        return a.escola.localeCompare(b.escola, 'pt-BR')
      })
    return {
      totalMinutes: totalMin,
      totalValorPeriodo: Math.round(totalValor * 100) / 100,
      porEscola: rows,
    }
  }, [lessons])

  const statusLabel = (s: string) =>
    LESSON_STATUS_LABELS[s as LessonStatusUi] ?? s

  const formatDateTime = (iso: string) => {
    const d = new Date(iso)
    return d.toLocaleString('pt-BR', {
      weekday: 'short',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-xl sm:text-2xl md:text-3xl font-bold text-gray-900 flex flex-wrap items-center gap-2">
            <Award className="w-8 h-8 text-amber-600 shrink-0" />
            Controle alunos bolsistas
          </h1>
          <p className="text-sm text-gray-600 mt-1">
            Defina o <strong>período</strong>, selecione a <strong>escola de matrícula</strong> e consulte as aulas dos bolsistas.
          </p>
        </div>

        <section className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 sm:p-5">
          <div className="flex flex-col gap-4">
            <div className="flex flex-col xl:flex-row xl:items-end gap-4 flex-wrap">
              <div className="flex flex-col sm:flex-row gap-4 flex-1 flex-wrap">
                <div>
                  <label htmlFor="bolsistas-de" className="block text-xs font-semibold text-gray-600 mb-1">
                    Data inicial
                  </label>
                  <input
                    id="bolsistas-de"
                    type="date"
                    value={dateFrom}
                    onChange={(e) => setDateFrom(e.target.value)}
                    className="rounded-lg border border-gray-300 px-3 py-2 text-sm w-full sm:w-auto min-w-[10rem]"
                  />
                </div>
                <div>
                  <label htmlFor="bolsistas-ate" className="block text-xs font-semibold text-gray-600 mb-1">
                    Data final
                  </label>
                  <input
                    id="bolsistas-ate"
                    type="date"
                    value={dateTo}
                    onChange={(e) => setDateTo(e.target.value)}
                    className="rounded-lg border border-gray-300 px-3 py-2 text-sm w-full sm:w-auto min-w-[10rem]"
                  />
                </div>
                <div className="min-w-[12rem] flex-1 sm:max-w-xs">
                  <label htmlFor="bolsistas-escola" className="block text-xs font-semibold text-gray-600 mb-1">
                    Escola de matrícula
                  </label>
                  <select
                    id="bolsistas-escola"
                    value={escolaFiltro}
                    onChange={(e) => setEscolaFiltro(e.target.value)}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm bg-white"
                  >
                    {ESCOLA_FILTRO_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <Button variant="primary" size="sm" onClick={() => void fetchLessons()} disabled={loading} className="shrink-0 w-full sm:w-auto">
                {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <CalendarRange className="w-4 h-4 mr-2" />}
                Aplicar filtros
              </Button>
            </div>
            <p className="text-xs text-gray-500">
              Período:{' '}
              <strong>
                {dayStartLocal(dateFrom).toLocaleDateString('pt-BR')} — {dayEndLocal(dateTo).toLocaleDateString('pt-BR')}
              </strong>
              {' · '}
              Escola:{' '}
              <strong>{ESCOLA_FILTRO_OPTIONS.find((o) => o.value === escolaFiltro)?.label ?? escolaFiltro}</strong>
            </p>
          </div>
        </section>

        <section aria-label="Resumo do período">
          <h2 className="text-base font-semibold text-gray-800 mb-3 sr-only">Resumo do período</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="rounded-xl border-2 border-amber-200 bg-amber-50 p-4 shadow-sm">
              <p className="text-xs font-semibold text-amber-800 uppercase tracking-wide flex items-center gap-2">
                <Clock className="w-4 h-4 shrink-0" />
                Total de horas por período
              </p>
              <p className="mt-2 text-2xl font-bold text-amber-900 tabular-nums min-h-[2rem] flex items-center">
                {loading ? <Loader2 className="w-7 h-7 animate-spin text-amber-600" aria-hidden /> : formatMinutesAsHours(totalMinutes)}
              </p>
              <p className="mt-1 text-xs text-amber-800/90">
                {loading ? 'Carregando…' : `Soma das durações das aulas listadas (${totalMinutes} min)`}
              </p>
            </div>
            <div className="rounded-xl border-2 border-emerald-200 bg-emerald-50 p-4 shadow-sm">
              <p className="text-xs font-semibold text-emerald-800 uppercase tracking-wide flex items-center gap-2">
                <CircleDollarSign className="w-4 h-4 shrink-0" />
                Valor total do período
              </p>
              <p className="mt-2 text-2xl font-bold text-emerald-900 tabular-nums min-h-[2rem] flex items-center">
                {loading ? (
                  <Loader2 className="w-7 h-7 animate-spin text-emerald-600" aria-hidden />
                ) : (
                  formatMoney(totalValorPeriodo)
                )}
              </p>
              <p className="mt-1 text-xs text-emerald-800/90">
                Σ (horas da aula × valor/hora do cadastro financeiro). Sem valor/hora cadastrado não entra no total.
              </p>
            </div>
          </div>
        </section>

        <section className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-200">
            <h2 className="text-base font-semibold text-gray-800">Aulas no período</h2>
            <p className="text-sm text-gray-600 mt-0.5">
              {loading ? 'Carregando…' : `${lessons.length} aula(s) encontrada(s)`}
            </p>
            {!loading && lessons.length > 0 && (
              <div className="mt-4">
                <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-2">Por escola (no resultado)</p>
                <ul className="flex flex-wrap gap-2">
                  {porEscola.map(({ escola, minutos, aulas, valor }) => (
                    <li
                      key={escola}
                      className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-800"
                    >
                      <span className="font-medium text-gray-900">{escola}</span>
                      <span className="text-gray-600"> — {aulas} aula(s) — </span>
                      <span className="font-semibold text-amber-900 tabular-nums">{formatMinutesAsHours(minutos)}</span>
                      <span className="text-gray-500 text-xs mx-1">·</span>
                      <span className="font-semibold text-emerald-800 tabular-nums">{formatMoney(valor)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
          <div className="overflow-x-auto max-h-[min(70vh,720px)] overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-gray-50 border-b border-gray-200 z-10">
                <tr>
                  <th className="text-left py-3 px-4 font-semibold text-gray-700">Data e hora</th>
                  <th className="text-left py-3 px-4 font-semibold text-gray-700">Aluno</th>
                  <th className="text-left py-3 px-4 font-semibold text-gray-700">Escola</th>
                  <th className="text-left py-3 px-4 font-semibold text-gray-700">Tipo</th>
                  <th className="text-left py-3 px-4 font-semibold text-gray-700">Professor</th>
                  <th className="text-right py-3 px-4 font-semibold text-gray-700">Duração</th>
                  <th className="text-left py-3 px-4 font-semibold text-gray-700">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {!loading && lessons.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-12 text-center text-gray-500">
                      Nenhuma aula neste intervalo e filtros. Ajuste o período, a escola ou verifique o calendário.
                    </td>
                  </tr>
                ) : loading ? (
                  <tr>
                    <td colSpan={7} className="py-12 text-center text-gray-500">
                      <Loader2 className="w-8 h-8 animate-spin inline text-brand-orange" />
                    </td>
                  </tr>
                ) : (
                  lessons.map((l) => {
                    const e = l.enrollment
                    const nomeAluno =
                      e.tipoAula === 'GRUPO' && e.nomeGrupo?.trim()
                        ? `${e.nome} (${e.nomeGrupo})`
                        : e.nome
                    return (
                      <tr key={l.id} className="hover:bg-amber-50/40">
                        <td className="py-2.5 px-4 whitespace-nowrap text-gray-900">{formatDateTime(l.startAt)}</td>
                        <td className="py-2.5 px-4 text-gray-900">{nomeAluno}</td>
                        <td className="py-2.5 px-4 text-gray-700">{escolaLabel(e)}</td>
                        <td className="py-2.5 px-4 text-gray-700">
                          {e.tipoAula === 'GRUPO' ? 'Grupo' : e.tipoAula === 'PARTICULAR' ? 'Particular' : e.tipoAula ?? '—'}
                        </td>
                        <td className="py-2.5 px-4 text-gray-700">{l.teacher?.nome ?? '—'}</td>
                        <td className="py-2.5 px-4 text-right text-gray-700 tabular-nums">{l.durationMinutes} min</td>
                        <td className="py-2.5 px-4 text-gray-700">{statusLabel(l.status)}</td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
        </section>

        {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
      </div>
    </AdminLayout>
  )
}
