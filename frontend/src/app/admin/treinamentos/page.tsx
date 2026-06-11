'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import AdminLayout from '@/components/admin/AdminLayout'
import Toast from '@/components/admin/Toast'
import { useConfirmDialog } from '@/hooks/useConfirmDialog'
import TableScrollArea from '@/components/admin/TableScrollArea'
import { GraduationCap, Loader2, Pencil, Plus, Trash2, Users } from 'lucide-react'

type TrainingRow = {
  id: string
  title: string
  contentType: string
  active: boolean
  publishedAt: string
  questionCount: number
  responseCount: number
}

function contentTypeLabel(t: string) {
  return t === 'TEXT' ? 'Texto' : 'Vídeo'
}

export default function AdminTreinamentosPage() {
  const { confirm, ConfirmDialog } = useConfirmDialog()
  const [rows, setRows] = useState<TrainingRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/admin/trainings', { credentials: 'include' })
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

  const deleteTraining = async (row: TrainingRow) => {
    const ok = await confirm({
      title: 'Excluir treinamento',
      message: `Excluir "${row.title}"? Esta ação não pode ser desfeita.`,
      confirmLabel: 'Excluir',
      variant: 'danger',
    })
    if (!ok) return
    try {
      const res = await fetch(`/api/admin/trainings/${row.id}`, {
        method: 'DELETE',
        credentials: 'include',
      })
      const json = await res.json()
      if (!json.ok) {
        setToast({ message: json.message || 'Erro ao excluir', type: 'error' })
        return
      }
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
              <GraduationCap className="w-7 h-7 text-brand-orange" />
              Treinamentos
            </h1>
            <p className="text-gray-500 mt-1 text-sm">
              Vídeos ou textos com perguntas para os professores. Novos conteúdos notificam todos os professores ativos.
            </p>
          </div>
          <Link
            href="/admin/treinamentos/novo"
            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-brand-orange text-white rounded-xl font-medium hover:bg-orange-600 transition-colors"
          >
            <Plus className="w-5 h-5" />
            Novo treinamento
          </Link>
        </div>

        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="w-8 h-8 animate-spin text-brand-orange" />
          </div>
        ) : error ? (
          <p className="text-red-600">{error}</p>
        ) : rows.length === 0 ? (
          <p className="text-gray-500 py-8">Nenhum treinamento cadastrado.</p>
        ) : (
          <TableScrollArea>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-left text-gray-500">
                  <th className="py-3 pr-4 font-medium">Título</th>
                  <th className="py-3 pr-4 font-medium">Tipo</th>
                  <th className="py-3 pr-4 font-medium">Perguntas</th>
                  <th className="py-3 pr-4 font-medium">Respostas</th>
                  <th className="py-3 pr-4 font-medium">Status</th>
                  <th className="py-3 pr-4 font-medium">Publicado em</th>
                  <th className="py-3 font-medium text-right">Ações</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} className="border-b border-gray-100 hover:bg-gray-50/80">
                    <td className="py-3 pr-4 font-medium text-gray-900">{row.title}</td>
                    <td className="py-3 pr-4 text-gray-600">{contentTypeLabel(row.contentType)}</td>
                    <td className="py-3 pr-4 text-gray-600">{row.questionCount}</td>
                    <td className="py-3 pr-4">
                      <Link
                        href={`/admin/treinamentos/${row.id}/respostas`}
                        className="text-brand-orange hover:underline font-medium"
                      >
                        {row.responseCount}
                      </Link>
                    </td>
                    <td className="py-3 pr-4">
                      <span
                        className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${
                          row.active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'
                        }`}
                      >
                        {row.active ? 'Publicado' : 'Rascunho'}
                      </span>
                    </td>
                    <td className="py-3 pr-4 text-gray-600">
                      {new Date(row.publishedAt).toLocaleDateString('pt-BR')}
                    </td>
                    <td className="py-3 text-right">
                      <div className="flex justify-end gap-1">
                        <Link
                          href={`/admin/treinamentos/${row.id}/respostas`}
                          className="p-2 text-gray-500 hover:text-brand-orange rounded-lg hover:bg-orange-50"
                          title="Ver respostas"
                        >
                          <Users className="w-4 h-4" />
                        </Link>
                        <Link
                          href={`/admin/treinamentos/${row.id}`}
                          className="p-2 text-gray-500 hover:text-brand-orange rounded-lg hover:bg-orange-50"
                          title="Editar"
                        >
                          <Pencil className="w-4 h-4" />
                        </Link>
                        <button
                          type="button"
                          onClick={() => deleteTraining(row)}
                          className="p-2 text-gray-500 hover:text-red-600 rounded-lg hover:bg-red-50"
                          title="Excluir"
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
      <ConfirmDialog />
    </AdminLayout>
  )
}
