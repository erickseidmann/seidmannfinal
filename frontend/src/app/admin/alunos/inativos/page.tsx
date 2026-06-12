/**
 * Alunos inativos — listagem dedicada (fora das listas operacionais).
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
import RecordAuditLabel from '@/components/admin/RecordAuditLabel'
import { ArrowLeft, Loader2, Power, Search } from 'lucide-react'
import SeidmannLoading from '@/components/ui/SeidmannLoading'

interface InactiveStudent {
  id: string
  nome: string
  email: string
  whatsapp: string
  inactiveAt: string | null
  inativadoPorNome: string | null
  motivoInativacao: string | null
  criadoEm: string
  atualizadoEm?: string | null
  createdByName?: string | null
  updatedByName?: string | null
}

export default function AlunosInativosPage() {
  const router = useRouter()
  const [students, setStudents] = useState<InactiveStudent[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null)
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
      const res = await fetch(`/api/admin/enrollments?${params}`, { credentials: 'include' })
      if (!res.ok) {
        if (res.status === 401 || res.status === 403) {
          router.push('/login?tab=admin')
          return
        }
        throw new Error('Erro ao carregar')
      }
      const json = await res.json()
      if (json.ok) {
        setStudents(
          (json.data.enrollments ?? []).map(
            (s: {
              id: string
              nome: string
              email: string
              whatsapp: string
              inactiveAt?: string | null
              inativadoPorNome?: string | null
              motivoInativacao?: string | null
              criadoEm: string
              atualizadoEm?: string | null
              createdByName?: string | null
              updatedByName?: string | null
            }) => ({
              id: s.id,
              nome: s.nome,
              email: s.email,
              whatsapp: s.whatsapp,
              inactiveAt: s.inactiveAt ?? null,
              inativadoPorNome: s.inativadoPorNome ?? null,
              motivoInativacao: s.motivoInativacao ?? null,
              criadoEm: s.criadoEm,
              atualizadoEm: s.atualizadoEm ?? null,
              createdByName: s.createdByName ?? null,
              updatedByName: s.updatedByName ?? null,
            })
          )
        )
      }
    } catch {
      setToast({ message: 'Erro ao carregar alunos inativos', type: 'error' })
    } finally {
      setLoading(false)
    }
  }, [search, router])

  useEffect(() => {
    fetchInactive()
  }, [fetchInactive])

  const handleReactivate = (s: InactiveStudent) => {
    setConfirmModal({
      title: 'Reativar aluno',
      message: `Reativar ${s.nome}? O acesso à plataforma será restaurado se houver conta vinculada.`,
      onConfirm: async () => {
        try {
          const res = await fetch(`/api/admin/enrollments/${s.id}/status`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ status: 'ACTIVE' }),
          })
          const json = await res.json()
          if (!res.ok || !json.ok) throw new Error(json.message || 'Erro')
          setToast({ message: 'Aluno reativado', type: 'success' })
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
            href="/admin/alunos"
            className="inline-flex items-center gap-1.5 text-sm text-gray-600 hover:text-brand-orange mb-3"
          >
            <ArrowLeft className="w-4 h-4" />
            Voltar para Alunos
          </Link>
          <h1 className="text-2xl md:text-3xl font-bold text-gray-900">Alunos inativos</h1>
          <p className="text-gray-600 mt-1 text-sm md:text-base">
            Alunos desativados não aparecem na lista principal, calendário operacional, notificações
            nem no acesso à plataforma (quando há conta vinculada).
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
        ) : students.length === 0 ? (
          <p className="text-gray-500 text-center py-12">Nenhum aluno inativo encontrado.</p>
        ) : (
          <TableScrollArea className="rounded-xl border border-gray-200 bg-white shadow-sm">
            <table className="min-w-full text-sm table-auto">
              <thead className="bg-gray-50 text-left text-xs font-semibold text-gray-600 uppercase">
                <tr>
                  <th className="px-4 py-3 min-w-[11rem]">Nome</th>
                  <th className="px-4 py-3">E-mail</th>
                  <th className="px-4 py-3">Motivo</th>
                  <th className="px-4 py-3">Inativado por</th>
                  <th className="px-4 py-3">Inativado em</th>
                  <th className="px-4 py-3 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {students.map((s) => (
                  <tr key={s.id} className="hover:bg-gray-50/80 align-top">
                    <td className="px-4 py-3 font-medium text-gray-900 min-w-[11rem]">
                      <div className="min-w-max">
                        <span>{s.nome}</span>
                        <RecordAuditLabel
                          criadoEm={s.criadoEm}
                          atualizadoEm={s.atualizadoEm}
                          createdByName={s.createdByName}
                          updatedByName={s.updatedByName}
                        />
                      </div>
                    </td>
                    <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{s.email}</td>
                    <td className="px-4 py-3 text-gray-700 text-sm max-w-[14rem] whitespace-normal">
                      {s.motivoInativacao?.trim() || '—'}
                    </td>
                    <td className="px-4 py-3 text-gray-700 whitespace-nowrap">
                      {s.inativadoPorNome?.trim() || 'Não registrado'}
                    </td>
                    <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{formatDate(s.inactiveAt)}</td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleReactivate(s)}
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
