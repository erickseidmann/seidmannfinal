'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import AdminLayout from '@/components/admin/AdminLayout'
import Toast from '@/components/admin/Toast'
import { useConfirmDialog } from '@/hooks/useConfirmDialog'
import TableScrollArea from '@/components/admin/TableScrollArea'
import SeidmannLoading from '@/components/ui/SeidmannLoading'
import Button from '@/components/ui/Button'
import {
  Award,
  Copy,
  ExternalLink,
  FileText,
  Link2,
  Plus,
  QrCode,
  Trash2,
} from 'lucide-react'
import CertificateQrCode from '@/components/admin/CertificateQrCode'
import { defaultCourseBody } from '@/lib/certificate-format'
import { copyCertificateQrCode } from '@/lib/copy-qr-code'
import type { OnlineCertificateTypeValue } from '@/lib/certificate-constants'

type CertificateRow = {
  id: string
  certificateNo: string
  type: OnlineCertificateTypeValue
  typeLabel: string
  studentName: string
  studentCpf: string
  courseTitle: string
  totalHours: number
  issueDate: string
  pdfPath: string
  validationUrl: string
}

function todayInputDate(): string {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export default function AdminCertificadosPage() {
  const { confirm, ConfirmDialog } = useConfirmDialog()
  const [rows, setRows] = useState<CertificateRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [lastGenerated, setLastGenerated] = useState<CertificateRow | null>(null)

  const [form, setForm] = useState({
    type: 'CONCLUSAO' as OnlineCertificateTypeValue,
    studentName: '',
    studentCpf: '',
    courseTitle: 'Inglês – Formação Completa (CEFR A1 a C1/C2)',
    courseBody: '',
    periodStart: '2022-01-01',
    periodEnd: todayInputDate(),
    totalHours: '430',
    issueDate: todayInputDate(),
  })

  const suggestedBody = useMemo(() => {
    const totalHours = parseInt(form.totalHours, 10) || 0
    const [sy, sm, sd] = form.periodStart.split('-')
    const [ey, em, ed] = form.periodEnd.split('-')
    const periodStart = `${sd}/${sm}/${sy}`
    const periodEnd = `${ed}/${em}/${ey}`
    return defaultCourseBody(form.type, {
      periodStart,
      periodEnd,
      totalHours,
      courseTitle: form.courseTitle,
    })
  }, [form.type, form.periodStart, form.periodEnd, form.totalHours, form.courseTitle])

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/admin/certificates', { credentials: 'include' })
      const json = await res.json()
      if (!json.ok) {
        setError(json.message || 'Erro ao carregar')
        setRows([])
        return
      }
      setRows(json.data || [])
    } catch {
      setError('Erro de rede')
      setRows([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const copyText = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setToast({ message: `${label} copiado`, type: 'success' })
    } catch {
      setToast({ message: 'Não foi possível copiar', type: 'error' })
    }
  }

  const copyQr = async (validationUrl: string) => {
    try {
      const ok = await copyCertificateQrCode(validationUrl)
      setToast({
        message: ok ? 'QR Code copiado' : 'Não foi possível copiar o QR Code',
        type: ok ? 'success' : 'error',
      })
    } catch {
      setToast({ message: 'Não foi possível copiar o QR Code', type: 'error' })
    }
  }

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    try {
      const res = await fetch('/api/admin/certificates', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          totalHours: parseInt(form.totalHours, 10),
          courseBody: form.courseBody.trim() || undefined,
        }),
      })
      const json = await res.json()
      if (!json.ok) {
        setToast({ message: json.message || 'Erro ao gerar', type: 'error' })
        return
      }
      setLastGenerated(json.data)
      setToast({ message: 'Certificado gerado com sucesso', type: 'success' })
      setShowForm(false)
      setForm((f) => ({ ...f, studentName: '', studentCpf: '', courseBody: '' }))
      await load()
    } catch {
      setToast({ message: 'Erro ao gerar certificado', type: 'error' })
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (row: CertificateRow) => {
    const ok = await confirm({
      title: 'Excluir certificado',
      message: `Desativar o certificado ${row.certificateNo} de ${row.studentName}? O link de validação deixará de funcionar.`,
      confirmLabel: 'Excluir',
      variant: 'danger',
    })
    if (!ok) return
    try {
      const res = await fetch(`/api/admin/certificates/${row.id}`, {
        method: 'DELETE',
        credentials: 'include',
      })
      const json = await res.json()
      if (!json.ok) {
        setToast({ message: json.message || 'Erro ao excluir', type: 'error' })
        return
      }
      setToast({ message: 'Certificado excluído', type: 'success' })
      if (lastGenerated?.id === row.id) setLastGenerated(null)
      await load()
    } catch {
      setToast({ message: 'Erro ao excluir', type: 'error' })
    }
  }

  return (
    <AdminLayout>
      <div className="max-w-6xl mx-auto px-4 py-8">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
              <Award className="w-7 h-7 text-brand-orange" />
              Certificados
            </h1>
            <p className="text-gray-500 mt-1 text-sm">
              Gere certificados digitais com validação por link e QR Code. Apenas administradores podem excluir.
            </p>
          </div>
          <Button
            type="button"
            onClick={() => setShowForm((v) => !v)}
            className="inline-flex items-center gap-2"
          >
            <Plus className="w-5 h-5" />
            Gerar certificado online
          </Button>
        </div>

        {lastGenerated && (
          <div className="mb-6 rounded-xl border border-emerald-200 bg-emerald-50 p-4 space-y-3">
            <p className="font-semibold text-emerald-900">Último certificado gerado</p>
            <p className="text-sm text-emerald-800">
              <strong>Certificado nº {lastGenerated.certificateNo}</strong>
            </p>
            <p className="text-sm text-emerald-800 break-all">
              Valide este documento:{' '}
              <a href={lastGenerated.validationUrl} target="_blank" rel="noopener noreferrer" className="underline">
                {lastGenerated.validationUrl}
              </a>
            </p>
            <CertificateQrCode
              validationUrl={lastGenerated.validationUrl}
              className="pt-1"
              onCopied={() => setToast({ message: 'QR Code copiado', type: 'success' })}
              onCopyError={() =>
                setToast({ message: 'Não foi possível copiar o QR Code', type: 'error' })
              }
            />
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => void copyText(lastGenerated.validationUrl, 'Link')}
              >
                <Copy className="w-4 h-4 mr-1" />
                Copiar link
              </Button>
              <a
                href={lastGenerated.pdfPath}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 px-3 py-1.5 text-sm rounded-lg border border-gray-300 bg-white hover:bg-gray-50"
              >
                <FileText className="w-4 h-4" />
                Abrir PDF
              </a>
            </div>
          </div>
        )}

        {showForm && (
          <form
            onSubmit={(e) => void handleGenerate(e)}
            className="mb-8 rounded-xl border border-gray-200 bg-white shadow-sm p-5 space-y-4"
          >
            <h2 className="text-lg font-semibold text-gray-900">Gerar certificado online</h2>

            <div className="grid sm:grid-cols-2 gap-4">
              <label className="block text-sm">
                <span className="font-medium text-gray-700">Tipo de certificado</span>
                <select
                  className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2"
                  value={form.type}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      type: e.target.value as OnlineCertificateTypeValue,
                      courseBody: '',
                    }))
                  }
                >
                  <option value="CONCLUSAO">Certificado de conclusão</option>
                  <option value="DECLARACAO">Declaração de vínculo e período de estudos</option>
                </select>
              </label>
              <label className="block text-sm">
                <span className="font-medium text-gray-700">Data de emissão</span>
                <input
                  type="date"
                  className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2"
                  value={form.issueDate}
                  onChange={(e) => setForm((f) => ({ ...f, issueDate: e.target.value }))}
                  required
                />
              </label>
              <label className="block text-sm">
                <span className="font-medium text-gray-700">Nome do aluno</span>
                <input
                  className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2"
                  value={form.studentName}
                  onChange={(e) => setForm((f) => ({ ...f, studentName: e.target.value }))}
                  required
                />
              </label>
              <label className="block text-sm">
                <span className="font-medium text-gray-700">CPF do aluno</span>
                <input
                  className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2"
                  value={form.studentCpf}
                  onChange={(e) => setForm((f) => ({ ...f, studentCpf: e.target.value }))}
                  placeholder="000.000.000-00"
                  required
                />
              </label>
              <label className="block text-sm sm:col-span-2">
                <span className="font-medium text-gray-700">Título / curso do certificado</span>
                <input
                  className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2"
                  value={form.courseTitle}
                  onChange={(e) => setForm((f) => ({ ...f, courseTitle: e.target.value }))}
                  required
                />
              </label>
              <label className="block text-sm">
                <span className="font-medium text-gray-700">Período — início</span>
                <input
                  type="date"
                  className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2"
                  value={form.periodStart}
                  onChange={(e) => setForm((f) => ({ ...f, periodStart: e.target.value, courseBody: '' }))}
                  required
                />
              </label>
              <label className="block text-sm">
                <span className="font-medium text-gray-700">Período — fim</span>
                <input
                  type="date"
                  className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2"
                  value={form.periodEnd}
                  onChange={(e) => setForm((f) => ({ ...f, periodEnd: e.target.value, courseBody: '' }))}
                  required
                />
              </label>
              <label className="block text-sm">
                <span className="font-medium text-gray-700">Quantidade de horas</span>
                <input
                  type="number"
                  min={1}
                  className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2"
                  value={form.totalHours}
                  onChange={(e) => setForm((f) => ({ ...f, totalHours: e.target.value, courseBody: '' }))}
                  required
                />
              </label>
            </div>

            <label className="block text-sm">
              <span className="font-medium text-gray-700">Corpo do certificado</span>
              <p className="text-xs text-gray-500 mt-0.5 mb-1">
                Texto principal do documento. Deixe em branco para usar o modelo padrão do tipo selecionado.
              </p>
              <textarea
                className="w-full rounded-lg border border-gray-300 px-3 py-2 min-h-[160px] text-sm"
                value={form.courseBody}
                onChange={(e) => setForm((f) => ({ ...f, courseBody: e.target.value }))}
                placeholder={suggestedBody}
              />
            </label>

            <div className="flex flex-wrap gap-2 pt-2">
              <Button type="submit" disabled={saving}>
                {saving ? 'Gerando…' : 'Gerar certificado'}
              </Button>
              <Button type="button" variant="outline" onClick={() => setShowForm(false)}>
                Cancelar
              </Button>
            </div>
          </form>
        )}

        <h2 className="text-base font-semibold text-gray-800 mb-3">Certificados ativos</h2>

        {loading ? (
          <SeidmannLoading variant="section" className="py-12" />
        ) : error ? (
          <p className="text-red-600">{error}</p>
        ) : rows.length === 0 ? (
          <p className="text-gray-500 py-8">Nenhum certificado ativo.</p>
        ) : (
          <TableScrollArea>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-left text-gray-500">
                  <th className="py-3 pr-4 font-medium">Nº</th>
                  <th className="py-3 pr-4 font-medium">Aluno</th>
                  <th className="py-3 pr-4 font-medium">CPF</th>
                  <th className="py-3 pr-4 font-medium">Tipo</th>
                  <th className="py-3 pr-4 font-medium">Horas</th>
                  <th className="py-3 pr-4 font-medium">Emissão</th>
                  <th className="py-3 font-medium text-right">Ações</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} className="border-b border-gray-100">
                    <td className="py-3 pr-4 font-mono text-xs">{row.certificateNo}</td>
                    <td className="py-3 pr-4">{row.studentName}</td>
                    <td className="py-3 pr-4">{row.studentCpf}</td>
                    <td className="py-3 pr-4 text-xs">{row.typeLabel}</td>
                    <td className="py-3 pr-4">{row.totalHours}h</td>
                    <td className="py-3 pr-4">
                      {new Date(row.issueDate + 'T12:00:00').toLocaleDateString('pt-BR')}
                    </td>
                    <td className="py-3">
                      <div className="flex justify-end gap-1 flex-wrap">
                        <button
                          type="button"
                          title="Copiar link de validação"
                          onClick={() => void copyText(row.validationUrl, 'Link')}
                          className="p-2 rounded-lg text-gray-600 hover:bg-gray-100"
                        >
                          <Link2 className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          title="Copiar QR Code"
                          onClick={() => void copyQr(row.validationUrl)}
                          className="p-2 rounded-lg text-gray-600 hover:bg-gray-100"
                        >
                          <QrCode className="w-4 h-4" />
                        </button>
                        <a
                          href={row.pdfPath}
                          target="_blank"
                          rel="noopener noreferrer"
                          title="Abrir PDF"
                          className="p-2 rounded-lg text-gray-600 hover:bg-gray-100"
                        >
                          <ExternalLink className="w-4 h-4" />
                        </a>
                        <button
                          type="button"
                          title="Excluir certificado"
                          onClick={() => void handleDelete(row)}
                          className="p-2 rounded-lg text-red-600 hover:bg-red-50"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableScrollArea>
        )}
      </div>

      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
      {ConfirmDialog}
    </AdminLayout>
  )
}
