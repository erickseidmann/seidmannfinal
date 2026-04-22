/**
 * Financeiro – Administração
 * Usuários do ADM (funcionários): valor/função por mês e status de pagamento.
 */

'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import AdminLayout from '@/components/admin/AdminLayout'
import Table, { Column } from '@/components/admin/Table'
import Modal from '@/components/admin/Modal'
import Button from '@/components/ui/Button'
import Toast from '@/components/admin/Toast'
import { Users, Wallet, CheckCircle, Pencil, Bell, Calendar, ChevronDown, ChevronRight, FileDown, Paperclip, Loader2, Link2, Unlink } from 'lucide-react'

const MESES_LABELS: Record<number, string> = {
  1: 'Janeiro', 2: 'Fevereiro', 3: 'Março', 4: 'Abril', 5: 'Maio', 6: 'Junho',
  7: 'Julho', 8: 'Agosto', 9: 'Setembro', 10: 'Outubro', 11: 'Novembro', 12: 'Dezembro',
}
const MESES_ABREV: Record<number, string> = {
  1: 'Jan', 2: 'Fev', 3: 'Mar', 4: 'Abr', 5: 'Mai', 6: 'Jun',
  7: 'Jul', 8: 'Ago', 9: 'Set', 10: 'Out', 11: 'Nov', 12: 'Dez',
}
const ANOS_DISPONIVEIS = Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - 2 + i)

interface AdminUserRow {
  id: string
  nome: string
  email: string
  funcao: string | null
  emailPessoal: string | null
  linkedTeacherId: string | null
  linkedTeacherNome: string | null
  teacherPaymentDueDay: number | null
  adminPaymentDueDay: number | null
  valorProfessorAulas: number | null
  valor: number | null
  paymentStatus: string | null
  paidAt: string | null
  receiptUrl: string | null
  notificationSentAt: string | null
  valorPendente: number | null
  valorPendenteRequestedAt: string | null
  valorRepetido: number | null
}

function formatMoney(n: number): string {
  return `R$ ${Number(n).toFixed(2).replace('.', ',')}`
}

function formatDateIso(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString('pt-BR')
}

export default function FinanceiroAdministracaoPage() {
  const anoAtual = new Date().getFullYear()
  const mesAtual = new Date().getMonth() + 1
  const [selectedAno, setSelectedAno] = useState<number>(anoAtual)
  const [selectedMes, setSelectedMes] = useState<number>(mesAtual)

  const [adminUsers, setAdminUsers] = useState<AdminUserRow[]>([])
  const [loading, setLoading] = useState(true)
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null)
  const [currentUserIsSuperAdmin, setCurrentUserIsSuperAdmin] = useState(false)

  // Modal Alterar valor (usuário ADM)
  const [editValorUser, setEditValorUser] = useState<AdminUserRow | null>(null)
  const [modalValor, setModalValor] = useState('')
  const [applyToAllMonths, setApplyToAllMonths] = useState(false)
  const [savingValor, setSavingValor] = useState(false)
  // Modal Enviar notificação de pagamento (e-mail + anexo)
  const [notifyUser, setNotifyUser] = useState<AdminUserRow | null>(null)
  const [notifyMessage, setNotifyMessage] = useState('')
  const [notifyFile, setNotifyFile] = useState<File | null>(null)
  const [sendingNotify, setSendingNotify] = useState(false)

  const [showPeriodo, setShowPeriodo] = useState(true)
  const [itemsPerPageAdmin, setItemsPerPageAdmin] = useState(7)
  const [coraGastos, setCoraGastos] = useState<number>(0)
  const [coraLoading, setCoraLoading] = useState(false)
  const [uploadingReceiptUserId, setUploadingReceiptUserId] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const pendingReceiptRowRef = useRef<AdminUserRow | null>(null)

  const [connectModalUser, setConnectModalUser] = useState<AdminUserRow | null>(null)
  const [teachersPickList, setTeachersPickList] = useState<{ id: string; nome: string }[]>([])
  const [teachersPickLoading, setTeachersPickLoading] = useState(false)
  const [selectedTeacherToLink, setSelectedTeacherToLink] = useState('')
  const [savingTeacherLink, setSavingTeacherLink] = useState(false)

  const fetchData = useCallback(async (ano: number, mes: number) => {
    setLoading(true)
    try {
      const res = await fetch(`/api/admin/financeiro/administracao?year=${ano}&month=${mes}`, { credentials: 'include' })
      const json = await res.json()
      if (!res.ok || !json.ok) {
        setAdminUsers([])
        return
      }
      const rows: AdminUserRow[] = (json.data?.adminUsers ?? []).map((r: AdminUserRow) => ({
        ...r,
        linkedTeacherId: r.linkedTeacherId ?? null,
        linkedTeacherNome: r.linkedTeacherNome ?? null,
        teacherPaymentDueDay: r.teacherPaymentDueDay ?? null,
        adminPaymentDueDay: r.adminPaymentDueDay ?? null,
        valorProfessorAulas: r.valorProfessorAulas ?? null,
      }))
      setAdminUsers(rows)
      setCurrentUserIsSuperAdmin(!!json.data?.currentUserIsSuperAdmin)
    } catch {
      setAdminUsers([])
    } finally {
      setLoading(false)
    }
  }, [])

  const fetchCoraUsage = useCallback(async (ano: number, mes: number) => {
    setCoraLoading(true)
    try {
      const res = await fetch(`/api/admin/financeiro/cora-usage?year=${ano}&month=${mes}`)
      const json = await res.json()
      if (res.ok && json.ok && json.data?.totalCents != null) {
        setCoraGastos(json.data.totalCents / 100)
      } else {
        setCoraGastos(0)
      }
    } catch {
      setCoraGastos(0)
    } finally {
      setCoraLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchData(selectedAno, selectedMes)
    fetchCoraUsage(selectedAno, selectedMes)
  }, [selectedAno, selectedMes, fetchData, fetchCoraUsage])

  const displayedAdminUsers = adminUsers.slice(0, itemsPerPageAdmin)

  const valorExibido = (u: AdminUserRow) => u.valor ?? u.valorRepetido ?? 0
  const roundMoney = (n: number) => Math.round(n * 100) / 100
  /** Com professor vinculado: salário ADM do mês + valor a pagar (aulas). Sem vínculo: só ADM. */
  const totalAPagarAdmRow = (u: AdminUserRow) =>
    u.linkedTeacherId != null
      ? roundMoney(valorExibido(u) + (u.valorProfessorAulas ?? 0))
      : valorExibido(u)
  const totalAdminValor = adminUsers.reduce((s, u) => s + valorExibido(u), 0)
  const totalPagoAdmin = adminUsers
    .filter((u) => u.paymentStatus === 'PAGO')
    .reduce((s, u) => s + valorExibido(u), 0)

  const updateUserValor = async (userId: string, valor: number | null) => {
    try {
      const res = await fetch(`/api/admin/financeiro/administracao/users/${userId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          year: selectedAno,
          month: selectedMes,
          valor: valor ?? null,
        }),
      })
      const json = await res.json()
      if (!res.ok || !json.ok) {
        setToast({ message: json.message || 'Erro ao registrar proposta.', type: 'error' })
        return
      }
      setToast({ message: json.message || 'Proposta registrada. Aguardando aprovação do admin.', type: 'success' })
      await fetchData(selectedAno, selectedMes)
    } catch {
      setToast({ message: 'Erro ao registrar proposta.', type: 'error' })
    }
  }

  const approveUserValor = async (userId: string) => {
    try {
      const res = await fetch(`/api/admin/financeiro/administracao/users/${userId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          year: selectedAno,
          month: selectedMes,
          approveValorPendente: true,
        }),
      })
      const json = await res.json()
      if (!res.ok || !json.ok) {
        setToast({ message: json.message || 'Erro ao aprovar.', type: 'error' })
        return
      }
      setToast({ message: json.message || 'Valor aprovado.', type: 'success' })
      await fetchData(selectedAno, selectedMes)
    } catch {
      setToast({ message: 'Erro ao aprovar.', type: 'error' })
    }
  }

  const updateUserPaymentStatus = async (userId: string, paymentStatus: 'PAGO' | 'EM_ABERTO') => {
    try {
      const res = await fetch(`/api/admin/financeiro/administracao/users/${userId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          year: selectedAno,
          month: selectedMes,
          paymentStatus,
        }),
      })
      const json = await res.json()
      if (!res.ok || !json.ok) return
      await fetchData(selectedAno, selectedMes)
    } catch {
      // silencioso
    }
  }

  const setUserEmAberto = async (userId: string) => {
    await updateUserPaymentStatus(userId, 'EM_ABERTO')
  }

  const openEditValorModal = (row: AdminUserRow) => {
    setEditValorUser(row)
    const valorAtual = row.valor ?? row.valorRepetido
    setModalValor(row.valorPendente != null ? String(row.valorPendente) : (valorAtual != null ? String(valorAtual) : ''))
    setApplyToAllMonths(false)
  }

  const saveValorModal = async () => {
    if (!editValorUser) return
    const v = modalValor.replace(',', '.')
    const num = v === '' ? null : Number(v)
    if (v !== '' && num != null && (Number.isNaN(num) || num < 0)) {
      setToast({ message: 'Valor inválido.', type: 'error' })
      return
    }
    setSavingValor(true)
    setToast(null)
    try {
      const res = await fetch(`/api/admin/financeiro/administracao/users/${editValorUser.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          year: selectedAno,
          month: selectedMes,
          valor: num,
          ...(applyToAllMonths ? { applyToAllMonthsInYear: true } : {}),
        }),
      })
      const json = await res.json()
      if (!res.ok || !json.ok) {
        setToast({ message: json.message || 'Erro ao atualizar valor.', type: 'error' })
        return
      }
      setToast({ message: json.message || 'Proposta registrada. Aguardando aprovação do admin.', type: 'success' })
      await fetchData(selectedAno, selectedMes)
      setEditValorUser(null)
    } catch {
      setToast({ message: 'Erro ao atualizar valor.', type: 'error' })
    } finally {
      setSavingValor(false)
    }
  }

  const openNotifyModal = (row: AdminUserRow) => {
    const mesNome = MESES_LABELS[selectedMes] ?? String(selectedMes)
    const adm = valorExibido(row)
    const aulas = row.valorProfessorAulas ?? 0
    const fmt = (n: number) => n.toFixed(2).replace('.', ',')
    const defaultMessage =
      row.linkedTeacherId != null
        ? `Olá,

Informamos que o pagamento referente à prestação de serviços de ${mesNome} de ${selectedAno} foi confirmado.

Salário administrativo: R$ ${fmt(adm)}
Pagamento de aulas (professor): R$ ${fmt(aulas)}

Total: R$ ${fmt(roundMoney(adm + aulas))}.

Em caso de dúvidas, entre em contato com a gestão financeira.

Atenciosamente,
Equipe Seidmann Institute`
        : `Olá,

Informamos que o pagamento referente à prestação de serviços de ${mesNome} de ${selectedAno} foi confirmado.
O valor é de R$ ${fmt(adm)}.

Em caso de dúvidas, entre em contato com a gestão financeira.

Atenciosamente,
Equipe Seidmann Institute`
    setNotifyUser(row)
    setNotifyMessage(defaultMessage)
    setNotifyFile(null)
  }

  const submitNotifyPayment = async () => {
    if (!notifyUser) return
    setSendingNotify(true)
    setToast(null)
    try {
      const formData = new FormData()
      formData.set('year', String(selectedAno))
      formData.set('month', String(selectedMes))
      formData.set('message', notifyMessage)
      if (notifyFile) formData.set('attachment', notifyFile)
      const res = await fetch(`/api/admin/financeiro/administracao/users/${notifyUser.id}/notify-payment`, {
        method: 'POST',
        body: formData,
      })
      const json = await res.json()
      if (!res.ok || !json.ok) {
        setToast({ message: json.message || 'Erro ao enviar notificação.', type: 'error' })
        return
      }
      setToast({ message: json.message || 'Notificação enviada.', type: 'success' })
      await fetchData(selectedAno, selectedMes)
      setNotifyUser(null)
    } catch {
      setToast({ message: 'Erro ao enviar notificação.', type: 'error' })
    } finally {
      setSendingNotify(false)
    }
  }

  const triggerReceiptUpload = (row: AdminUserRow) => {
    pendingReceiptRowRef.current = row
    fileInputRef.current?.click()
  }

  const onReceiptFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const row = pendingReceiptRowRef.current
    const file = e.target.files?.[0]
    e.target.value = ''
    pendingReceiptRowRef.current = null
    if (!row || !file) return
    setUploadingReceiptUserId(row.id)
    setToast(null)
    try {
      const formData = new FormData()
      formData.set('file', file)
      formData.set('nome', row.nome)
      formData.set('year', String(selectedAno))
      formData.set('month', String(selectedMes))
      const res = await fetch('/api/admin/financeiro/administracao/upload-receipt', {
        method: 'POST',
        body: formData,
      })
      const json = await res.json()
      if (!res.ok || !json.ok) {
        setToast({ message: json.message || 'Erro ao enviar arquivo.', type: 'error' })
        return
      }
      const notifyFd = new FormData()
      notifyFd.set('year', String(selectedAno))
      notifyFd.set('month', String(selectedMes))
      notifyFd.set('receiptUrl', String(json.data?.url || ''))
      notifyFd.set('attachment', file)
      const notifyRes = await fetch(`/api/admin/financeiro/administracao/users/${row.id}/notify-payment`, {
        method: 'POST',
        body: notifyFd,
      })
      const notifyJson = await notifyRes.json()
      if (!notifyRes.ok || !notifyJson.ok) {
        setToast({ message: notifyJson.message || 'Arquivo salvo, mas não foi possível notificar o pagamento.', type: 'error' })
        return
      }
      setToast({ message: 'Comprovante anexado, pagamento marcado como pago e notificação enviada.', type: 'success' })
      await fetchData(selectedAno, selectedMes)
    } catch {
      setToast({ message: 'Erro ao enviar arquivo.', type: 'error' })
    } finally {
      setUploadingReceiptUserId(null)
    }
  }

  const openConnectModal = async (row: AdminUserRow) => {
    setConnectModalUser(row)
    setSelectedTeacherToLink(row.linkedTeacherId ?? '')
    setTeachersPickLoading(true)
    setTeachersPickList([])
    try {
      const res = await fetch(
        `/api/admin/financeiro/professores?year=${selectedAno}&month=${selectedMes}`,
        { credentials: 'include' }
      )
      const json = await res.json()
      if (res.ok && json.ok && Array.isArray(json.data?.professores)) {
        setTeachersPickList(
          json.data.professores.map((p: { id: string; nome: string }) => ({ id: p.id, nome: p.nome }))
        )
      } else {
        setToast({ message: 'Não foi possível carregar a lista de professores.', type: 'error' })
      }
    } catch {
      setToast({ message: 'Erro ao carregar professores.', type: 'error' })
    } finally {
      setTeachersPickLoading(false)
    }
  }

  const saveTeacherLink = async () => {
    if (!connectModalUser || !selectedTeacherToLink) {
      setToast({ message: 'Selecione um professor.', type: 'error' })
      return
    }
    setSavingTeacherLink(true)
    setToast(null)
    try {
      const res = await fetch(`/api/admin/financeiro/administracao/users/${connectModalUser.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ linkedTeacherId: selectedTeacherToLink }),
      })
      const json = await res.json()
      if (!res.ok || !json.ok) {
        setToast({ message: json.message || 'Erro ao vincular.', type: 'error' })
        return
      }
      setToast({ message: 'Professor vinculado. O dia de pagamento e o valor de aulas seguem o cadastro do professor.', type: 'success' })
      setConnectModalUser(null)
      await fetchData(selectedAno, selectedMes)
    } catch {
      setToast({ message: 'Erro ao vincular.', type: 'error' })
    } finally {
      setSavingTeacherLink(false)
    }
  }

  const unlinkTeacher = async (row: AdminUserRow) => {
    setToast(null)
    try {
      const res = await fetch(`/api/admin/financeiro/administracao/users/${row.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ linkedTeacherId: null }),
      })
      const json = await res.json()
      if (!res.ok || !json.ok) {
        setToast({ message: json.message || 'Erro ao desvincular.', type: 'error' })
        return
      }
      setToast({ message: 'Vínculo com professor removido.', type: 'success' })
      await fetchData(selectedAno, selectedMes)
    } catch {
      setToast({ message: 'Erro ao desvincular.', type: 'error' })
    }
  }

  const saveAdminDueDay = async (userId: string, raw: string) => {
    const t = raw.trim()
    if (t === '') {
      await patchAdminDueDayApi(userId, null)
      return
    }
    const n = Number(t)
    if (!Number.isInteger(n) || n < 1 || n > 31) {
      setToast({ message: 'Dia inválido. Use um número de 1 a 31.', type: 'error' })
      await fetchData(selectedAno, selectedMes)
      return
    }
    await patchAdminDueDayApi(userId, n)
  }

  const patchAdminDueDayApi = async (userId: string, day: number | null) => {
    try {
      const res = await fetch(`/api/admin/financeiro/administracao/users/${userId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ adminPaymentDueDay: day }),
      })
      const json = await res.json()
      if (!res.ok || !json.ok) {
        setToast({ message: json.message || 'Erro ao salvar dia de pagamento.', type: 'error' })
        return
      }
      await fetchData(selectedAno, selectedMes)
    } catch {
      setToast({ message: 'Erro ao salvar dia de pagamento.', type: 'error' })
    }
  }

  const adminColumns: Column<AdminUserRow>[] = [
    { key: 'nome', label: 'Nome', render: (row) => row.nome },
    { key: 'funcao', label: 'Função', render: (row) => row.funcao ?? '—' },
    {
      key: 'professorVinculo',
      label: 'Professor',
      render: (row) =>
        row.linkedTeacherId ? (
          <div className="flex flex-col gap-1.5 max-w-[220px]">
            <span className="text-sm font-medium text-gray-900">{row.linkedTeacherNome ?? '—'}</span>
            <button
              type="button"
              onClick={() => void unlinkTeacher(row)}
              className="inline-flex items-center gap-1 rounded border border-gray-200 bg-white px-2 py-1 text-xs text-gray-700 hover:bg-gray-50"
            >
              <Unlink className="w-3.5 h-3.5" />
              Desconectar
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => void openConnectModal(row)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-indigo-200 bg-indigo-50 px-2.5 py-1.5 text-xs font-medium text-indigo-900 hover:bg-indigo-100"
          >
            <Link2 className="w-3.5 h-3.5" />
            Conectar professor
          </button>
        ),
    },
    {
      key: 'diaPagamento',
      label: 'Dia pagamento',
      render: (row) =>
        row.linkedTeacherId ? (
          <div className="text-sm text-gray-900">
            {row.teacherPaymentDueDay != null ? (
              <>
                Dia <span className="font-semibold">{row.teacherPaymentDueDay}</span>
              </>
            ) : (
              '—'
            )}
            <p className="text-[10px] text-gray-500 mt-0.5">Mesmo do professor vinculado</p>
          </div>
        ) : (
          <div className="flex flex-col gap-0.5">
            <input
              type="number"
              min={1}
              max={31}
              placeholder="1–31"
              className="w-20 rounded border border-gray-300 px-2 py-1 text-sm"
              defaultValue={row.adminPaymentDueDay ?? ''}
              key={`adm-due-${row.id}-${row.adminPaymentDueDay ?? 'empty'}`}
              onBlur={(e) => void saveAdminDueDay(row.id, e.target.value)}
            />
            <span className="text-[10px] text-gray-500">Só ADM (sem aulas)</span>
          </div>
        ),
    },
    {
      key: 'valor',
      label: 'Valor (R$)',
      render: (row) => (
        <div className="flex flex-col gap-1">
          <span className="inline-flex items-center gap-1">
            <span className="font-medium text-gray-900">
              {(row.valor ?? row.valorRepetido) != null
                ? formatMoney(row.valor ?? row.valorRepetido ?? 0)
                : '—'}
            </span>
            {(row.valor ?? null) === null && row.valorRepetido != null && (
              <span className="text-xs text-gray-500">(repetido)</span>
            )}
            <button
              type="button"
              onClick={() => openEditValorModal(row)}
              className="p-1.5 rounded text-gray-400 hover:text-orange-600 hover:bg-orange-50"
              title="Propor alteração de valor (aguardará aprovação do admin)"
              aria-label="Propor alteração"
            >
              <Pencil className="w-4 h-4" />
            </button>
          </span>
          {row.linkedTeacherId != null && row.valorProfessorAulas != null ? (
            <p className="text-xs font-semibold text-indigo-900 bg-indigo-50 rounded-md px-2 py-1 border border-indigo-100">
              Valor a pagar (aulas): {formatMoney(row.valorProfessorAulas)}
            </p>
          ) : null}
          {row.linkedTeacherId != null ? (
            <p className="text-xs font-bold text-gray-900 mt-1 pt-1 border-t border-gray-100">
              Total a pagar:{' '}
              <span className="text-orange-700">{formatMoney(totalAPagarAdmRow(row))}</span>
              <span className="block font-normal text-[10px] text-gray-500">ADM + aulas (mês)</span>
            </p>
          ) : null}
          {row.valorPendente != null && (
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="rounded bg-amber-100 px-2 py-0.5 text-amber-800">
                Aguardando aprovação do admin
              </span>
              <span className="text-gray-600">Proposta: {formatMoney(row.valorPendente)}</span>
              {currentUserIsSuperAdmin && (
                <button
                  type="button"
                  onClick={() => approveUserValor(row.id)}
                  className="inline-flex items-center gap-1 rounded bg-green-600 px-2 py-1 text-xs font-medium text-white hover:bg-green-700"
                  title="Aprovar valor"
                >
                  <CheckCircle className="w-3.5 h-3.5" />
                  Aprovar
                </button>
              )}
            </div>
          )}
        </div>
      ),
    },
    {
      key: 'paymentStatus',
      label: 'Pagamento',
      render: (row) => {
        if (row.paymentStatus === 'PAGO' && row.paidAt) {
          return (
            <div className="flex flex-col gap-1 text-sm max-w-[220px]">
              <span className="text-green-800 font-medium">Pago em {formatDateIso(row.paidAt)}</span>
              {row.receiptUrl ? (
                <a
                  href={row.receiptUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-brand-orange hover:underline"
                >
                  Ver comprovante
                </a>
              ) : null}
              <button
                type="button"
                onClick={() => void setUserEmAberto(row.id)}
                className="text-left text-xs text-gray-600 hover:text-gray-900 underline"
              >
                Voltar para em aberto
              </button>
            </div>
          )
        }
        return (
          <select
            value={row.paymentStatus ?? 'EM_ABERTO'}
            onChange={(e) =>
              updateUserPaymentStatus(row.id, e.target.value === 'PAGO' ? 'PAGO' : 'EM_ABERTO')
            }
            className="rounded border border-gray-300 px-2 py-1 text-sm focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
          >
            <option value="EM_ABERTO">Em aberto</option>
            <option value="PAGO">Pago</option>
          </select>
        )
      },
    },
    {
      key: 'anexarNf',
      label: 'Anexar NF ou recibo',
      render: (row) => (
        <button
          type="button"
          onClick={() => triggerReceiptUpload(row)}
          disabled={uploadingReceiptUserId === row.id}
          className="inline-flex items-center gap-1.5 rounded px-2 py-1 text-sm text-sky-700 hover:bg-sky-50 disabled:opacity-50"
          title="Selecionar arquivo para salvar no sistema"
        >
          {uploadingReceiptUserId === row.id ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Paperclip className="w-4 h-4" />
          )}
          {uploadingReceiptUserId === row.id ? 'Enviando...' : 'Anexar'}
        </button>
      ),
    },
    {
      key: 'acoes',
      label: '',
      render: (row) => row.notificationSentAt ? (
        <span
          className="inline-flex items-center gap-1.5 rounded px-2 py-1 text-sm text-emerald-700 bg-emerald-50"
          title={`Notificação enviada em ${formatDateIso(row.notificationSentAt)}`}
        >
          <Bell className="w-4 h-4" />
          Notificação enviada
        </span>
      ) : (
        <button
          type="button"
          onClick={() => openNotifyModal(row)}
          className="inline-flex items-center gap-1.5 rounded px-2 py-1 text-sm text-green-700 hover:bg-green-50"
          title="Abrir preview e enviar e-mail de notificação de pagamento"
        >
          <Bell className="w-4 h-4" />
          Notificar pagamento
        </button>
      ),
    },
  ]

  const exportCsv = (rows: { [k: string]: unknown }[], headers: string[], getRow: (r: typeof rows[0]) => string[]) => {
    const csv = '\uFEFF' + [headers.join(';'), ...rows.map((r) => getRow(r).map((v) => (String(v).includes(';') ? `"${String(v).replace(/"/g, '""')}"` : v)).join(';'))].join('\r\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `financeiro-administracao-${selectedAno}-${String(selectedMes).padStart(2, '0')}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <AdminLayout>
      <div className="space-y-8">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-gray-900">Financeiro – Administração</h1>
          <p className="text-gray-600 mt-1 text-sm md:text-base">
            Valores mensais dos usuários do ADM (funcionários) e status de pagamento.
          </p>
        </div>

        {/* Seção: Período (ano e mês) - Recolhível - mesmo estilo alunos */}
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
                  <Button variant="primary" size="sm" onClick={() => { fetchData(selectedAno, selectedMes); fetchCoraUsage(selectedAno, selectedMes); }}>
                    Atualizar lista
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Resumo do mês (cubos) - mesmo estilo alunos */}
        <section>
          <h2 className="text-base font-semibold text-gray-800 mb-3">Resumo do mês</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            <div className="rounded-xl border-2 border-amber-200 bg-amber-50 p-4 shadow-sm">
              <p className="text-xs font-semibold text-amber-800 uppercase tracking-wide">Total ADM</p>
              <p className="mt-1 text-xl font-bold text-amber-900">{loading ? '—' : formatMoney(totalAdminValor)}</p>
            </div>
            <div className="rounded-xl border-2 border-emerald-200 bg-emerald-50 p-4 shadow-sm">
              <p className="text-xs font-semibold text-emerald-800 uppercase tracking-wide">Já pago</p>
              <p className="mt-1 text-xl font-bold text-emerald-900">{loading ? '—' : formatMoney(totalPagoAdmin)}</p>
            </div>
            <div className="rounded-xl border-2 border-indigo-200 bg-indigo-50 p-4 shadow-sm">
              <p className="text-xs font-semibold text-indigo-800 uppercase tracking-wide">Gastos Cora</p>
              <p className="mt-1 text-xl font-bold text-indigo-900">{coraLoading ? '—' : formatMoney(coraGastos)}</p>
              <p className="text-xs text-indigo-600 mt-0.5">Estimativa automática</p>
            </div>
          </div>
        </section>

        {/* Usuários do ADM */}
        <section className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-200 flex flex-wrap items-center gap-3">
            <h2 className="text-base font-semibold text-gray-800 mr-2">Usuários do ADM</h2>
            <div className="flex items-center gap-2">
              <label className="text-xs text-gray-500">Itens por página</label>
              <select value={itemsPerPageAdmin} onChange={(e) => setItemsPerPageAdmin(Number(e.target.value))} className="input min-w-[72px] text-sm py-1.5">
                <option value={7}>7</option>
                <option value={10}>10</option>
                <option value={20}>20</option>
                <option value={100}>100</option>
              </select>
            </div>
            <Button variant="outline" size="sm" onClick={() => exportCsv(adminUsers as any[], ['Nome', 'Função', 'Professor', 'Dia pagamento', 'Valor ADM', 'Valor aulas', 'Total a pagar', 'Pagamento'], (r: any) => {
              const row = r as AdminUserRow
              const dia =
                row.linkedTeacherId != null
                  ? (row.teacherPaymentDueDay != null ? String(row.teacherPaymentDueDay) : '')
                  : (row.adminPaymentDueDay != null ? String(row.adminPaymentDueDay) : '')
              return [
                row.nome,
                row.funcao ?? '',
                row.linkedTeacherNome ?? '',
                dia,
                formatMoney(valorExibido(row)),
                row.valorProfessorAulas != null ? formatMoney(row.valorProfessorAulas) : '',
                formatMoney(totalAPagarAdmRow(row)),
                row.paymentStatus === 'PAGO' ? 'Pago' : 'Em aberto',
              ]
            })}>
              <FileDown className="w-4 h-4 mr-2" />
              Exportar Excel
            </Button>
          </div>
          <div className="px-5 py-3 text-sm text-gray-600 border-b border-gray-100">
            Defina o valor mensal de cada usuário administrativo (exceto o super admin). Quem também dá aulas pode ser{' '}
            <strong>vinculado a um professor</strong>: nesse caso aparecem o <strong>valor a pagar (aulas)</strong> (mesma regra do
            Financeiro – Professores no mês) e o <strong>dia de pagamento</strong> igual ao do cadastro do professor. Sem vínculo,
            use o campo numérico em &quot;Dia pagamento&quot; só para o salário ADM. O status de pagamento pode ser alterado aqui.
            Use &quot;Anexar NF ou recibo&quot; para salvar o arquivo diretamente no sistema.
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
            className="hidden"
            onChange={onReceiptFileChange}
            aria-hidden
          />
          <Table<AdminUserRow>
            columns={adminColumns}
            data={displayedAdminUsers}
            loading={loading}
            emptyMessage="Nenhum usuário administrativo (exceto super admin)."
            scrollBodyHeightClass="h-[calc(7*6.25rem)] max-h-[calc(7*6.25rem)]"
          />
          {adminUsers.length > itemsPerPageAdmin && (
            <div className="px-5 py-2 text-sm text-gray-500 border-t border-gray-100">
              Mostrando {displayedAdminUsers.length} de {adminUsers.length} usuários
            </div>
          )}
        </section>

        {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
      </div>

      <Modal
        isOpen={!!connectModalUser}
        onClose={() => setConnectModalUser(null)}
        title={connectModalUser ? `Vincular professor – ${connectModalUser.nome}` : 'Vincular professor'}
        size="md"
        footer={
          <>
            <Button variant="secondary" onClick={() => setConnectModalUser(null)}>
              Cancelar
            </Button>
            <Button onClick={() => void saveTeacherLink()} disabled={savingTeacherLink || !selectedTeacherToLink}>
              {savingTeacherLink ? 'Salvando...' : 'Vincular'}
            </Button>
          </>
        }
      >
        {connectModalUser && (
          <div className="space-y-4">
            <p className="text-sm text-gray-600">
              Escolha o cadastro de professor correspondente. O <strong>valor a pagar (aulas)</strong> e o{' '}
              <strong>dia de pagamento</strong> passam a ser os mesmos do Financeiro – Professores neste mês.
            </p>
            {teachersPickLoading ? (
              <p className="text-sm text-gray-500">Carregando professores...</p>
            ) : (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Professor</label>
                <select
                  value={selectedTeacherToLink}
                  onChange={(e) => setSelectedTeacherToLink(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                >
                  <option value="">Selecione...</option>
                  {teachersPickList.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.nome}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
        )}
      </Modal>

      <Modal
        isOpen={!!editValorUser}
        onClose={() => setEditValorUser(null)}
        title={editValorUser ? `Alterar valor – ${editValorUser.nome}` : 'Alterar valor'}
        size="md"
        footer={
          <>
            <Button variant="secondary" onClick={() => setEditValorUser(null)}>
              Cancelar
            </Button>
            <Button onClick={saveValorModal} disabled={savingValor}>
              {savingValor ? 'Salvando...' : 'Salvar'}
            </Button>
          </>
        }
      >
        {editValorUser && (
          <div className="space-y-4">
            <p className="text-sm text-gray-600">
              Referência: {MESES_LABELS[selectedMes]} de {selectedAno}. Opcionalmente aplique o mesmo valor a todos os meses do ano.
            </p>
            <p className="text-sm text-amber-700 bg-amber-50 rounded-lg px-3 py-2">
              A alteração será registrada como proposta e só terá efeito após aprovação do admin.
            </p>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Valor (R$)</label>
              <input
                type="text"
                inputMode="decimal"
                placeholder="0,00"
                value={modalValor}
                onChange={(e) => {
                  const v = e.target.value.replace(',', '.')
                  if (v === '' || /^\d*\.?\d*$/.test(v)) setModalValor(e.target.value)
                }}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
              />
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="apply-all-months"
                checked={applyToAllMonths}
                onChange={(e) => setApplyToAllMonths(e.target.checked)}
                className="rounded border-gray-300 text-orange-600 focus:ring-orange-500"
              />
              <label htmlFor="apply-all-months" className="text-sm font-medium text-gray-700">
                Aplicar este valor a todos os meses do ano ({selectedAno})
              </label>
            </div>
          </div>
        )}
      </Modal>

      <Modal
        isOpen={!!notifyUser}
        onClose={() => setNotifyUser(null)}
        title={notifyUser ? `Enviar notificação de pagamento – ${notifyUser.nome}` : 'Enviar notificação'}
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={() => setNotifyUser(null)}>
              Cancelar
            </Button>
            <Button onClick={submitNotifyPayment} disabled={sendingNotify}>
              {sendingNotify ? 'Enviando...' : 'Enviar notificação'}
            </Button>
          </>
        }
      >
        {notifyUser && (
          <div className="space-y-4">
            <p className="text-sm text-gray-600">
              Revise o e-mail abaixo antes de enviar. Você pode editar a mensagem e anexar um arquivo. Ao clicar em &quot;Enviar notificação&quot;, o pagamento será marcado como pago e a notificação in-app também será registrada.
            </p>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Para (e-mail)</label>
              <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-800">
                {(notifyUser.emailPessoal?.trim() || notifyUser.email)}
              </div>
              <p className="text-xs text-gray-500 mt-0.5">
                {notifyUser.emailPessoal ? 'Notificação enviada ao email pessoal.' : 'Email pessoal não cadastrado; será enviado ao email de acesso.'}
              </p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Assunto</label>
              <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-800">
                Pagamento confirmado – {MESES_LABELS[selectedMes]} de {selectedAno}
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Mensagem</label>
              <textarea
                rows={8}
                value={notifyMessage}
                onChange={(e) => setNotifyMessage(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                placeholder="Texto do e-mail..."
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Anexo (opcional)</label>
              <input
                type="file"
                accept="*/*"
                onChange={(e) => setNotifyFile(e.target.files?.[0] ?? null)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm file:mr-3 file:rounded file:border-0 file:bg-orange-50 file:px-3 file:py-1 file:text-orange-700 focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
              />
              {notifyFile && (
                <p className="text-xs text-gray-500 mt-1">
                  Arquivo selecionado: {notifyFile.name} ({(notifyFile.size / 1024).toFixed(1)} KB)
                </p>
              )}
            </div>
          </div>
        )}
      </Modal>
    </AdminLayout>
  )
}
