/**
 * Página de Admin Dashboard
 * 
 * Dashboard para administradores aprovarem pagamentos e gerenciar matrículas.
 * Protegida por middleware (requer role ADMIN e status ACTIVE).
 */

'use client'

import { useState, useEffect, FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { Card } from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import AdminHeader from '@/components/admin/AdminHeader'
import { Search, Eye, CheckCircle, Ban, ArrowLeft } from 'lucide-react'

interface Enrollment {
  id: string
  nome: string
  email: string
  whatsapp: string
  idioma: string | null
  nivel: string | null
  status: string
  trackingCode: string | null
  criadoEm: string
  user: {
    id: string
    nome: string
    email: string
    whatsapp: string
  } | null
  paymentInfo: {
    id: string
    plan: string | null
    valorMensal: string | null
    paymentStatus: string | null
    dueDay: number | null
    transactionRef: string | null
  } | null
}

const STATUS_OPTIONS = [
  { value: '', label: 'Todos os status' },
  { value: 'LEAD', label: 'Lead' },
  { value: 'REGISTERED', label: 'Cadastrado' },
  { value: 'CONTRACT_ACCEPTED', label: 'Contrato Aceito' },
  { value: 'PAYMENT_PENDING', label: 'Pagamento Pendente' },
  { value: 'ACTIVE', label: 'Ativo' },
  { value: 'BLOCKED', label: 'Bloqueado' },
  { value: 'COMPLETED', label: 'Concluído' },
]

const STATUS_COLORS: Record<string, string> = {
  LEAD: 'bg-blue-100 text-blue-800',
  REGISTERED: 'bg-purple-100 text-purple-800',
  CONTRACT_ACCEPTED: 'bg-yellow-100 text-yellow-800',
  PAYMENT_PENDING: 'bg-orange-100 text-orange-800',
  ACTIVE: 'bg-green-100 text-green-800',
  BLOCKED: 'bg-red-100 text-red-800',
  COMPLETED: 'bg-gray-100 text-gray-800',
}

export default function AdminPage() {
  const router = useRouter()
  const [enrollments, setEnrollments] = useState<Enrollment[]>([])
  const [loading, setLoading] = useState(false)
  const [selectedStatus, setSelectedStatus] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedEnrollment, setSelectedEnrollment] = useState<Enrollment | null>(null)
  const [updating, setUpdating] = useState(false)
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null)

  // Carregar enrollments na montagem e quando filtros mudarem
  useEffect(() => {
    fetchEnrollments()
  }, [selectedStatus, searchQuery])

  const fetchEnrollments = async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (selectedStatus) {
        params.append('status', selectedStatus)
      }
      if (searchQuery.trim()) {
        params.append('search', searchQuery.trim())
      }

      const response = await fetch(`/api/admin/enrollments?${params.toString()}`, {
        credentials: 'include', // Incluir cookies
      })

      const json = await response.json()

      if (!response.ok || !json.ok) {
        if (response.status === 401 || response.status === 403) {
          router.push('/login?tab=admin')
          return
        }
        throw new Error(json.message || 'Erro ao carregar enrollments')
      }

      // Limitar a 50 enrollments
      const enrollmentsList = json.data.enrollments.slice(0, 50)
      setEnrollments(enrollmentsList)
    } catch (error) {
      console.error('Erro ao carregar enrollments:', error)
      showToast('error', error instanceof Error ? error.message : 'Erro ao carregar dados')
    } finally {
      setLoading(false)
    }
  }

  const handleAction = async (enrollmentId: string, action: 'approve' | 'complete') => {
    setUpdating(true)
    try {
      const response = await fetch(`/api/admin/enrollments/${enrollmentId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include', // Incluir cookies
        body: JSON.stringify({ action }),
      })

      const json = await response.json()

      if (!response.ok || !json.ok) {
        if (response.status === 401 || response.status === 403) {
          router.push('/login?tab=admin')
          return
        }
        throw new Error(json.message || 'Erro ao processar ação')
      }

      showToast('success', json.data.message || 'Ação executada com sucesso')
      setSelectedEnrollment(null)
      fetchEnrollments()
    } catch (error) {
      console.error('Erro ao processar ação:', error)
      showToast('error', error instanceof Error ? error.message : 'Erro ao processar ação')
    } finally {
      setUpdating(false)
    }
  }

  const showToast = (type: 'success' | 'error', message: string) => {
    setToast({ type, message })
    setTimeout(() => setToast(null), 5000)
  }

  return (
    <>
      <AdminHeader />
      <main className="min-h-screen bg-gradient-to-b from-orange-50 to-white pt-24 pb-20">
        <div className="container mx-auto px-4">
          <div className="max-w-7xl mx-auto">
            {/* Header */}
            <div className="mb-6">
              <h1 className="text-3xl font-bold text-gray-900 mb-2">Painel Admin</h1>
              <p className="text-sm text-gray-600">Gerenciar matrículas e aprovar pagamentos</p>
            </div>

          {/* Toast */}
          {toast && (
            <div
              className={`mb-6 p-4 rounded-lg border ${
                toast.type === 'success'
                  ? 'bg-green-50 border-green-200 text-green-800'
                  : 'bg-red-50 border-red-200 text-red-800'
              }`}
            >
              {toast.message}
            </div>
          )}

          {/* Filtros */}
          <Card className="p-6 mb-6">
            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <label htmlFor="status" className="block text-sm font-semibold text-gray-700 mb-2">
                  Filtrar por Status
                </label>
                <select
                  id="status"
                  value={selectedStatus}
                  onChange={(e) => setSelectedStatus(e.target.value)}
                  className="input w-full"
                >
                  {STATUS_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="search" className="block text-sm font-semibold text-gray-700 mb-2">
                  Buscar (nome, email, whatsapp)
                </label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
                  <input
                    type="text"
                    id="search"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Buscar..."
                    className="input w-full pl-10"
                  />
                </div>
              </div>
            </div>
          </Card>

          {/* Tabela */}
          <Card className="p-6">
            {loading ? (
              <div className="text-center py-12 text-gray-600">Carregando...</div>
            ) : enrollments.length === 0 ? (
              <div className="text-center py-12 text-gray-600">
                Nenhum enrollment encontrado com os filtros selecionados.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-gray-200">
                      <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700">Nome</th>
                      <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700">Email</th>
                      <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700">WhatsApp</th>
                      <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700">Status</th>
                      <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700">Criado em</th>
                      <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700">Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {enrollments.map((enrollment) => (
                      <tr key={enrollment.id} className="border-b border-gray-100 hover:bg-gray-50">
                        <td className="py-3 px-4 text-sm text-gray-900">{enrollment.nome}</td>
                        <td className="py-3 px-4 text-sm text-gray-600">{enrollment.email}</td>
                        <td className="py-3 px-4 text-sm text-gray-600">{enrollment.whatsapp}</td>
                        <td className="py-3 px-4">
                          <span
                            className={`inline-block px-2 py-1 rounded-full text-xs font-semibold ${
                              STATUS_COLORS[enrollment.status] || 'bg-gray-100 text-gray-800'
                            }`}
                          >
                            {enrollment.status}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-sm text-gray-600">
                          {new Date(enrollment.criadoEm).toLocaleDateString('pt-BR')}
                        </td>
                        <td className="py-3 px-4">
                          <div className="flex gap-2">
                            {(enrollment.status === 'LEAD' || enrollment.status === 'PAYMENT_PENDING') && (
                              <button
                                onClick={() => handleAction(enrollment.id, 'approve')}
                                disabled={updating}
                                className="text-sm text-brand-orange hover:text-orange-700 font-medium disabled:opacity-50"
                              >
                                Aprovar
                              </button>
                            )}
                            {enrollment.status !== 'COMPLETED' && enrollment.status !== 'BLOCKED' && (
                              <button
                                onClick={() => handleAction(enrollment.id, 'complete')}
                                disabled={updating}
                                className="text-sm text-gray-600 hover:text-gray-800 font-medium disabled:opacity-50"
                              >
                                Concluir
                              </button>
                            )}
                            <button
                              onClick={() => setSelectedEnrollment(enrollment)}
                              className="text-sm text-brand-orange hover:text-orange-700 font-medium flex items-center gap-1"
                            >
                              <Eye className="w-4 h-4" />
                              Detalhes
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          {/* Modal de Detalhes */}
          {selectedEnrollment && (
            <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
              <Card className="max-w-2xl w-full max-h-[90vh] overflow-y-auto">
                <div className="p-6">
                  <div className="flex items-center justify-between mb-6">
                    <h2 className="text-2xl font-bold text-gray-900">Detalhes da Matrícula</h2>
                    <button
                      onClick={() => setSelectedEnrollment(null)}
                      className="text-gray-400 hover:text-gray-600"
                    >
                      ✕
                    </button>
                  </div>

                  <div className="space-y-4 mb-6">
                    <div>
                      <label className="text-sm font-semibold text-gray-700">Nome</label>
                      <p className="text-gray-900">{selectedEnrollment.nome}</p>
                    </div>
                    <div className="grid md:grid-cols-2 gap-4">
                      <div>
                        <label className="text-sm font-semibold text-gray-700">Email</label>
                        <p className="text-gray-900">{selectedEnrollment.email}</p>
                      </div>
                      <div>
                        <label className="text-sm font-semibold text-gray-700">WhatsApp</label>
                        <p className="text-gray-900">{selectedEnrollment.whatsapp}</p>
                      </div>
                    </div>
                    <div className="grid md:grid-cols-2 gap-4">
                      <div>
                        <label className="text-sm font-semibold text-gray-700">Idioma</label>
                        <p className="text-gray-900">{selectedEnrollment.idioma || '-'}</p>
                      </div>
                      <div>
                        <label className="text-sm font-semibold text-gray-700">Nível</label>
                        <p className="text-gray-900">{selectedEnrollment.nivel || '-'}</p>
                      </div>
                    </div>
                    <div>
                      <label className="text-sm font-semibold text-gray-700">Status</label>
                      <p>
                        <span
                          className={`inline-block px-3 py-1 rounded-full text-sm font-semibold ${
                            STATUS_COLORS[selectedEnrollment.status] || 'bg-gray-100 text-gray-800'
                          }`}
                        >
                          {selectedEnrollment.status}
                        </span>
                      </p>
                    </div>
                    {selectedEnrollment.trackingCode && (
                      <div>
                        <label className="text-sm font-semibold text-gray-700">Código de Acompanhamento</label>
                        <p className="text-gray-900 font-mono">{selectedEnrollment.trackingCode}</p>
                      </div>
                    )}
                    {selectedEnrollment.paymentInfo && (
                      <div className="pt-4 border-t">
                        <h3 className="font-semibold text-gray-900 mb-3">Informações de Pagamento</h3>
                        <div className="grid md:grid-cols-2 gap-4">
                          {selectedEnrollment.paymentInfo.plan && (
                            <div>
                              <label className="text-sm font-semibold text-gray-700">Plano</label>
                              <p className="text-gray-900">{selectedEnrollment.paymentInfo.plan}</p>
                            </div>
                          )}
                          {selectedEnrollment.paymentInfo.valorMensal && (
                            <div>
                              <label className="text-sm font-semibold text-gray-700">Valor Mensal</label>
                              <p className="text-gray-900">
                                R$ {Number(selectedEnrollment.paymentInfo.valorMensal).toLocaleString('pt-BR', {
                                  minimumFractionDigits: 2,
                                  maximumFractionDigits: 2,
                                })}
                              </p>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Ações */}
                  <div className="pt-6 border-t space-y-3">
                    <h3 className="font-semibold text-gray-900 mb-3">Ações</h3>
                    <div className="flex gap-3">
                      {(selectedEnrollment.status === 'LEAD' || selectedEnrollment.status === 'PAYMENT_PENDING') && (
                        <Button
                          onClick={() => handleAction(selectedEnrollment.id, 'approve')}
                          disabled={updating}
                          variant="primary"
                          size="md"
                        >
                          <CheckCircle className="w-4 h-4 mr-2" />
                          Aprovar
                        </Button>
                      )}
                      {selectedEnrollment.status !== 'COMPLETED' && selectedEnrollment.status !== 'BLOCKED' && (
                        <Button
                          onClick={() => handleAction(selectedEnrollment.id, 'complete')}
                          disabled={updating}
                          variant="outline"
                          size="md"
                        >
                          Concluir
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              </Card>
            </div>
          )}
        </div>
      </div>
    </main>
    </>
  )
}
