'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import AdminLayout from '@/components/admin/AdminLayout'
import TableScrollArea from '@/components/admin/TableScrollArea'
import { ChevronLeft, GraduationCap, Loader2, Users } from 'lucide-react'
import SeidmannLoading from '@/components/ui/SeidmannLoading'

type ResponseRow = {
  id: string
  teacherId: string
  teacherName: string
  teacherEmail: string
  teacherStatus: string
  scorePercent: number
  passed: boolean
  correctCount: number
  wrongCount: number
  totalQuestions: number
  completedAt: string
}

type ResponsesData = {
  training: { id: string; title: string; questionCount: number }
  summary: {
    respondedCount: number
    activeTeachersCount: number
    pendingCount: number
  }
  responses: ResponseRow[]
}

export default function AdminTreinamentoRespostasPage({ params }: { params: { id: string } }) {
  const [data, setData] = useState<ResponsesData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/admin/trainings/${params.id}/responses`, {
        credentials: 'include',
      })
      const json = await res.json()
      if (!json.ok) {
        setError(json.message || 'Erro ao carregar')
        setData(null)
        return
      }
      setData(json.data)
    } catch {
      setError('Erro de rede')
      setData(null)
    } finally {
      setLoading(false)
    }
  }, [params.id])

  useEffect(() => {
    void load()
  }, [load])

  return (
    <AdminLayout>
      <div className="max-w-6xl mx-auto px-4 py-8">
        <Link
          href="/admin/treinamentos"
          className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-brand-orange mb-4"
        >
          <ChevronLeft className="w-4 h-4" />
          Voltar aos treinamentos
        </Link>

        {loading ? (
          <SeidmannLoading variant="section" className="py-16" />
        ) : error || !data ? (
          <p className="text-red-600">{error || 'Dados não encontrados'}</p>
        ) : (
          <>
            <div className="mb-6">
              <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                <Users className="w-7 h-7 text-brand-orange" />
                Respostas do treinamento
              </h1>
              <p className="text-gray-600 mt-1 flex items-center gap-2">
                <GraduationCap className="w-4 h-4 text-gray-400" />
                {data.training.title}
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-3 mb-6">
              <div className="rounded-xl border border-gray-200 bg-white p-4">
                <p className="text-sm text-gray-500">Responderam</p>
                <p className="text-2xl font-bold text-gray-900">{data.summary.respondedCount}</p>
              </div>
              <div className="rounded-xl border border-gray-200 bg-white p-4">
                <p className="text-sm text-gray-500">Professores ativos</p>
                <p className="text-2xl font-bold text-gray-900">{data.summary.activeTeachersCount}</p>
              </div>
              <div className="rounded-xl border border-gray-200 bg-white p-4">
                <p className="text-sm text-gray-500">Ainda não responderam</p>
                <p className="text-2xl font-bold text-amber-600">{data.summary.pendingCount}</p>
              </div>
            </div>

            {data.responses.length === 0 ? (
              <p className="text-gray-500 py-8">Nenhum professor respondeu este treinamento ainda.</p>
            ) : (
              <TableScrollArea>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200 text-left text-gray-500">
                      <th className="py-3 pr-4 font-medium">Professor</th>
                      <th className="py-3 pr-4 font-medium">E-mail</th>
                      <th className="py-3 pr-4 font-medium">Nota</th>
                      <th className="py-3 pr-4 font-medium">Acertos</th>
                      <th className="py-3 pr-4 font-medium">Erros</th>
                      <th className="py-3 pr-4 font-medium">Resultado</th>
                      <th className="py-3 font-medium">Respondido em</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.responses.map((row) => (
                      <tr key={row.id} className="border-b border-gray-100 hover:bg-gray-50/80">
                        <td className="py-3 pr-4 font-medium text-gray-900">
                          {row.teacherName}
                          {row.teacherStatus === 'INACTIVE' && (
                            <span className="ml-2 text-xs text-gray-400">(inativo)</span>
                          )}
                        </td>
                        <td className="py-3 pr-4 text-gray-600">{row.teacherEmail}</td>
                        <td className="py-3 pr-4">
                          <span
                            className={`font-semibold ${
                              row.scorePercent === 100
                                ? 'text-green-700'
                                : row.scorePercent >= 70
                                  ? 'text-amber-700'
                                  : 'text-red-700'
                            }`}
                          >
                            {row.scorePercent}%
                          </span>
                        </td>
                        <td className="py-3 pr-4 text-green-700 font-medium">
                          {row.correctCount}/{row.totalQuestions}
                        </td>
                        <td className="py-3 pr-4 text-red-600 font-medium">
                          {row.wrongCount}/{row.totalQuestions}
                        </td>
                        <td className="py-3 pr-4">
                          <span
                            className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${
                              row.passed
                                ? 'bg-green-100 text-green-700'
                                : 'bg-amber-100 text-amber-700'
                            }`}
                          >
                            {row.passed ? 'Aprovado' : 'Revisar'}
                          </span>
                        </td>
                        <td className="py-3 text-gray-600">
                          {new Date(row.completedAt).toLocaleString('pt-BR')}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </TableScrollArea>
            )}
          </>
        )}
      </div>
    </AdminLayout>
  )
}
