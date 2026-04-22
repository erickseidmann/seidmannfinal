'use client'

import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react'
import AdminLayout from '@/components/admin/AdminLayout'
import Table, { Column } from '@/components/admin/Table'
import Button from '@/components/ui/Button'
import Toast from '@/components/admin/Toast'
import { Calendar, ChevronDown, ChevronRight, Download, Save, Trash2, Upload } from 'lucide-react'
import {
  extractTipoMovimentacao as extractTipo,
  isCreditoComoNaTelaMovimentacoes,
  dedupeLinhasMovimentacaoParaSoma,
} from '@/lib/admin-movimentacao'
import { buildMovimentacaoNomeFromCategoria } from '@/lib/movimentacao-categoria-nome'
import { normalizarIdentificacaoMovimentacao, type MovimentacaoIdentRegraApi } from '@/lib/movimentacao-ident-regra'

const MESES_LABELS: Record<number, string> = {
  1: 'Janeiro', 2: 'Fevereiro', 3: 'Março', 4: 'Abril', 5: 'Maio', 6: 'Junho',
  7: 'Julho', 8: 'Agosto', 9: 'Setembro', 10: 'Outubro', 11: 'Novembro', 12: 'Dezembro',
}
const MESES_ABREV: Record<number, string> = {
  1: 'Jan', 2: 'Fev', 3: 'Mar', 4: 'Abr', 5: 'Mai', 6: 'Jun',
  7: 'Jul', 8: 'Ago', 9: 'Set', 10: 'Out', 11: 'Nov', 12: 'Dez',
}
const ANOS_DISPONIVEIS = Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - 2 + i)

type MovTipo = 'SAIDA' | 'ENTRADA'

interface ExpenseRow {
  id: string
  name: string
  description: string | null
  valor: number
  year: number
  month: number
  paymentStatus?: string | null
  fixedSeriesId?: string | null
}

interface BankExtratoItem {
  id: string
  originalFilename: string
  fileUrl: string
  criadoEm?: string
  sizeBytes?: number | null
}

interface EditableRow {
  id: string
  tipo: MovTipo
  categoriaPrincipal: string
  subcategoria: string
  categoriaOutro: string
}

interface ExtratoMeta {
  banco: string
  data: string
  transacao: string
  tipoTransacao: string
  identificacao: string
  detalheLivre: string
}

const ENTRADA_CATEGORIAS = [
  { value: 'ALUNO', label: 'Aluno' },
  { value: 'LIVRO', label: 'Livro' },
  { value: 'OUTRO', label: 'Outro' },
] as const

const SAIDA_CATEGORIAS = [
  { value: 'PAG_PROFESSOR', label: 'Pag Professor' },
  { value: 'ADM', label: 'ADM' },
  { value: 'INFRAESTRUTURA', label: 'Infraestrutura' },
  { value: 'SISTEMA', label: 'Sistema' },
  { value: 'ADIANTAMENTO', label: 'Adiantamento' },
  { value: 'BANCO', label: 'Banco' },
  { value: 'DEVOLUCAO', label: 'Devolução' },
  { value: 'REPASSE', label: 'Repasse' },
] as const

const INFRA_SUBS = [
  { value: 'ALUGUEL', label: 'Aluguel' },
  { value: 'INTERNET', label: 'Internet' },
  { value: 'SISTEMA', label: 'Sistema' },
  { value: 'LUZ', label: 'Luz' },
  { value: 'AGUA', label: 'Água' },
  { value: 'OUTRO', label: 'Outro' },
] as const

const BANCO_SUBS = [
  { value: 'CORA', label: 'Cora' },
  { value: 'INFINITE_PAY', label: 'Infinite Pay' },
  { value: 'BANCO_DO_BRASIL', label: 'Banco do Brasil' },
  { value: 'ITAU', label: 'Itaú' },
  { value: 'OUTRO', label: 'Outro' },
] as const

function formatMoney(n: number): string {
  return `R$ ${Number(n).toFixed(2).replace('.', ',')}`
}

function formatBytes(bytes: number | null | undefined): string {
  if (!bytes || bytes <= 0) return '—'
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
  return `${(bytes / 1024).toFixed(1)} KB`
}

function formatDateTime(iso: string | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleString('pt-BR')
}

function extractMarker(description: string | null, marker: string): string {
  if (!description) return ''
  const m = description.match(new RegExp(`\\[${marker}:([^\\]]+)\\]`, 'i'))
  return m?.[1]?.trim() || ''
}

function parseExtratoMeta(description: string | null): ExtratoMeta {
  const markerTransacao = extractMarker(description, 'TRANSACAO')
  const markerIdentificacao = extractMarker(description, 'IDENTIFICACAO')
  const markerData = extractMarker(description, 'DATA')
  const markerTipoTransacao = extractMarker(description, 'TIPO_TRANSACAO')
  const markerBanco = extractMarker(description, 'BANCO')

  const cleaned = (description || '')
    .replace(/\[TIPO:(ENTRADA|SAIDA)\]\s*/gi, '')
    .replace(/\[BANCO:[^\]]+\]\s*/gi, '')
    .replace(/\[DATA:[^\]]+\]\s*/gi, '')
    .replace(/\[TRANSACAO:[^\]]+\]\s*/gi, '')
    .replace(/\[TIPO_TRANSACAO:[^\]]+\]\s*/gi, '')
    .replace(/\[IDENTIFICACAO:[^\]]+\]\s*/gi, '')
    .trim()

  // Fallback para linhas antigas/sem marcadores:
  // tenta extrair "Transação · Identificação" do texto livre.
  const parts = cleaned
    .split('·')
    .map((p) => p.trim())
    .filter(Boolean)
  const fallbackTransacao = parts[0] || ''
  const fallbackIdentificacao = parts.length > 1 ? parts[1] : ''

  return {
    banco: markerBanco,
    data: markerData,
    transacao: markerTransacao || fallbackTransacao,
    tipoTransacao: markerTipoTransacao,
    identificacao: markerIdentificacao || fallbackIdentificacao,
    detalheLivre: cleaned,
  }
}

function buildDescription(nextTipo: MovTipo, currentDescription: string | null): string | null {
  const cleaned = (currentDescription || '')
    .replace(/\[TIPO:(ENTRADA|SAIDA)\]\s*/g, '')
    .trim()
  const prefix = `[TIPO:${nextTipo}]`
  return cleaned ? `${prefix} ${cleaned}` : prefix
}

function parseCategoriaFromName(name: string, tipo: MovTipo): Omit<EditableRow, 'id' | 'tipo'> {
  const raw = name.trim()
  const normalized = raw
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
  if (tipo === 'ENTRADA') {
    if (normalized.includes('livro')) return { categoriaPrincipal: 'LIVRO', subcategoria: '', categoriaOutro: '' }
    if (normalized.includes('aluno')) return { categoriaPrincipal: 'ALUNO', subcategoria: '', categoriaOutro: '' }
    return { categoriaPrincipal: 'OUTRO', subcategoria: '', categoriaOutro: raw }
  }
  if (normalized.includes('prof')) return { categoriaPrincipal: 'PAG_PROFESSOR', subcategoria: '', categoriaOutro: '' }
  if (normalized === 'adm' || normalized.includes('administr')) return { categoriaPrincipal: 'ADM', subcategoria: '', categoriaOutro: '' }
  if (normalized.includes('adiant')) return { categoriaPrincipal: 'ADIANTAMENTO', subcategoria: '', categoriaOutro: '' }
  if (normalized.includes('devol')) return { categoriaPrincipal: 'DEVOLUCAO', subcategoria: '', categoriaOutro: '' }
  if (normalized.includes('repasse')) return { categoriaPrincipal: 'REPASSE', subcategoria: '', categoriaOutro: '' }
  if (normalized.includes('banco') || normalized.includes('cora') || normalized.includes('itau') || normalized.includes('infinite')) {
    let sub = 'OUTRO'
    if (normalized.includes('cora')) sub = 'CORA'
    else if (normalized.includes('infinite')) sub = 'INFINITE_PAY'
    else if (normalized.includes('brasil')) sub = 'BANCO_DO_BRASIL'
    else if (normalized.includes('itau')) sub = 'ITAU'
    return { categoriaPrincipal: 'BANCO', subcategoria: sub, categoriaOutro: sub === 'OUTRO' ? raw : '' }
  }
  if (
    normalized.includes('aluguel') ||
    normalized.includes('internet') ||
    normalized.includes('luz') ||
    normalized.includes('agua') ||
    normalized.includes('sistema')
  ) {
    let sub = 'OUTRO'
    if (normalized.includes('aluguel')) sub = 'ALUGUEL'
    else if (normalized.includes('internet')) sub = 'INTERNET'
    else if (normalized.includes('luz')) sub = 'LUZ'
    else if (normalized.includes('agua')) sub = 'AGUA'
    else if (normalized.includes('sistema')) sub = 'SISTEMA'
    return { categoriaPrincipal: 'INFRAESTRUTURA', subcategoria: sub, categoriaOutro: sub === 'OUTRO' ? raw : '' }
  }
  return { categoriaPrincipal: 'INFRAESTRUTURA', subcategoria: 'OUTRO', categoriaOutro: raw || 'Outro' }
}

function resolveEditableCategorias(
  row: ExpenseRow,
  tipo: MovTipo,
  regraMap: Map<string, MovimentacaoIdentRegraApi>
): Omit<EditableRow, 'id' | 'tipo'> {
  const ident = parseExtratoMeta(row.description).identificacao?.trim()
  if (ident) {
    const chave = normalizarIdentificacaoMovimentacao(ident)
    if (chave) {
      const regra = regraMap.get(`${tipo}::${chave}`)
      if (regra) {
        return {
          categoriaPrincipal: regra.categoriaPrincipal,
          subcategoria: regra.subcategoria,
          categoriaOutro: regra.categoriaOutro,
        }
      }
    }
  }
  return parseCategoriaFromName(row.name, tipo)
}

function isCategoriaValida(row: EditableRow): boolean {
  if (row.tipo === 'ENTRADA') {
    if (!row.categoriaPrincipal) return false
    if (row.categoriaPrincipal === 'OUTRO') return Boolean(row.categoriaOutro.trim())
    return true
  }
  if (!row.categoriaPrincipal) return false
  if (row.categoriaPrincipal === 'INFRAESTRUTURA' || row.categoriaPrincipal === 'BANCO') {
    if (!row.subcategoria) return false
    if (row.subcategoria === 'OUTRO') return Boolean(row.categoriaOutro.trim())
  }
  return true
}

export default function FinanceiroMovimentacaoPage() {
  const anoAtual = new Date().getFullYear()
  const mesAtual = new Date().getMonth() + 1
  const [selectedAno, setSelectedAno] = useState<number>(anoAtual)
  const [selectedMes, setSelectedMes] = useState<number>(mesAtual)
  const [showPeriodo, setShowPeriodo] = useState(true)

  const [expenses, setExpenses] = useState<ExpenseRow[]>([])
  const [loading, setLoading] = useState(true)
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null)

  const [extratos, setExtratos] = useState<BankExtratoItem[]>([])
  const [extratosLoading, setExtratosLoading] = useState(false)
  const [extratoUploading, setExtratoUploading] = useState(false)
  const [extratoDownloading, setExtratoDownloading] = useState(false)
  const [savingId, setSavingId] = useState<string | null>(null)
  const [savingSelected, setSavingSelected] = useState(false)
  const [editable, setEditable] = useState<Record<string, EditableRow>>({})
  const [originalEditable, setOriginalEditable] = useState<Record<string, EditableRow>>({})
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [removingBatch, setRemovingBatch] = useState(false)
  const [removeProgress, setRemoveProgress] = useState(0)
  const [removeDone, setRemoveDone] = useState(0)
  const [removeTotal, setRemoveTotal] = useState(0)
  const [movementFilter, setMovementFilter] = useState<'TODAS' | 'ENTRADA' | 'SAIDA'>('TODAS')
  const [selectedBank, setSelectedBank] = useState('')
  const [otherBank, setOtherBank] = useState('')
  const extratoInputRef = useRef<HTMLInputElement | null>(null)
  const [identRegras, setIdentRegras] = useState<MovimentacaoIdentRegraApi[]>([])
  const [showRegrasIdent, setShowRegrasIdent] = useState(false)
  const [savingRegraForId, setSavingRegraForId] = useState<string | null>(null)
  const [deletingRegraId, setDeletingRegraId] = useState<string | null>(null)

  const identRegraMap = useMemo(() => {
    const m = new Map<string, MovimentacaoIdentRegraApi>()
    for (const r of identRegras) {
      m.set(`${r.movTipo}::${r.identificacaoChave}`, r)
    }
    return m
  }, [identRegras])

  const fetchData = useCallback(async (ano: number, mes: number) => {
    setLoading(true)
    try {
      const [adminRes, regrasRes] = await Promise.all([
        fetch(`/api/admin/financeiro/administracao?year=${ano}&month=${mes}`, { credentials: 'include' }),
        fetch('/api/admin/financeiro/movimentacao-ident-regras', { credentials: 'include' }),
      ])
      const json = await adminRes.json()
      const regrasJson = await regrasRes.json().catch(() => ({ ok: false as const }))
      const regraItems: MovimentacaoIdentRegraApi[] =
        regrasJson.ok && regrasJson.data?.items ? regrasJson.data.items : []
      setIdentRegras(regraItems)
      const regraPorChave = new Map<string, MovimentacaoIdentRegraApi>()
      for (const r of regraItems) {
        regraPorChave.set(`${r.movTipo}::${r.identificacaoChave}`, r)
      }
      if (!adminRes.ok || !json.ok) {
        setExpenses([])
        return
      }
      const rows: ExpenseRow[] = json.data?.expenses ?? []
      setExpenses(rows)
      const mapped: Record<string, EditableRow> = {}
      rows.forEach((r) => {
        const tipo = extractTipo(r.description)
        const parsed = resolveEditableCategorias(r, tipo, regraPorChave)
        mapped[r.id] = {
          id: r.id,
          tipo,
          categoriaPrincipal: parsed.categoriaPrincipal,
          subcategoria: parsed.subcategoria,
          categoriaOutro: parsed.categoriaOutro,
        }
      })
      setEditable(mapped)
      setOriginalEditable(mapped)
      setSelectedIds((prev) => prev.filter((id) => rows.some((r) => r.id === id)))
    } catch {
      setExpenses([])
    } finally {
      setLoading(false)
    }
  }, [])

  const fetchExtratos = useCallback(async (ano: number, mes: number) => {
    setExtratosLoading(true)
    try {
      const res = await fetch(
        `/api/admin/financeiro/administracao/bank-extratos?year=${ano}&month=${mes}`,
        { credentials: 'include' }
      )
      const json = await res.json()
      if (!res.ok || !json.ok) {
        setExtratos([])
        return
      }
      setExtratos(json.data?.items ?? [])
    } catch {
      setExtratos([])
    } finally {
      setExtratosLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchData(selectedAno, selectedMes)
    fetchExtratos(selectedAno, selectedMes)
  }, [selectedAno, selectedMes, fetchData, fetchExtratos])

  const movimentacoes = useMemo(() => {
    const rows = expenses.filter((e) => e.year === selectedAno && e.month === selectedMes)
    if (movementFilter === 'TODAS') return rows
    return rows.filter((row) => {
      const editableTipo = editable[row.id]?.tipo ?? null
      const credito = isCreditoComoNaTelaMovimentacoes(row.description, editableTipo)
      if (movementFilter === 'ENTRADA') return credito
      return !credito
    })
  }, [expenses, selectedAno, selectedMes, movementFilter, editable])

  const totaisEntradasSaidas = useMemo(() => {
    const rows = expenses.filter((e) => e.year === selectedAno && e.month === selectedMes)
    const rowsUnicas = dedupeLinhasMovimentacaoParaSoma(rows)
    let entradas = 0
    let saidas = 0
    for (const row of rowsUnicas) {
      const editableTipo = editable[row.id]?.tipo ?? null
      const v = Number(row.valor)
      if (isCreditoComoNaTelaMovimentacoes(row.description, editableTipo)) entradas += v
      else saidas += v
    }
    return {
      entradas: Math.round(entradas * 100) / 100,
      saidas: Math.round(saidas * 100) / 100,
    }
  }, [expenses, selectedAno, selectedMes, editable])

  const allSelectedOnScreen =
    movimentacoes.length > 0 && movimentacoes.every((m) => selectedIds.includes(m.id))
  const dirtyIds = useMemo(() => {
    const ids: string[] = []
    Object.keys(editable).forEach((id) => {
      const current = editable[id]
      const original = originalEditable[id]
      if (!current || !original) return
      if (
        current.tipo !== original.tipo ||
        current.categoriaPrincipal !== original.categoriaPrincipal ||
        current.subcategoria !== original.subcategoria ||
        current.categoriaOutro.trim() !== original.categoriaOutro.trim()
      ) {
        ids.push(id)
      }
    })
    return ids
  }, [editable, originalEditable])
  const selectedDirtyIds = useMemo(
    () => selectedIds.filter((id) => dirtyIds.includes(id)),
    [selectedIds, dirtyIds]
  )

  const handleExtratoFileSelected = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (!selectedBank) {
      setToast({ message: 'Selecione o banco antes de importar o extrato.', type: 'error' })
      return
    }
    if (selectedBank === 'outro' && !otherBank.trim()) {
      setToast({ message: 'Informe o nome do banco em "Outro".', type: 'error' })
      return
    }
    setExtratoUploading(true)
    setToast(null)
    try {
      const fd = new FormData()
      fd.append('year', String(selectedAno))
      fd.append('month', String(selectedMes))
      fd.append('file', file)
      fd.append('bank', selectedBank)
      if (selectedBank === 'outro') fd.append('bankOther', otherBank.trim())
      const res = await fetch('/api/admin/financeiro/administracao/bank-extratos', {
        method: 'POST',
        body: fd,
        credentials: 'include',
      })
      const json = await res.json()
      if (!res.ok || !json.ok) {
        setToast({ message: json.message || 'Erro ao importar extrato.', type: 'error' })
        return
      }
      const created = typeof json.data?.expensesCreated === 'number' ? json.data.expensesCreated : 0
      setToast({
        message: created > 0 ? `Extrato importado. ${created} movimentação(ões) lançada(s).` : (json.data?.parseNote || 'Extrato salvo.'),
        type: 'success',
      })
      await fetchData(selectedAno, selectedMes)
      await fetchExtratos(selectedAno, selectedMes)
    } catch {
      setToast({ message: 'Erro ao importar extrato.', type: 'error' })
    } finally {
      setExtratoUploading(false)
    }
  }

  const downloadExtratosMes = async () => {
    if (extratos.length === 0) {
      setToast({ message: 'Nenhum extrato para este mês.', type: 'error' })
      return
    }
    setExtratoDownloading(true)
    try {
      const res = await fetch(
        `/api/admin/financeiro/administracao/bank-extratos/download?year=${selectedAno}&month=${selectedMes}`,
        { credentials: 'include' }
      )
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { message?: string }
        setToast({ message: j.message || 'Erro ao baixar extratos.', type: 'error' })
        return
      }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `extratos-banco_${selectedAno}-${String(selectedMes).padStart(2, '0')}.zip`
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      setToast({ message: 'Erro ao baixar extratos.', type: 'error' })
    } finally {
      setExtratoDownloading(false)
    }
  }

  const removeExtrato = async (id: string) => {
    if (!confirm('Remover este extrato deste mês?')) return
    try {
      const res = await fetch(`/api/admin/financeiro/administracao/bank-extratos/${id}`, {
        method: 'DELETE',
        credentials: 'include',
      })
      const json = await res.json()
      if (!res.ok || !json.ok) {
        setToast({ message: json.message || 'Erro ao remover extrato.', type: 'error' })
        return
      }
      setToast({ message: 'Extrato removido.', type: 'success' })
      await fetchExtratos(selectedAno, selectedMes)
    } catch {
      setToast({ message: 'Erro ao remover extrato.', type: 'error' })
    }
  }

  const toggleSelected = (id: string, checked: boolean) => {
    setSelectedIds((prev) => {
      if (checked) return prev.includes(id) ? prev : [...prev, id]
      return prev.filter((x) => x !== id)
    })
  }

  const toggleSelectAllOnScreen = (checked: boolean) => {
    if (!checked) {
      setSelectedIds((prev) => prev.filter((id) => !movimentacoes.some((m) => m.id === id)))
      return
    }
    setSelectedIds((prev) => {
      const next = new Set(prev)
      movimentacoes.forEach((m) => next.add(m.id))
      return Array.from(next)
    })
  }

  const removeSelecionados = async () => {
    if (selectedIds.length === 0) return
    if (!confirm(`Remover ${selectedIds.length} movimentação(ões) selecionada(s)?`)) return
    const idsToRemove = [...selectedIds]
    setRemovingBatch(true)
    setRemoveDone(0)
    setRemoveProgress(0)
    setRemoveTotal(idsToRemove.length)
    try {
      let failed = 0
      let done = 0
      for (const id of idsToRemove) {
        const res = await fetch(`/api/admin/financeiro/administracao/expenses/${id}`, {
          method: 'DELETE',
          credentials: 'include',
        })
        if (!res.ok) failed += 1
        done += 1
        setRemoveDone(done)
        setRemoveProgress(Math.round((done / idsToRemove.length) * 100))
      }
      if (failed > 0) {
        setToast({
          message: `Algumas movimentações não puderam ser removidas (${failed}).`,
          type: 'error',
        })
      } else {
        setToast({
          message: `${idsToRemove.length} movimentação(ões) removida(s).`,
          type: 'success',
        })
      }
      setSelectedIds([])
      await fetchData(selectedAno, selectedMes)
    } catch {
      setToast({ message: 'Erro ao remover selecionados.', type: 'error' })
    } finally {
      setRemovingBatch(false)
      setTimeout(() => {
        setRemoveProgress(0)
        setRemoveDone(0)
        setRemoveTotal(0)
      }, 500)
    }
  }

  const saveMovimentacao = async (row: ExpenseRow) => {
    const draft = editable[row.id]
    if (!draft || !isCategoriaValida(draft)) {
      setToast({ message: 'Preencha a categoria e os campos obrigatórios.', type: 'error' })
      return
    }
    setSavingId(row.id)
    try {
      const res = await fetch(`/api/admin/financeiro/administracao/expenses/${row.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: buildMovimentacaoNomeFromCategoria({
            tipo: draft.tipo,
            categoriaPrincipal: draft.categoriaPrincipal,
            subcategoria: draft.subcategoria,
            categoriaOutro: draft.categoriaOutro,
          }),
          description: buildDescription(draft.tipo, row.description),
        }),
      })
      const json = await res.json()
      if (!res.ok || !json.ok) {
        setToast({ message: json.message || 'Erro ao salvar movimentação.', type: 'error' })
        return
      }
      setToast({ message: 'Movimentação atualizada.', type: 'success' })
      await fetchData(selectedAno, selectedMes)
    } catch {
      setToast({ message: 'Erro ao salvar movimentação.', type: 'error' })
    } finally {
      setSavingId(null)
    }
  }

  const saveByIds = async (ids: string[], mode: 'selected' | 'all') => {
    if (ids.length === 0) return
    if (mode === 'selected') setSavingSelected(true)
    else setSavingId('__ALL__')
    try {
      for (const id of ids) {
        const row = movimentacoes.find((m) => m.id === id)
          ?? expenses.find((m) => m.id === id)
        const draft = editable[id]
        if (!row || !draft || !isCategoriaValida(draft)) continue
        const res = await fetch(`/api/admin/financeiro/administracao/expenses/${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: buildMovimentacaoNomeFromCategoria({
              tipo: draft.tipo,
              categoriaPrincipal: draft.categoriaPrincipal,
              subcategoria: draft.subcategoria,
              categoriaOutro: draft.categoriaOutro,
            }),
            description: buildDescription(draft.tipo, row.description),
          }),
        })
        const json = await res.json()
        if (!res.ok || !json.ok) {
          setToast({ message: 'Erro ao salvar parte das movimentações.', type: 'error' })
          await fetchData(selectedAno, selectedMes)
          return
        }
      }
      setToast({ message: `${ids.length} movimentação(ões) salva(s).`, type: 'success' })
      await fetchData(selectedAno, selectedMes)
    } catch {
      setToast({ message: 'Erro ao salvar alterações.', type: 'error' })
    } finally {
      if (mode === 'selected') setSavingSelected(false)
      else setSavingId(null)
    }
  }

  const saveSelecionados = async () => saveByIds(selectedDirtyIds, 'selected')
  const saveAlteracoes = async () => saveByIds(dirtyIds, 'all')

  const saveRegraParaFavorecido = async (row: ExpenseRow) => {
    const draft = editable[row.id]
    const ident = parseExtratoMeta(row.description).identificacao?.trim()
    if (!draft || !ident || !isCategoriaValida(draft)) {
      setToast({
        message: 'Defina uma categoria válida nesta linha antes de gravar a regra.',
        type: 'error',
      })
      return
    }
    setSavingRegraForId(row.id)
    try {
      const res = await fetch('/api/admin/financeiro/movimentacao-ident-regras', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          identificacaoOriginal: ident,
          movTipo: draft.tipo,
          categoriaPrincipal: draft.categoriaPrincipal,
          subcategoria: draft.subcategoria,
          categoriaOutro: draft.categoriaOutro,
        }),
      })
      const json = await res.json()
      if (!res.ok || !json.ok) {
        setToast({ message: json.message || 'Erro ao salvar regra.', type: 'error' })
        return
      }
      setToast({ message: json.message || 'Regra salva para este favorecido.', type: 'success' })
      await fetchData(selectedAno, selectedMes)
    } catch {
      setToast({ message: 'Erro ao salvar regra.', type: 'error' })
    } finally {
      setSavingRegraForId(null)
    }
  }

  const deleteIdentRegra = async (id: string) => {
    setDeletingRegraId(id)
    try {
      const res = await fetch(`/api/admin/financeiro/movimentacao-ident-regras/${id}`, {
        method: 'DELETE',
        credentials: 'include',
      })
      const json = await res.json()
      if (!res.ok || !json.ok) {
        setToast({ message: json.message || 'Erro ao remover regra.', type: 'error' })
        return
      }
      setToast({ message: 'Regra removida.', type: 'success' })
      await fetchData(selectedAno, selectedMes)
    } catch {
      setToast({ message: 'Erro ao remover regra.', type: 'error' })
    } finally {
      setDeletingRegraId(null)
    }
  }

  const columns: Column<ExpenseRow>[] = [
    {
      key: 'select',
      label: 'Selecionar',
      render: (row) => (
        <input
          type="checkbox"
          checked={selectedIds.includes(row.id)}
          onChange={(e) => toggleSelected(row.id, e.target.checked)}
          disabled={removingBatch || savingSelected}
          className="rounded border-gray-300"
        />
      ),
    },
    {
      key: 'categoria',
      label: 'Categoria',
      render: (row) => (
        <div className="w-[260px] max-w-[260px] whitespace-normal space-y-1">
          <select
            value={editable[row.id]?.categoriaPrincipal ?? ''}
            onChange={(e) =>
              setEditable((prev) => {
                const cur = prev[row.id]
                if (!cur) return prev
                const nextPrincipal = e.target.value
                if (cur.tipo === 'ENTRADA') {
                  return {
                    ...prev,
                    [row.id]: {
                      ...cur,
                      categoriaPrincipal: nextPrincipal,
                      subcategoria: '',
                      categoriaOutro: nextPrincipal === 'OUTRO' ? cur.categoriaOutro : '',
                    },
                  }
                }
                return {
                  ...prev,
                  [row.id]: {
                    ...cur,
                    categoriaPrincipal: nextPrincipal,
                    subcategoria:
                      nextPrincipal === 'INFRAESTRUTURA' || nextPrincipal === 'BANCO'
                        ? (cur.subcategoria || 'OUTRO')
                        : '',
                    categoriaOutro:
                      nextPrincipal === 'INFRAESTRUTURA' || nextPrincipal === 'BANCO'
                        ? cur.categoriaOutro
                        : '',
                  },
                }
              })
            }
            className="w-full rounded border border-gray-300 px-2 py-1 text-sm"
          >
            {(editable[row.id]?.tipo === 'ENTRADA' ? ENTRADA_CATEGORIAS : SAIDA_CATEGORIAS).map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
          {(editable[row.id]?.tipo === 'SAIDA' &&
            (editable[row.id]?.categoriaPrincipal === 'INFRAESTRUTURA' || editable[row.id]?.categoriaPrincipal === 'BANCO')) && (
            <select
              value={editable[row.id]?.subcategoria ?? ''}
              onChange={(e) =>
                setEditable((prev) => {
                  const cur = prev[row.id]
                  if (!cur) return prev
                  return {
                    ...prev,
                    [row.id]: {
                      ...cur,
                      subcategoria: e.target.value,
                      categoriaOutro: e.target.value === 'OUTRO' ? cur.categoriaOutro : '',
                    },
                  }
                })
              }
              className="w-full rounded border border-gray-300 px-2 py-1 text-sm"
            >
              {(editable[row.id]?.categoriaPrincipal === 'INFRAESTRUTURA' ? INFRA_SUBS : BANCO_SUBS).map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          )}
          {((editable[row.id]?.tipo === 'ENTRADA' && editable[row.id]?.categoriaPrincipal === 'OUTRO') ||
            (editable[row.id]?.tipo === 'SAIDA' &&
              (editable[row.id]?.categoriaPrincipal === 'INFRAESTRUTURA' || editable[row.id]?.categoriaPrincipal === 'BANCO') &&
              editable[row.id]?.subcategoria === 'OUTRO')) && (
            <input
              type="text"
              value={editable[row.id]?.categoriaOutro ?? ''}
              onChange={(e) =>
                setEditable((prev) => {
                  const cur = prev[row.id]
                  if (!cur) return prev
                  return { ...prev, [row.id]: { ...cur, categoriaOutro: e.target.value } }
                })
              }
              placeholder="Escreva a categoria"
              className="w-full rounded border border-gray-300 px-2 py-1 text-sm"
            />
          )}
          {parseExtratoMeta(row.description).identificacao?.trim() ? (
            <button
              type="button"
              className="mt-1 text-left text-xs text-brand-orange hover:underline disabled:opacity-50 disabled:no-underline"
              disabled={
                !editable[row.id] ||
                !isCategoriaValida(editable[row.id]!) ||
                savingRegraForId === row.id ||
                savingSelected ||
                removingBatch
              }
              onClick={() => void saveRegraParaFavorecido(row)}
            >
              {savingRegraForId === row.id
                ? 'Salvando regra…'
                : 'Usar sempre esta categoria para este favorecido'}
            </button>
          ) : null}
        </div>
      ),
    },
    {
      key: 'tipo',
      label: 'Tipo',
      render: (row) => (
        <select
          value={editable[row.id]?.tipo ?? extractTipo(row.description)}
          onChange={(e) => {
            const nextTipo = e.target.value as MovTipo
            const base =
              editable[row.id] ?? {
                id: row.id,
                tipo: extractTipo(row.description),
                ...parseCategoriaFromName(row.name, extractTipo(row.description)),
              }
            const cat = resolveEditableCategorias(row, nextTipo, identRegraMap)
            setEditable((prev) => ({
              ...prev,
              [row.id]: {
                ...base,
                tipo: nextTipo,
                categoriaPrincipal: cat.categoriaPrincipal,
                subcategoria: cat.subcategoria,
                categoriaOutro: cat.categoriaOutro,
              },
            }))
          }}
          className="rounded border border-gray-300 px-2 py-1 text-sm"
        >
          <option value="SAIDA">Saída</option>
          <option value="ENTRADA">Entrada</option>
        </select>
      ),
    },
    {
      key: 'data',
      label: 'Data',
      render: (row) => parseExtratoMeta(row.description).data || '—',
    },
    {
      key: 'transacao',
      label: 'Transação',
      render: (row) => parseExtratoMeta(row.description).transacao || '—',
    },
    {
      key: 'tipoTransacao',
      label: 'Tipo Transação',
      render: (row) => parseExtratoMeta(row.description).tipoTransacao || (editable[row.id]?.tipo === 'ENTRADA' ? 'CRÉDITO' : 'DÉBITO'),
    },
    {
      key: 'identificacao',
      label: 'Identificação',
      render: (row) => parseExtratoMeta(row.description).identificacao || row.name || '—',
    },
    { key: 'valor', label: 'Valor', render: (row) => formatMoney(row.valor) },
    {
      key: 'competencia',
      label: 'Competência',
      render: (row) => `${String(row.month).padStart(2, '0')}/${row.year}`,
    },
    {
      key: 'acoes',
      label: '',
      render: (row) => {
        const current = editable[row.id]
        const original = originalEditable[row.id]
        const isDirty =
          Boolean(current && original) &&
          (
            current.tipo !== original.tipo ||
            current.categoriaPrincipal !== original.categoriaPrincipal ||
            current.subcategoria !== original.subcategoria ||
            current.categoriaOutro.trim() !== original.categoriaOutro.trim()
          )
        if (!isDirty) return <span className="text-xs text-gray-400">Salvo</span>
        return (
          <Button
            variant="outline"
            size="sm"
            onClick={() => void saveMovimentacao(row)}
            disabled={savingId === row.id || savingSelected || removingBatch}
          >
            <Save className="w-4 h-4 mr-2" />
            {savingId === row.id ? 'Salvando...' : 'Salvar'}
          </Button>
        )
      },
    },
  ]

  return (
    <AdminLayout>
      <div className="space-y-8">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-gray-900">Financeiro – Movimentação</h1>
          <p className="text-gray-600 mt-1 text-sm md:text-base">
            Importe extratos, visualize as movimentações e classifique como entrada ou saída.
          </p>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 sm:p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-gray-900">Extratos bancários</p>
              <p className="text-xs text-gray-500 mt-1">
                Faça upload do extrato para lançar movimentações automaticamente no mês selecionado.
              </p>
              <p className="text-sm text-gray-700 mt-2">
                {extratosLoading ? 'Carregando lista…' : `${extratos.length} arquivo(s) neste mês.`}
              </p>
            </div>
            <div className="flex flex-wrap gap-2 shrink-0">
              <input
                ref={extratoInputRef}
                type="file"
                className="hidden"
                accept=".pdf,.ofx,.qfx,.csv,.txt,image/png,image/jpeg,image/webp"
                onChange={handleExtratoFileSelected}
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={extratos.length === 0 || extratoDownloading || extratosLoading}
                onClick={() => void downloadExtratosMes()}
              >
                <Download className="w-4 h-4 mr-2" />
                {extratoDownloading ? 'Baixando…' : 'Download do mês'}
              </Button>
              <Button
                type="button"
                variant="primary"
                size="sm"
                disabled={extratoUploading}
                onClick={() => extratoInputRef.current?.click()}
              >
                <Upload className="w-4 h-4 mr-2" />
                {extratoUploading ? 'Importando…' : 'Importar extrato'}
              </Button>
            </div>
          </div>
          <div className="mt-4 pt-4 border-t border-gray-100 grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Banco do extrato *</label>
              <select
                value={selectedBank}
                onChange={(e) => setSelectedBank(e.target.value)}
                className="w-full rounded border border-gray-300 px-2 py-2 text-sm"
              >
                <option value="">Escolher banco</option>
                <option value="cora">Cora</option>
                <option value="c6">C6</option>
                <option value="inter">Inter</option>
                <option value="banco-do-brasil">Banco do Brasil</option>
                <option value="infinite-pay">Infinite Pay</option>
                <option value="itau">Itaú</option>
                <option value="outro">Outro</option>
              </select>
            </div>
            {selectedBank === 'outro' && (
              <div className="md:col-span-2">
                <label className="block text-xs font-semibold text-gray-600 mb-1">Qual banco? *</label>
                <input
                  type="text"
                  value={otherBank}
                  onChange={(e) => setOtherBank(e.target.value)}
                  placeholder="Digite o nome do banco"
                  className="w-full rounded border border-gray-300 px-2 py-2 text-sm"
                />
              </div>
            )}
          </div>
          {!extratosLoading && extratos.length > 0 ? (
            <ul className="mt-4 pt-4 border-t border-gray-100 space-y-2">
              {extratos.map((ex) => (
                <li key={ex.id} className="flex flex-wrap items-center justify-between gap-2 text-sm text-gray-800">
                  <div className="min-w-0">
                    <a href={ex.fileUrl} target="_blank" rel="noopener noreferrer" className="text-brand-orange hover:underline font-medium truncate min-w-0">
                      {ex.originalFilename}
                    </a>
                    <p className="text-xs text-gray-500 mt-0.5">
                      Importado em {formatDateTime(ex.criadoEm)} · Tamanho: {formatBytes(ex.sizeBytes)}
                    </p>
                  </div>
                  <button type="button" onClick={() => void removeExtrato(ex.id)} className="inline-flex items-center gap-1 text-red-600 hover:text-red-800 shrink-0">
                    <Trash2 className="w-4 h-4" />
                    Remover
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>

        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <button
            type="button"
            onClick={() => setShowPeriodo((v) => !v)}
            className="w-full flex items-center gap-2 px-5 py-4 text-left text-base font-semibold text-gray-800 hover:bg-gray-50"
          >
            <Calendar className="w-5 h-5 text-brand-orange shrink-0" />
            <span className="flex-1">Controle – {MESES_LABELS[selectedMes]} de {selectedAno}</span>
            {showPeriodo ? <ChevronDown className="w-5 h-5 shrink-0" /> : <ChevronRight className="w-5 h-5 shrink-0" />}
          </button>
          {showPeriodo && (
            <div className="px-5 pb-5 pt-0 space-y-4 border-t border-gray-200">
              <div className="flex flex-wrap gap-4 pt-4">
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase mb-2">Ano</p>
                  <div className="flex flex-wrap gap-2">
                    {ANOS_DISPONIVEIS.map((ano) => (
                      <button
                        key={ano}
                        type="button"
                        onClick={() => setSelectedAno(ano)}
                        className={`px-4 py-2 rounded-lg font-medium text-sm transition-colors ${
                          selectedAno === ano ? 'bg-brand-orange text-white shadow-sm' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                        }`}
                      >
                        {ano}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase mb-2">Mês</p>
                  <div className="flex flex-wrap gap-2">
                    {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((m) => (
                      <button
                        key={m}
                        type="button"
                        onClick={() => setSelectedMes(m)}
                        className={`px-3 py-2 rounded-lg font-medium text-sm transition-colors ${
                          selectedMes === m ? 'bg-brand-orange text-white shadow-sm' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                        }`}
                      >
                        {MESES_ABREV[m]}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="flex items-end">
                  <Button variant="primary" size="sm" onClick={() => { fetchData(selectedAno, selectedMes); fetchExtratos(selectedAno, selectedMes) }}>
                    Atualizar lista
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="rounded-xl border-2 border-green-200 bg-green-50 p-4 shadow-sm">
            <p className="text-xs font-semibold text-green-800 uppercase">Entradas</p>
            <p className="text-xl font-bold text-green-900 mt-1 tabular-nums">{formatMoney(totaisEntradasSaidas.entradas)}</p>
            <p className="text-xs text-green-800/85 mt-2">
              Total de <strong>créditos</strong> em {MESES_LABELS[selectedMes]}/{selectedAno} (regra da coluna Tipo transação).
              Linhas duplicadas do mesmo extrato (mesma identificação ou mesma data+transação+valor) ou da mesma despesa fixa no mês entram <strong>uma vez</strong> na soma.
            </p>
          </div>
          <div className="rounded-xl border-2 border-red-200 bg-red-50 p-4 shadow-sm">
            <p className="text-xs font-semibold text-red-800 uppercase">Saídas</p>
            <p className="text-xl font-bold text-red-900 mt-1 tabular-nums">{formatMoney(totaisEntradasSaidas.saidas)}</p>
            <p className="text-xs text-red-800/85 mt-2">
              Total de <strong>débitos</strong> e demais lançamentos que não são crédito; a mesma deduplicação do cubo Entradas evita contar a mesma linha duas vezes.
            </p>
          </div>
        </div>

        <section className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-200">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-base font-semibold text-gray-800">Movimentações do extrato</h2>
              {selectedIds.length > 0 && (
                <div className="flex items-center gap-2">
                  {selectedDirtyIds.length > 0 && (
                    <Button
                      type="button"
                      variant="primary"
                      size="sm"
                      onClick={() => void saveSelecionados()}
                      disabled={savingSelected || removingBatch}
                    >
                      {savingSelected ? 'Salvando selecionados...' : `Salvar selecionados (${selectedDirtyIds.length})`}
                    </Button>
                  )}
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => void removeSelecionados()}
                    disabled={removingBatch || savingSelected}
                    className="text-red-700 border-red-300 hover:bg-red-50 disabled:opacity-60"
                  >
                    {removingBatch ? `Removendo... ${removeProgress}%` : `Remover selecionados (${selectedIds.length})`}
                  </Button>
                </div>
              )}
            </div>
            <p className="text-sm text-gray-600 mt-0.5">
              Exibimos Data, Transação, Tipo Transação, Identificação e Valor do extrato importado.
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {dirtyIds.length > 0 && (
                <Button
                  type="button"
                  variant="primary"
                  size="sm"
                  onClick={() => void saveAlteracoes()}
                  disabled={savingSelected || removingBatch || savingId === '__ALL__'}
                >
                  {savingId === '__ALL__' ? 'Salvando alterações...' : `Salvar alterações (${dirtyIds.length})`}
                </Button>
              )}
              <div className="flex items-center gap-2">
                <label className="text-xs text-gray-600">Mostrar</label>
                <select
                  value={movementFilter}
                  onChange={(e) => setMovementFilter(e.target.value as 'TODAS' | 'ENTRADA' | 'SAIDA')}
                  className="rounded border border-gray-300 px-2 py-1 text-sm"
                >
                  <option value="TODAS">Todas</option>
                  <option value="ENTRADA">Entradas</option>
                  <option value="SAIDA">Saídas</option>
                </select>
              </div>
            </div>
            {removingBatch && (
              <div className="mt-3 max-w-md">
                <div className="flex items-center justify-between text-xs text-gray-600 mb-1">
                  <span>Removendo movimentações...</span>
                  <span>{removeDone}/{removeTotal} ({removeProgress}%)</span>
                </div>
                <div className="h-2 w-full rounded-full bg-gray-200 overflow-hidden">
                  <div
                    className="h-full bg-red-500 transition-all duration-300 ease-out"
                    style={{ width: `${removeProgress}%` }}
                  />
                </div>
              </div>
            )}
            <label className="mt-2 inline-flex items-center gap-2 text-xs text-gray-600">
              <input
                type="checkbox"
                checked={allSelectedOnScreen}
                onChange={(e) => toggleSelectAllOnScreen(e.target.checked)}
                  disabled={removingBatch || savingSelected}
                className="rounded border-gray-300"
              />
              Selecionar todos exibidos
            </label>
            <div className="mt-4 rounded-lg border border-gray-200 bg-gray-50/80 p-3">
              <button
                type="button"
                onClick={() => setShowRegrasIdent((v) => !v)}
                className="flex w-full items-center gap-2 text-left text-sm font-medium text-gray-800"
              >
                {showRegrasIdent ? (
                  <ChevronDown className="h-4 w-4 shrink-0 text-gray-600" />
                ) : (
                  <ChevronRight className="h-4 w-4 shrink-0 text-gray-600" />
                )}
                <span>
                  Regras por favorecido (identificação do extrato){' '}
                  <span className="font-normal text-gray-500">— {identRegras.length} salva(s)</span>
                </span>
              </button>
              {showRegrasIdent && (
                <ul className="mt-3 max-h-48 space-y-2 overflow-y-auto text-xs text-gray-700">
                  {identRegras.length === 0 ? (
                    <li className="text-gray-500">
                      Nenhuma regra. Ajuste a categoria na linha e use &quot;Usar sempre esta categoria…&quot;.
                    </li>
                  ) : (
                    identRegras.map((r) => (
                      <li
                        key={r.id}
                        className="flex flex-wrap items-start justify-between gap-2 border-b border-gray-200/80 pb-2 last:border-0"
                      >
                        <span className="min-w-0">
                          <span className="font-medium text-gray-900">
                            {r.identificacaoExemplo || r.identificacaoChave}
                          </span>
                          <span className="text-gray-500"> · </span>
                          <span>{r.movTipo === 'ENTRADA' ? 'Entrada' : 'Saída'}</span>
                          <span className="text-gray-500"> → </span>
                          {buildMovimentacaoNomeFromCategoria({
                            tipo: r.movTipo,
                            categoriaPrincipal: r.categoriaPrincipal,
                            subcategoria: r.subcategoria,
                            categoriaOutro: r.categoriaOutro,
                          })}
                        </span>
                        <button
                          type="button"
                          className="shrink-0 text-red-600 hover:underline disabled:opacity-50"
                          disabled={deletingRegraId === r.id}
                          onClick={() => void deleteIdentRegra(r.id)}
                        >
                          {deletingRegraId === r.id ? 'Removendo…' : 'Remover'}
                        </button>
                      </li>
                    ))
                  )}
                </ul>
              )}
            </div>
          </div>
          <Table<ExpenseRow>
            columns={columns}
            data={movimentacoes}
            loading={loading}
            emptyMessage="Nenhuma movimentação no mês selecionado."
            scrollBodyHeightClass="h-[calc(7*6.25rem)] max-h-[calc(7*6.25rem)]"
          />
        </section>

        {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
      </div>
    </AdminLayout>
  )
}
