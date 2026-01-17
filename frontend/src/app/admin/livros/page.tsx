/**
 * Página Admin: Gerenciar Livros
 * 
 * Liberar livros para usuários
 */

'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import AdminLayout from '@/components/admin/AdminLayout'
import Table from '@/components/admin/Table'
import Modal from '@/components/admin/Modal'
import Button from '@/components/ui/Button'
import { Plus, Search } from 'lucide-react'

interface BookRelease {
  id: string
  userId: string
  user: { id: string; nome: string; email: string }
  bookCode: string
  releasedByAdminEmail: string
  criadoEm: string
}

interface User {
  id: string
  nome: string
  email: string
}

export default function AdminLivrosPage() {
  const router = useRouter()
  const [releases, setReleases] = useState<BookRelease[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [searchUserId, setSearchUserId] = useState('')
  const [formData, setFormData] = useState({
    userId: '',
    bookCode: '',
  })

  useEffect(() => {
    fetchReleases()
  }, [searchUserId])

  const fetchReleases = async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (searchUserId) params.append('userId', searchUserId)

      const response = await fetch(`/api/admin/books/releases?${params.toString()}`, {
        credentials: 'include',
      })

      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          router.push('/login?tab=admin')
          return
        }
        throw new Error('Erro ao carregar liberações')
      }

      const json = await response.json()
      if (json.ok) {
        setReleases(json.data.releases)
      } else {
        throw new Error(json.message || 'Erro ao carregar liberações')
      }
    } catch (err) {
      console.error('Erro ao buscar liberações:', err)
      setError(err instanceof Error ? err.message : 'Erro ao carregar dados')
    } finally {
      setLoading(false)
    }
  }

  const handleCreate = () => {
    setFormData({ userId: searchUserId || '', bookCode: '' })
    setIsModalOpen(true)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    try {
      const response = await fetch('/api/admin/books/release', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(formData),
      })

      const json = await response.json()

      if (!response.ok || !json.ok) {
        if (response.status === 401 || response.status === 403) {
          router.push('/login?tab=admin')
          return
        }
        throw new Error(json.message || 'Erro ao liberar livro')
      }

      alert(json.data.message || 'Livro liberado com sucesso!')
      setIsModalOpen(false)
      fetchReleases()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Erro ao liberar livro')
    }
  }

  const columns = [
    { key: 'user', label: 'Usuário', render: (r: BookRelease) => r.user.nome },
    { key: 'user.email', label: 'Email', render: (r: BookRelease) => r.user.email },
    { key: 'bookCode', label: 'Código do Livro' },
    { key: 'releasedByAdminEmail', label: 'Liberado por' },
    {
      key: 'criadoEm',
      label: 'Data',
      render: (r: BookRelease) => new Date(r.criadoEm).toLocaleDateString('pt-BR'),
    },
  ]

  return (
    <AdminLayout>
      <div>
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 mb-2">Livros</h1>
            <p className="text-sm text-gray-600">Gerencie liberações de livros</p>
          </div>
          <Button onClick={handleCreate} variant="primary" size="md" className="flex items-center gap-2">
            <Plus className="w-4 h-4" />
            Liberar Livro
          </Button>
        </div>

        {/* Buscar por usuário */}
        <div className="mb-6">
          <label className="block text-sm font-semibold text-gray-700 mb-2">
            Filtrar por Usuário (ID)
          </label>
          <div className="flex gap-2">
            <input
              type="text"
              value={searchUserId}
              onChange={(e) => setSearchUserId(e.target.value)}
              className="input flex-1"
              placeholder="ID do usuário (deixe vazio para ver todos)"
            />
            <Button onClick={fetchReleases} variant="outline" size="md">
              <Search className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg text-red-800">
            {error}
          </div>
        )}

        <Table
          columns={columns}
          data={releases}
          loading={loading}
          emptyMessage="Nenhuma liberação encontrada"
        />

        {/* Modal Liberar Livro */}
        <Modal
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          title="Liberar Livro"
          size="md"
          footer={
            <>
              <Button variant="outline" onClick={() => setIsModalOpen(false)}>
                Cancelar
              </Button>
              <Button variant="primary" onClick={handleSubmit}>
                Liberar
              </Button>
            </>
          }
        >
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                ID do Usuário <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={formData.userId}
                onChange={(e) => setFormData({ ...formData, userId: e.target.value })}
                className="input w-full"
                required
                placeholder="ID do usuário"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Código do Livro <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={formData.bookCode}
                onChange={(e) => setFormData({ ...formData, bookCode: e.target.value })}
                className="input w-full"
                required
                placeholder="Ex: BOOK_1, BOOK_2, etc"
              />
            </div>
          </form>
        </Modal>
      </div>
    </AdminLayout>
  )
}
