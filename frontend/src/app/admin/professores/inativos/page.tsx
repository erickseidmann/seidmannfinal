/**
 * Professores inativos — listagem dedicada (fora das listas operacionais).
 */

'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import AdminLayout from '@/components/admin/AdminLayout'
import Button from '@/components/ui/Button'
import Toast from '@/components/admin/Toast'
import ConfirmModal from '@/components/admin/ConfirmModal'
import TableScrollArea from '@/components/admin/TableScrollArea'
import { ArrowLeft, Loader2, Power, Search } from 'lucide-react'
import SeidmannLoading from '@/components/ui/SeidmannLoading'

interface InactiveTeacher {
  id: string
  nome: string
  email: string
  whatsapp: string | null
  inactiveAt: string | null
  criadoEm: string
}

export default function ProfessoresInativosPage() {
  const router = useRouter()
  const [teachers, setTeachers] = useState<InactiveTeacher[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(
    null
  )
  const [confirmModal, setConfirmModal] = useState<{
    title: string
    message: string
    onConfirm: () => void
  } | null>(null)

  const fetchInactive = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ status: 'INACTIVE', limit: '500' })
      if (search.trim()) params.set('search', search.trim())
      const res = await fetch(`/api/admin/teachers?${params}`, { credentials: 'include' })
      if (!res.ok) {
        if (res.status === 401 || res.status === 403) {
          router.push('/login?tab=admin')
          return
        }
        throw new Error('Erro ao carregar')
      }
      const json = await res.json()
      if (json.ok) {
        setTeachers(
          (json.data.teachers ?? []).map(
            (t: {
              id: string
              nome: string
              email: string
              whatsapp: string | null
              inactiveAt: string | null
              criadoEm: string
            }) => ({
              id: t.id,
              nome: t.nome,
              email: t.email,
              whatsapp: t.whatsapp,
              inactiveAt: t.inactiveAt,
              criadoEm: t.criadoEm,
            })
          )
        )
      }
    } catch {
      setToast({ message: 'Erro ao carregar professores inativos', type: 'error' })
    } finally {
      setLoading(false)
    }
  }, [search, router])

  useEffect(() => {
    fetchInactive()
  }, [fetchInactive])

  const handleReactivate = (t: InactiveTeacher) => {
    setConfirmModal({
      title: 'Reativar professor',
      message: `Reativar ${t.nome}? O acesso à plataforma será restaurado se houver conta vinculada.`,
      onConfirm: async () => {
        try {
          const res = await fetch(`/api/admin/teachers/${t.id}/toggle`, {
            method: 'POST',
            credentials: 'include',
          })
          const json = await res.json()
          if (!res.ok || !json.ok) throw new Error(json.message || 'Erro')
          setToast({ message: 'Professor reativado', type: 'success' })
          fetchInactive()
        } catch (err) {
          setToast({
            message: err instanceof Error ? err.message : 'Erro ao reativar',
            type: 'error',
          })
        }
      },
    })
  }

  const formatDate = (iso: string | null) => {
    if (!iso) return '—'
    try {
      return new Date(iso).toLocaleDateString('pt-BR')
    } catch {
      return iso
    }
  }

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div>
          <Link
            href="/admin/professores"
            className="inline-flex items-center gap-1.5 text-sm text-gray-600 hover:text-brand-orange mb-3"
          >
            <ArrowLeft className="w-4 h-4" />
            Voltar para Professores
          </Link>
          <h1 className="text-2xl md:text-3xl font-bold text-gray-900">Professores inativos</h1>
          <p className="text-gray-600 mt-1 text-sm md:text-base">
            Professores desativados não aparecem em outras listas, calendário, pagamentos dos meses
            seguintes à inativação, notificações nem no acesso à plataforma.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 sm:items-end">
          <div className="flex-1">
            <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">
              Buscar por nome, e-mail ou WhatsApp
            </label>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && fetchInactive()}
              placeholder="Nome, e-mail ou WhatsApp"
              className="input w-full text-sm"
            />
          </div>
          <Button variant="outline" onClick={() => fetchInactive()} className="shrink-0">
            <Search className="w-4 h-4 mr-2" />
            Pesquisar
          </Button>
        </div>

        {loading ? (
          <SeidmannLoading variant="section" className="py-16" />
        ) : teachers.length === 0 ? (
          <p className="text-gray-500 text-center py-12">Nenhum professor inativo encontrado.</p>
        ) : (
          <TableScrollArea className="rounded-xl border border-gray-200 bg-white shadow-sm">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50 text-left text-xs font-semibold text-gray-600 uppercase">
                <tr>
                  <th className="px-4 py-3">Nome</th>
                  <th className="px-4 py-3">E-mail</th>
                  <th className="px-4 py-3">Inativado em</th>
                  <th className="px-4 py-3">Cadastro</th>
                  <th className="px-4 py-3 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {teachers.map((t) => (
                  <tr key={t.id} className="hover:bg-gray-50/80">
                    <td className="px-4 py-3 font-medium text-gray-900">{t.nome}</td>
                    <td className="px-4 py-3 text-gray-600">{t.email}</td>
                    <td className="px-4 py-3 text-gray-600">{formatDate(t.inactiveAt)}</td>
                    <td className="px-4 py-3 text-gray-500">{formatDate(t.criadoEm)}</td>
                    <td className="px-4 py-3 text-right">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleReactivate(t)}
                        className="inline-flex items-center gap-1"
                      >
                        <Power className="w-4 h-4" />
                        Reativar
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableScrollArea>
        )}
      </div>

      {confirmModal && (
        <ConfirmModal
          isOpen
          title={confirmModal.title}
          message={confirmModal.message}
          onConfirm={() => {
            confirmModal.onConfirm()
            setConfirmModal(null)
          }}
          onClose={() => setConfirmModal(null)}
        />
      )}
      {toast && (
        <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />
      )}
    </AdminLayout>
  )
}
