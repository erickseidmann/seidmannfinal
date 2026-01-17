/**
 * Página Admin: Ver Todos os Enrollments
 * 
 * Lista completa de enrollments com filtros e ações
 */

'use client'

import AdminHeader from '@/components/admin/AdminHeader'
import { Card } from '@/components/ui/Card'
import { useRouter } from 'next/navigation'
import { useState, useEffect } from 'react'

interface Enrollment {
  id: string
  nome: string
  email: string
  whatsapp: string
  status: string
  trackingCode: string | null
  criadoEm: string
}

export default function AdminEnrollmentsPage() {
  const router = useRouter()
  const [enrollments, setEnrollments] = useState<Enrollment[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetchEnrollments()
  }, [])

  const fetchEnrollments = async () => {
    try {
      const response = await fetch('/api/admin/enrollments', {
        credentials: 'include',
      })

      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          router.push('/login?tab=admin')
          return
        }
        throw new Error('Erro ao carregar enrollments')
      }

      const json = await response.json()
      if (json.ok) {
        setEnrollments(json.data.enrollments || [])
      } else {
        throw new Error(json.message || 'Erro ao carregar enrollments')
      }
    } catch (err) {
      console.error('Erro ao buscar enrollments:', err)
      setError(err instanceof Error ? err.message : 'Erro ao carregar dados')
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <AdminHeader />
      <main className="min-h-screen bg-gradient-to-b from-orange-50 to-white pt-24 pb-20">
        <div className="container mx-auto px-4">
          <div className="max-w-7xl mx-auto">
            <div className="mb-8">
              <h1 className="text-3xl md:text-4xl font-bold text-gray-900 mb-2">
                Todos os Enrollments
              </h1>
              <p className="text-sm text-gray-600">
                Lista completa de matrículas e leads do sistema
              </p>
            </div>

            {loading ? (
              <Card className="p-6">
                <div className="text-center py-12 text-gray-600">Carregando...</div>
              </Card>
            ) : error ? (
              <Card className="p-6">
                <div className="text-center py-12 text-red-600">{error}</div>
              </Card>
            ) : (
              <Card className="p-6">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-gray-200">
                        <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700">Nome</th>
                        <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700">Email</th>
                        <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700">WhatsApp</th>
                        <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700">Status</th>
                        <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700">Código</th>
                        <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700">Criado em</th>
                      </tr>
                    </thead>
                    <tbody>
                      {enrollments.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="py-8 text-center text-gray-600">
                            Nenhum enrollment encontrado
                          </td>
                        </tr>
                      ) : (
                        enrollments.map((enrollment) => (
                          <tr key={enrollment.id} className="border-b border-gray-100 hover:bg-gray-50">
                            <td className="py-3 px-4 text-sm text-gray-900">{enrollment.nome}</td>
                            <td className="py-3 px-4 text-sm text-gray-600">{enrollment.email}</td>
                            <td className="py-3 px-4 text-sm text-gray-600">{enrollment.whatsapp}</td>
                            <td className="py-3 px-4">
                              <span className="inline-block px-2 py-1 rounded-full text-xs font-semibold bg-gray-100 text-gray-800">
                                {enrollment.status}
                              </span>
                            </td>
                            <td className="py-3 px-4 text-sm text-gray-600 font-mono">
                              {enrollment.trackingCode || '-'}
                            </td>
                            <td className="py-3 px-4 text-sm text-gray-600">
                              {new Date(enrollment.criadoEm).toLocaleDateString('pt-BR')}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </Card>
            )}
          </div>
        </div>
      </main>
    </>
  )
}
